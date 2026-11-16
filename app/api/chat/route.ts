import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createIdGenerator,
  streamText,
  UIMessage,
  stepCountIs,
} from 'ai';
import { saveConversation } from '@/lib/conversations';
import { EMBEDDING_MODEL, type SearchResult } from '@/lib/ai/embedding';
import { serverError } from '@/lib/api';
import { addResource, createGetInformation } from '@/lib/ai/tools';
import { emptySearchStats, recordChatMetric } from '@/lib/monitoring/metrics';
import { chatCostUsd, embeddingCostUsd } from '@/lib/monitoring/pricing';
import { env } from '@/lib/env.mjs';
import { listUserNotes } from '@/lib/documents';

// A gpt-5 többször is kereshet, ezért hosszabb az időkorlát
export const maxDuration = 60;

// Nem angol kérdések: a 2. szabály (angol keresés) és a nyelvi szabály kezeli
const SYSTEM_PROMPT = `You are "Chef", a friendly expert chef assistant for home cooks.

## Your knowledge base
- About 85 English-language home recipes from Jeff Thompson's recipe collection (Indian, Thai, Mexican, Middle Eastern, American and other dishes, sauces, breads). Each recipe starts with a summary line: "Recipe: <title> | difficulty | time | ingredients, steps".
- Personal notes the user asked you to remember (source "chat"). All of them are listed at the end of this prompt under "Saved notes about the user".
The collection is small: many well-known dishes are NOT in it.

## Your tasks
- Find and recommend recipes from the knowledge base.
- Suggest dishes based on ingredients the user has.
- Explain the cooking techniques used in the recipes.
- Suggest ingredient substitutions.

## How to answer
1. For every cooking question, call getInformation first. Never answer from memory alone.
2. The recipes are in English, so ALWAYS write the search query in English, even if the user writes in another language: turn the question into short English keywords (dish name, main ingredients, traits such as "quick", "vegetarian", "dessert").
3. If the results are weak (every rerank score below ~0.05, or not on topic), search once or twice more with different English keywords. Do not search more than 3 times for one question.
4. Always respect the saved notes about the user (listed at the end of this prompt), e.g. never recommend meat to a vegetarian. You do not need to search for them.
5. Only use recipes that the tool returned. Never invent a recipe, an ingredient or a quantity. Always name the recipe you used by its title.
6. If the requested dish is not in the collection, say so honestly, then offer 1-3 of the closest recipes that were found, explaining briefly why they are similar. Do not write the missing recipe from general knowledge. Say that a dish is missing only once per conversation; do not repeat it in later replies.
7. For substitutions and technique explanations you may add general cooking knowledge, but say clearly that it is general advice, not part of the recipe. Mention this once, briefly and naturally (e.g. "from general cooking practice"), not as a repeated disclaimer.
8. Only call addResource when the user explicitly asks you to remember something.
9. Politely decline questions unrelated to cooking and food, and steer back to recipes.

## Tone and format
- Answer in the language the user writes in (usually English), in a friendly, encouraging, concise tone. If it is not English, keep the original recipe title and add a translation in parentheses.
- Sound like a warm, experienced cook talking to this particular person, and adapt to how they write:
  - In a hurry (short, blunt messages): lead with the answer and keep it short, but still sound human: add one brief, warm touch tied to their situation (e.g. "Quick one for a busy night:" or "You'll have this on the table in 10 minutes."). No small talk, no extra alternatives, tips or offers.
  - Unsure or a beginner: reassure them, keep steps simple, tell them what "done" looks like.
  - Experienced: talk peer to peer, respect their knowledge, skip the basics they already know.
  - Disappointed (the dish is missing or the answer missed the point): acknowledge it in one genuine sentence, then move straight to the best alternative.
- Open with something specific to the user's message instead of stock phrases like "Great question!", "Love it" or "Love the plan".
- When giving a full recipe: a one-sentence intro, the ingredients as a "- " list, then numbered steps. Keep the original quantities and units.
- Use plain text lists only: no Markdown bold, italics, headings or tables.`;

// Legfeljebb 5 keresési kör, az utolsó lépés mindig a válaszé
const MAX_STEPS = 6;

// A getInformation által visszaadott receptek, ismétlés nélkül, a legjobb rerank pontszámmal
function retrievedContexts(steps: { toolResults: { toolName: string; output: unknown }[] }[]) {
  const byTitle = new Map<string, SearchResult>();
  for (const r of steps.flatMap(s => s.toolResults)) {
    if (r.toolName !== 'getInformation') continue;
    for (const hit of (r.output as { results?: SearchResult[] }).results ?? []) {
      const key = hit.title ?? hit.content.slice(0, 80);
      const prev = byTitle.get(key);
      if (!prev || (hit.rerankScore ?? hit.similarity) > (prev.rerankScore ?? prev.similarity)) byTitle.set(key, hit);
    }
  }
  return [...byTitle.values()];
}

