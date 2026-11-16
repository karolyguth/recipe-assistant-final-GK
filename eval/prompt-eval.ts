// Prompt szintű (single-turn) értékelés: egy kérdés -> az élő asszisztens válasza (JSON mód) -> LLM-as-a-Judge.
// Mért szempontok (0-3, indoklással): kontextus relevancia, hűség a kontextushoz (hallucináció), válasz relevancia,
// és az elvárt viselkedés teljesülése (pl. hiányzó ételnél nem talál ki receptet).
// Helyesség a kurzus módszerével (single_turn_evaluation.py): a választ a ground truth válasszal veti össze (CORRECT / INCORRECT).
// Futtatás (az app fusson: pnpm dev):
//   pnpm eval:prompt            -> kérdések + értékelés
//   pnpm eval:prompt --rejudge  -> csak újraértékelés a mentett válaszokon
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { askAssistant, removeChatNotes, type AssistantReply } from './lib/assistant';
import { cachedObject, JUDGE_MODEL } from './lib/llm';
import { mean, round } from './lib/retrieval-metrics';

const RESULTS_DIR = path.join(__dirname, 'results');
const ANSWERS_FILE = path.join(RESULTS_DIR, 'prompt-answers.json');

type Case = { id: string; category: string; question: string; expected: string; reference: string };

const verdictSchema = z.object({
  contextRelevance: z.number().int().min(0).max(3).describe('How relevant the retrieved recipes are to the question'),
  contextReasoning: z.string().describe('One sentence'),
  faithfulness: z.number().int().min(0).max(3).describe('How well the answer is supported by the retrieved recipes'),
  unsupportedClaims: z
    .array(z.string())
    .describe('Concrete claims (recipes, ingredients, quantities, times) that are NOT supported by the retrieved recipes AND are presented as if they came from the collection. Do NOT list statements the answer explicitly labels as general cooking knowledge / general practice. Empty if none.'),
  answerRelevance: z.number().int().min(0).max(3).describe('How directly and completely the answer addresses the question'),
  expectedBehavior: z.boolean().describe('Did the assistant do what the expected behavior describes?'),
  reasoning: z.string().describe('2-3 sentences explaining the scores, citing the answer'),
});
type Verdict = z.infer<typeof verdictSchema>;

// A kurzus CORRECTNESS_JUDGE_PROMPT-ja, strukturált kimenettel
const correctnessSchema = z.object({
  reasoning: z
    .string()
    .describe('What key information was present or missing, contradictions, with concrete examples from the ground truth and the response'),
  decision: z.enum(['CORRECT', 'INCORRECT']),
});
type Correctness = z.infer<typeof correctnessSchema>;

const CORRECTNESS_SYSTEM = `You are an expert evaluator. Your task is to evaluate whether a generated response is correct by comparing it with the ground truth answer.
Evaluate if the generated response is factually correct and contains the same information as the ground truth.
Consider the response correct if:
1. It contains the key information from the ground truth
2. It doesn't contradict the ground truth
3. It provides accurate information even if phrased differently`;

async function judgeCorrectness(c: Case, reply: AssistantReply): Promise<Correctness> {
  return cachedObject({
    model: JUDGE_MODEL,
    schema: correctnessSchema,
    system: CORRECTNESS_SYSTEM,
    prompt: `Ground Truth: ${c.reference}\nGenerated Response: ${reply.answer}`,
    temperature: 0,
  });
}

const JUDGE_SYSTEM = `You are a strict, consistent evaluator of a recipe assistant built on retrieval-augmented generation (RAG).
The assistant may only use recipes from its collection (the retrieved recipes below). For techniques and substitutions it may add
general cooking knowledge if it clearly says so (e.g. "from general cooking practice").

Score on 0-3 integer scales:
- contextRelevance: 3 = the retrieved recipes are exactly what the question needs; 2 = mostly relevant; 1 = only loosely related; 0 = irrelevant or nothing retrieved.
  If the requested dish does not exist in the collection, judge whether the retrieved recipes are the closest sensible alternatives.
- faithfulness: 3 = every concrete claim (recipe names, ingredients, quantities, times, steps) is supported by the retrieved recipes or clearly labelled as general advice;
  2 = one minor unsupported detail; 1 = several unsupported details; 0 = an invented recipe or invented quantities presented as from the collection.
  Polite refusals and statements that something is missing count as faithful.
- answerRelevance: 3 = directly and completely answers (or correctly declines); 2 = answers with gaps or padding; 1 = partly off; 0 = does not answer.
List every unsupported claim in unsupportedClaims. A non-empty list means hallucination.
Statements explicitly labelled as general advice (e.g. "from general cooking practice", "not in the original recipe") are allowed by the
assistant's rules: they are NOT hallucinations and must not be listed, but they must not contradict the recipe.
Keep faithfulness and unsupportedClaims consistent: a score of 3 means unsupportedClaims is empty.`;

function contextBlock(reply: AssistantReply) {
  if (reply.contexts.length === 0) return '(no recipes were retrieved)';
  return reply.contexts.map((c, i) => `[${i + 1}] ${c.title} (rerank ${c.rerankScore ?? '-'})\n${c.content}`).join('\n\n---\n\n');
}

async function judge(c: Case, reply: AssistantReply): Promise<Verdict> {
  return cachedObject({
    model: JUDGE_MODEL,
    schema: verdictSchema,
    system: JUDGE_SYSTEM,
    prompt: `Question: ${c.question}\n\nExpected behavior: ${c.expected}\n\nRetrieved recipes:\n${contextBlock(reply)}\n\nAssistant answer:\n${reply.answer}`,
    temperature: 0,
  });
}

