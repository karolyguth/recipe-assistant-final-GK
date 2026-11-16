// Alkalmazás szintű értékelés: teljes felhasználói utak szimulált felhasználókkal (a 4. heti szimulátor továbbfejlesztve).
//   - szimulált user (gpt-4.1-mini): perszóna, cél, sikerkritériumok, seedelt véletlengenerátorral sorsolt tulajdonságok,
//     LLM által generált nyitó üzenet, minden válasz után strukturált döntés (elégedettség 1-5, folytatja-e, következő üzenet)
//   - az asszisztens a valódi chat végponton válaszol (JSON mód), így a teljes rendszer mérve van: keresés, rerank, tool hívások
//   - LLM-as-a-Judge (gpt-4.1) beszélgetésenként egyszer: segítőkészség, megalapozottság, hangnem (0-3), cél teljesülése
//   - latencia: első token és teljes válaszidő minden körben
//   - izoláció: a beszélgetések egymás után futnak, a mentett jegyzetek és a feltöltött tesztrecept a végén törlődnek
// Futtatás (az app fusson): pnpm eval:app
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { SCENARIOS, type Range, type Scenario } from './data/app-scenarios';
import { API_BASE, askAssistant, removeChatNotes, type AssistantReply, type Turn } from './lib/assistant';
import { cachedObject, JUDGE_MODEL } from './lib/llm';
import { mean, round } from './lib/retrieval-metrics';

const USER_MODEL = 'gpt-4.1-mini';
const RESULTS_DIR = path.join(__dirname, 'results');
const RUN_TAG = process.env.EVAL_RUN ?? 'run1'; // más címkével új beszélgetések készülnek (a cache kulcs része)

// ---------- szimulált user ----------

type User = {
  scenario: Scenario;
  patience: number;
  expertise: number;
  verbosity: number;
  frustrationTolerance: number;
};

