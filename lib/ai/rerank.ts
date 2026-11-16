import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// Reranking LLM-mel: a vektoros keresés jelöltjeit egy olcsó modell pontozza aszerint, mennyire válaszolnak a kérdésre.
// API hívás, így nem terheli a gépet (a helyi cross-encoder a mérésben rontott, és a CPU-t is terhelte).
export const RERANK_MODEL = "gpt-4.1-mini";
// Jelöltenként ennyi karaktert kap a modell: az összefoglaló sor és a hozzávalók eleje elég a döntéshez
const RERANK_MAX_CHARS = 700;

const schema = z.object({
  scores: z
    .array(z.object({ index: z.number().int(), score: z.number().min(0).max(10) }))
    .describe("one entry per candidate"),
});

export type RerankResult = { scores: number[]; inputTokens: number; outputTokens: number };

// Relevancia pontszám 0 és 1 között minden dokumentumra, a bemenet sorrendjében
export async function rerankScores(
  query: string,
  documents: string[],
  model: string = RERANK_MODEL,
): Promise<RerankResult> {
  if (documents.length === 0) return { scores: [], inputTokens: 0, outputTokens: 0 };
  const candidates = documents
    .map((d, i) => `[${i}] ${d.slice(0, RERANK_MAX_CHARS).replace(/\s+/g, " ")}`)
    .join("\n\n");
  const { object, usage } = await generateObject({
    model: openai(model),
    schema,
    temperature: 0,
    system:
      "You rank recipe search results. For each candidate, score from 0 to 10 how well it answers the search query " +
      "(10 = exactly the dish or technique asked for, 5 = related, 0 = unrelated). The query can be in any language.",
    prompt: `Search query: ${query}\n\nCandidates:\n${candidates}`,
  });
  const scores = documents.map(() => 0);
  for (const { index, score } of object.scores) if (index >= 0 && index < scores.length) scores[index] = score / 10;
  return { scores, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 };
}