async function main() {
  const rejudge = process.argv.includes('--rejudge');
  const { cases } = JSON.parse(readFileSync(path.join(__dirname, 'data/prompt-cases.json'), 'utf8')) as { cases: Case[] };
  mkdirSync(RESULTS_DIR, { recursive: true });

  const answers: Record<string, AssistantReply> = rejudge && existsSync(ANSWERS_FILE) ? JSON.parse(readFileSync(ANSWERS_FILE, 'utf8')) : {};
  if (!rejudge) {
    await removeChatNotes();
    for (const c of cases) {
      answers[c.id] = await askAssistant([{ role: 'user', content: c.question }]);
      await removeChatNotes();
      console.log(`  ${c.id} answered in ${(answers[c.id].metrics.totalMs / 1000).toFixed(1)} s`);
      writeFileSync(ANSWERS_FILE, JSON.stringify(answers, null, 2));
    }
  }

  const rows: { c: Case; reply: AssistantReply; v: Verdict; ok: Correctness }[] = [];
  for (const c of cases) {
    const reply = answers[c.id];
    const [v, ok] = await Promise.all([judge(c, reply), judgeCorrectness(c, reply)]);
    rows.push({ c, reply, v, ok });
    console.log(
      `  ${c.id} ${c.category.padEnd(13)} ${ok.decision.padEnd(9)} ctx ${v.contextRelevance} faith ${v.faithfulness} rel ${v.answerRelevance} expected ${v.expectedBehavior ? 'ok' : 'FAIL'}${v.unsupportedClaims.length ? '  HALLUCINATION' : ''}`,
    );
  }

  const agg = (rs: typeof rows) => ({
    n: rs.length,
    correct: round(mean(rs.map(r => (r.ok.decision === 'CORRECT' ? 1 : 0))), 2),
    context: round(mean(rs.map(r => r.v.contextRelevance)), 2),
    faithfulness: round(mean(rs.map(r => r.v.faithfulness)), 2),
    relevance: round(mean(rs.map(r => r.v.answerRelevance)), 2),
    expected: round(mean(rs.map(r => (r.v.expectedBehavior ? 1 : 0))), 2),
    hallucination: round(mean(rs.map(r => (r.v.unsupportedClaims.length ? 1 : 0))), 2),
    seconds: round(mean(rs.map(r => r.reply.metrics.totalMs / 1000)), 1),
  });
  const line = (name: string, a: ReturnType<typeof agg>) =>
    `| ${name} | ${a.n} | ${Math.round(a.correct * 100)}% | ${a.context} | ${a.faithfulness} | ${a.relevance} | ${Math.round(a.expected * 100)}% | ${Math.round(a.hallucination * 100)}% | ${a.seconds} |`;
  const categories = [...new Set(cases.map(c => c.category))];
  const total = agg(rows);

  const md = [
    '# Prompt szintű értékelés (single-turn)',
    '',
    `${cases.length} teszteset, az élő asszisztens (${rows[0].reply.metrics.model}) válaszai a chat végpont JSON módjából.`,
    `Értékelő: ${JUDGE_MODEL} (LLM-as-a-Judge, temperature 0), esetenként két hívás: helyesség a ground truth válaszhoz képest (a kurzus módszere), és egy hívás a többi szempontra. Skálák 0-3; hallucináció = a judge legalább egy, a visszakeresett receptekkel nem alátámasztott és általános tanácsként sem jelölt állítást talált.`,
    '',
    '## Összesítés',
    '',
    '| Kategória | Esetek | Helyes (ground truth) | Kontextus relevancia | Hűség (faithfulness) | Válasz relevancia | Elvárt viselkedés | Hallucináció | Válaszidő (s) |',
    '|---|---|---|---|---|---|---|---|---|',
    ...categories.map(cat => line(cat, agg(rows.filter(r => r.c.category === cat)))),
    line('**Összesen**', total),
    '',
    '## Esetenként',
    '',
    '| Eset | Kérdés | Visszakeresett receptek | Helyes | Kontextus | Hűség | Relevancia | Elvárt | Indoklás |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      ({ c, reply, v, ok }) =>
        `| ${c.id} | ${c.question} | ${reply.contexts.map(x => x.title).join(', ') || '–'} | ${ok.decision === 'CORRECT' ? '✅' : `❌ ${ok.reasoning.replace(/\|/g, '/')}`} | ${v.contextRelevance} | ${v.faithfulness} | ${v.answerRelevance} | ${v.expectedBehavior ? '✅' : '❌'} | ${v.reasoning.replace(/\|/g, '/')}${v.unsupportedClaims.length ? ` **Nem alátámasztott:** ${v.unsupportedClaims.join('; ').replace(/\|/g, '/')}` : ''} |`,
    ),
    '',
  ].join('\n');
  writeFileSync(path.join(RESULTS_DIR, 'prompt.md'), md);
  writeFileSync(path.join(RESULTS_DIR, 'prompt.json'), JSON.stringify(rows.map(({ c, v, ok, reply }) => ({ ...c, answer: reply.answer, contexts: reply.contexts.map(x => x.title), metrics: reply.metrics, correctness: ok, verdict: v })), null, 2));
  console.log(`\n${JSON.stringify(total)}\nResults: eval/results/prompt.md`);
  process.exit(0);
}

main();