// Determinisztikus véletlengenerátor (mulberry32): ugyanaz az eset mindig ugyanazt a felhasználót adja
function seededRandom(seedText: string) {
  let seed = 0;
  for (const ch of seedText) seed = (Math.imul(31, seed) + ch.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleUser(scenario: Scenario): User {
  const rand = seededRandom(scenario.id);
  const between = ([min, max]: Range) => +(min + (max - min) * rand()).toFixed(2);
  return {
    scenario,
    patience: Math.round(between(scenario.patience)),
    expertise: between(scenario.expertise),
    verbosity: between(scenario.verbosity),
    frustrationTolerance: between(scenario.frustrationTolerance),
  };
}

// A türelem dönti el, legfeljebb hány asszisztens választ vár meg a felhasználó
const maxTurnsFor = (patience: number) => (patience <= 2 ? 2 : patience === 3 ? 3 : 4);
const level = (v: number, low: string, high: string) => (v < 0.3 ? low : v > 0.7 ? high : 'moderate');

function userSystemPrompt(u: User) {
  const s = u.scenario;
  return [
    'You are role-playing a user of a recipe assistant chatbot. Stay in character; never mention that you are simulated.',
    `Persona: ${s.persona}`,
    `Your goal: ${s.goal}`,
    `Success criteria for your goal:\n${s.successCriteria.map(c => `- ${c}`).join('\n')}`,
    'Your traits:',
    `- Patience: ${u.patience}/5 (${u.patience <= 2 ? 'very impatient, wants quick answers' : u.patience >= 4 ? 'patient, willing to ask follow-ups' : 'moderate'})`,
    `- Cooking expertise: ${u.expertise} (${level(u.expertise, 'novice', 'expert')})`,
    `- Verbosity: ${u.verbosity} (${level(u.verbosity, 'very short messages', 'longer messages with context')})`,
    `- Frustration tolerance: ${u.frustrationTolerance} (${level(u.frustrationTolerance, 'gets frustrated quickly', 'stays calm when answers miss')})`,
    'Write the way this person would write and behave consistently with these traits.',
  ].join('\n');
}

const turnSchema = z.object({
  satisfaction: z.number().int().min(1).max(5).describe('How satisfied you are with the conversation so far (1-5)'),
  goalAchieved: z.boolean().describe('Are all success criteria of your goal met?'),
  continue: z.boolean().describe('false if you are done (satisfied or giving up)'),
  message: z.string().describe('Your next message to the assistant; empty string if you do not continue'),
  reason: z.string().describe('One sentence: why you continue or stop'),
});
type UserTurn = z.infer<typeof turnSchema>;

async function openingMessage(u: User) {
  const { message } = await cachedObject({
    model: USER_MODEL,
    schema: z.object({ message: z.string() }),
    system: userSystemPrompt(u),
    prompt: 'Write the first message you send to the recipe assistant to start working towards your goal.',
    temperature: 0.9,
    cacheKey: `app-opening:${u.scenario.id}:${RUN_TAG}`,
  });
  return message;
}

async function nextUserTurn(u: User, history: Turn[], turn: number, maxTurns: number): Promise<UserTurn> {
  const transcript = history.map(m => `${m.role === 'user' ? 'YOU' : 'ASSISTANT'}: ${m.content}`).join('\n\n');
  return cachedObject({
    model: USER_MODEL,
    schema: turnSchema,
    system: userSystemPrompt(u),
    prompt: [
      `Conversation so far (assistant reply ${turn} of at most ${maxTurns}):`,
      transcript,
      '',
      "React to the assistant's last message naturally: ask a follow-up, push back, or end the conversation.",
      'End it (continue=false) when your success criteria are met or when you have lost patience.',
      turn >= maxTurns ? 'This was the last reply you are willing to wait for: set continue=false and give your final satisfaction.' : '',
    ].join('\n'),
    temperature: 0.7,
    cacheKey: `app-turn:${u.scenario.id}:${RUN_TAG}:${turn}`,
  });
}

// ---------- előkészítés: feltöltött tesztrecept ----------

async function uploadDocument(fileName: string, content: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/markdown' }), fileName);
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(`Upload failed: ${body.error}`);
  const processed = await fetch(`${API_BASE}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: body.id }),
  });
  if (!processed.ok) throw new Error(`Processing failed: HTTP ${processed.status}`);
  return body.id;
}

// ---------- egy beszélgetés ----------

type Conversation = {
  scenario: Scenario;
  user: Omit<User, 'scenario'>;
  maxTurns: number;
  messages: Turn[];
  replies: AssistantReply['metrics'][];
  retrieved: string[][];
  userTurns: UserTurn[];
};

async function simulate(scenario: Scenario): Promise<Conversation> {
  const u = sampleUser(scenario);
  const maxTurns = maxTurnsFor(u.patience);
  const history: Turn[] = [];
  const replies: AssistantReply['metrics'][] = [];
  const retrieved: string[][] = [];
  const userTurns: UserTurn[] = [];
  let message = await openingMessage(u);

  for (let turn = 1; turn <= maxTurns; turn++) {
    history.push({ role: 'user', content: message });
    const reply = await askAssistant(history);
    history.push({ role: 'assistant', content: reply.answer });
    replies.push(reply.metrics);
    retrieved.push(reply.contexts.map(c => c.title ?? '?'));
    const decision = await nextUserTurn(u, history, turn, maxTurns);
    userTurns.push(decision);
    console.log(`  ${scenario.id} turn ${turn}: ${(reply.metrics.totalMs / 1000).toFixed(1)} s, satisfaction ${decision.satisfaction}`);
    if (!decision.continue || !decision.message.trim()) break;
    message = decision.message;
  }
  const { scenario: _, ...traits } = u;
  return { scenario, user: traits, maxTurns, messages: history, replies, retrieved, userTurns };
}

// ---------- értékelés ----------

const judgeSchema = z.object({
  helpfulness: z.number().int().min(0).max(3).describe('Does the assistant move the user towards the goal with useful, actionable answers?'),
  groundedness: z.number().int().min(0).max(3).describe('Are recipes, ingredients and quantities taken from the collection (or clearly labelled general advice), without inventions?'),
  tone: z.number().int().min(0).max(3).describe('Is the tone friendly and adapted to this user?'),
  goalAchieved: z.boolean().describe('Were ALL success criteria met by the end of the conversation?'),
  criteriaMet: z.array(z.boolean()).describe('One entry per success criterion, in order'),
  reasoning: z.string().describe('2-4 sentences citing concrete parts of the conversation'),
});
type Verdict = z.infer<typeof judgeSchema>;

const JUDGE_SYSTEM = `You are a strict, consistent evaluator of conversations with a recipe assistant (a RAG chatbot over a small recipe collection).
Score on 0-3 integer scales (3 = excellent, 2 = good with minor issues, 1 = weak, 0 = failing):
- helpfulness: concrete, correct, actionable help towards the user's goal; follow-up questions answered.
- groundedness: recipes, ingredients and quantities come from the collection (the recipes retrieved in each turn are listed);
  general cooking advice is fine if it is labelled as such; inventing recipes or quantities is a failure.
- tone: friendly, natural and adapted to how this user writes (reassuring for a nervous user, brief for an impatient one).
Then decide for each success criterion whether it was met, and whether the goal was achieved overall (all criteria met).`;

async function judge(c: Conversation): Promise<Verdict> {
  const transcript = c.messages
    .map((m, i) =>
      m.role === 'user'
        ? `USER: ${m.content}`
        : `ASSISTANT (retrieved: ${c.retrieved[Math.floor(i / 2)].join(', ') || 'nothing'}): ${m.content}`,
    )
    .join('\n\n');
  return cachedObject({
    model: JUDGE_MODEL,
    schema: judgeSchema,
    system: JUDGE_SYSTEM,
    prompt: `User persona: ${c.scenario.persona}\nUser goal: ${c.scenario.goal}\nSuccess criteria:\n${c.scenario.successCriteria
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n')}\n\nConversation:\n${transcript}`,
    temperature: 0,
  });
}

// Percentilis (nearest-rank módszer)
const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] : 0;
};