export async function POST(req: Request) {
  // Az id a beszélgetés azonosítója (a böngésző chat küldi); nélküle (pl. evaluációs kliens) nincs mentés
  const { id, messages }: { id?: string; messages: UIMessage[] } = await req.json();

  // Időmérés a teszt riporthoz: első token és teljes idő
  const startedAt = Date.now();

  // A mentett jegyzetek mindig bekerülnek a promptba, így a modell nem hagyhatja ki őket
  const notes = await listUserNotes();
  let firstTokenMs: number | null = null;
  const lastUserText =
    messages.at(-1)?.parts.find(p => p.type === 'text')?.text.slice(0, 80) ?? '';
  const question = messages.at(-1)?.parts.find(p => p.type === 'text')?.text.slice(0, 500) ?? '';

  // Monitoring: a keresések statisztikája, és az asszisztens válasz azonosítója (ehhez kötődik majd a visszajelzés)
  const searchStats = emptySearchStats();
  const assistantMessageId = createIdGenerator({ prefix: 'msg', size: 16 })();
  const toolNames = (steps: { toolCalls: { toolName: string }[] }[]) =>
    steps.flatMap(step => step.toolCalls.map(call => call.toolName));
  const baseMetric = () => ({
    conversationId: id ?? null,
    messageId: assistantMessageId,
    model: env.CHAT_MODEL,
    question,
    firstTokenMs,
    totalMs: Date.now() - startedAt,
    searchMs: searchStats.searchMs,
    rerankMs: searchStats.rerankMs,
    embeddingTokens: searchStats.embeddingTokens,
  });

  const result = streamText({
    model: openai(env.CHAT_MODEL),
    messages: convertToModelMessages(messages),
    // A böngésző Stop gombja megszakítja a kérést: a modellhívás is leáll, és az onAbort rögzíti
    abortSignal: req.signal,
    stopWhen: stepCountIs(MAX_STEPS),
    // Az utolsó lépésben nincs tool hívás, így mindig lesz válasz
    prepareStep: ({ stepNumber }) =>
      stepNumber >= MAX_STEPS - 1 ? { toolChoice: 'none' } : undefined,
    system: `${SYSTEM_PROMPT}\n\n## Saved notes about the user\n${
      notes.length > 0 ? notes.map(note => `- ${note}`).join('\n') : '(none yet)'
    }`,
    tools: { addResource, getInformation: createGetInformation(searchStats) },
    onChunk: ({ chunk }) => {
      if (chunk.type === 'text-delta' && firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
    },
    onFinish: async ({ steps, totalUsage }) => {
      // Megszakításkor az onAbort rögzíti a kérést, itt nem számoljuk kétszer
      if (req.signal.aborted) return;
      const toolCalls = steps
        .flatMap(step => step.toolCalls)
        .map(call => `${call.toolName}(${JSON.stringify(call.input)})`);
      const usage = {
        inputTokens: totalUsage.inputTokens ?? 0,
        cachedInputTokens: totalUsage.cachedInputTokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
      };
      const costUsd =
        chatCostUsd(env.CHAT_MODEL, usage) + embeddingCostUsd(EMBEDDING_MODEL, searchStats.embeddingTokens);
      console.info(
        `[chat] model=${env.CHAT_MODEL} firstToken=${firstTokenMs ?? '-'}ms total=${Date.now() - startedAt}ms ` +
          `steps=${steps.length} tokens=${usage.inputTokens}in/${usage.outputTokens}out cost=$${costUsd.toFixed(4)} ` +
          `question="${lastUserText}" tools=[${toolCalls.join(', ')}]`,
      );
      await recordChatMetric({
        ...baseMetric(),
        status: 'ok',
        ...usage,
        reasoningTokens: totalUsage.reasoningTokens ?? 0,
        costUsd,
        steps: steps.length,
        toolCalls: toolNames(steps),
      });
    },
    onError: async ({ error }) => {
      console.error(`[chat] failed after ${Date.now() - startedAt}ms for "${lastUserText}":`, error);
      await recordChatMetric({
        ...baseMetric(),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        costUsd: embeddingCostUsd(EMBEDDING_MODEL, searchStats.embeddingTokens),
      });
    },
    // A felhasználó leállította a választ (Stop gomb)
    onAbort: async ({ steps }) => {
      await recordChatMetric({
        ...baseMetric(),
        status: 'aborted',
        costUsd: embeddingCostUsd(EMBEDDING_MODEL, searchStats.embeddingTokens),
        steps: steps.length,
        toolCalls: toolNames(steps),
      });
    },
  });

  // Nem streamelt JSON mód (Accept: application/json) az evaluációhoz és más eszközökhöz:
  // ugyanaz a modellhívás és mérés, de a válasz egyben jön, a visszakeresett receptekkel együtt
  if (req.headers.get('accept')?.includes('application/json')) {
    try {
      const [answer, steps, totalUsage] = await Promise.all([result.text, result.steps, result.totalUsage]);
      return Response.json({
        messageId: assistantMessageId,
        answer,
        contexts: retrievedContexts(steps),
        toolCalls: steps.flatMap(s => s.toolCalls.map(c => ({ tool: c.toolName, input: c.input }))),
        metrics: {
          model: env.CHAT_MODEL,
          firstTokenMs,
          totalMs: Date.now() - startedAt,
          searchMs: searchStats.searchMs,
          rerankMs: searchStats.rerankMs,
          inputTokens: totalUsage.inputTokens ?? 0,
          outputTokens: totalUsage.outputTokens ?? 0,
          embeddingTokens: searchStats.embeddingTokens,
        },
      });
    } catch (e) {
      return serverError('Answering', e);
    }
  }

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // A szerver ad azonosítót az új asszisztens üzenetnek, így mentés után is ugyanaz marad
    generateMessageId: () => assistantMessageId,
    onFinish: async ({ messages: all }) => {
      if (!id) return;
      try {
        await saveConversation(id, all);
      } catch (e) {
        console.error(`[chat] saving conversation ${id} failed:`, e);
      }
    },
  });
}