async function main() {
  mkdirSync(path.join(RESULTS_DIR, 'app-conversations'), { recursive: true });
  const rows: { c: Conversation; v: Verdict }[] = [];

  for (const scenario of SCENARIOS) {
    await removeChatNotes();
    const uploadedId = scenario.upload ? await uploadDocument(scenario.upload.fileName, scenario.upload.content) : null;
    try {
      const c = await simulate(scenario);
      const v = await judge(c);
      rows.push({ c, v });
      writeFileSync(path.join(RESULTS_DIR, 'app-conversations', `${scenario.id}.json`), JSON.stringify({ ...c, verdict: v }, null, 2));
      console.log(`  ${scenario.id}: goal ${v.goalAchieved ? 'ok' : 'NOT MET'}, help ${v.helpfulness} grounded ${v.groundedness} tone ${v.tone}`);
    } finally {
      // Izoláció: a beszélgetés mentett jegyzetei és a feltöltött tesztrecept törlődnek
      await removeChatNotes();
      if (uploadedId) await fetch(`${API_BASE}/documents/${uploadedId}`, { method: 'DELETE' });
    }
  }

  const allReplies = rows.flatMap(r => r.c.replies);
  const firstTokens = allReplies.map(r => r.firstTokenMs).filter((x): x is number => x !== null);
  const totals = allReplies.map(r => r.totalMs);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const s = (ms: number) => (ms / 1000).toFixed(1);
  const summary = {
    conversations: rows.length,
    turns: allReplies.length,
    goal: mean(rows.map(r => (r.v.goalAchieved ? 1 : 0))),
    criteria: mean(rows.flatMap(r => r.v.criteriaMet.map(x => (x ? 1 : 0)))),
    helpfulness: round(mean(rows.map(r => r.v.helpfulness)), 2),
    groundedness: round(mean(rows.map(r => r.v.groundedness)), 2),
    tone: round(mean(rows.map(r => r.v.tone)), 2),
    satisfaction: round(mean(rows.map(r => r.c.userTurns.at(-1)!.satisfaction)), 2),
    firstTokenP50: percentile(firstTokens, 0.5),
    firstTokenP95: percentile(firstTokens, 0.95),
    totalP50: percentile(totals, 0.5),
    totalP95: percentile(totals, 0.95),
    costTokens: allReplies.reduce((a, r) => a + r.inputTokens + r.outputTokens, 0),
  };

  const md = [
    '# Alkalmazás szintű értékelés (teljes felhasználói utak)',
    '',
    `${rows.length} komplex teszteset, összesen ${allReplies.length} asszisztens válasz. Szimulált user: ${USER_MODEL}, értékelő: ${JUDGE_MODEL} (temperature 0, beszélgetésenként egy hívás).`,
    'Az asszisztens a valódi chat végponton válaszolt; a válaszidők a végpont saját méréséből származnak.',
    '',
    '## Összesítés',
    '',
    '| Metrika | Érték |',
    '|---|---|',
    `| Cél teljesítése (judge, minden kritérium) | ${pct(summary.goal)} |`,
    `| Teljesült sikerkritériumok | ${pct(summary.criteria)} |`,
    `| Segítőkészség (0-3) | ${summary.helpfulness} |`,
    `| Megalapozottság / nincs kitalált recept (0-3) | ${summary.groundedness} |`,
    `| Hangnem (0-3) | ${summary.tone} |`,
    `| Szimulált elégedettség (1-5) | ${summary.satisfaction} |`,
    `| Első token, medián / p95 | ${s(summary.firstTokenP50)} s / ${s(summary.firstTokenP95)} s |`,
    `| Teljes válaszidő, medián / p95 | ${s(summary.totalP50)} s / ${s(summary.totalP95)} s |`,
    `| Chat tokenek összesen | ${summary.costTokens.toLocaleString('en')} |`,
    '',
    '## Esetenként',
    '',
    '| Eset | Körök | Cél | Kritériumok | Segítőkész | Megalapozott | Hangnem | Elégedettség | Átl. válaszidő (s) | Indoklás |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(({ c, v }) => {
      const met = v.criteriaMet.filter(Boolean).length;
      return `| ${c.scenario.title} (\`${c.scenario.id}\`) | ${c.replies.length} | ${v.goalAchieved ? '✅' : '❌'} | ${met}/${c.scenario.successCriteria.length} | ${v.helpfulness} | ${v.groundedness} | ${v.tone} | ${c.userTurns.at(-1)!.satisfaction} | ${s(mean(c.replies.map(r => r.totalMs)))} | ${v.reasoning.replace(/\|/g, '/')} |`;
    }),
    '',
    'A teljes beszélgetések: `eval/results/app-conversations/`.',
    '',
  ].join('\n');
  writeFileSync(path.join(RESULTS_DIR, 'app.md'), md);
  writeFileSync(path.join(RESULTS_DIR, 'app.json'), JSON.stringify({ summary, cases: rows.map(({ c, v }) => ({ id: c.scenario.id, verdict: v, satisfaction: c.userTurns.at(-1)!.satisfaction, replies: c.replies })) }, null, 2));
  console.log(`\n${JSON.stringify(summary)}\nResults: eval/results/app.md`);
  process.exit(0);
}

main();
