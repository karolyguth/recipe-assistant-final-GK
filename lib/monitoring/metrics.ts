import { db } from "@/lib/db";
import { chatMetrics } from "@/lib/db/schema/metrics";

export type ChatMetric = typeof chatMetrics.$inferInsert;

// A mérés mentése nem akaszthatja meg a választ: hiba esetén csak naplózunk
export async function recordChatMetric(metric: ChatMetric) {
  try {
    await db.insert(chatMetrics).values(metric);
  } catch (e) {
    console.error("[monitoring] saving metric failed:", e);
  }
}

// Egy kérés keresési statisztikái: a getInformation tool gyűjti hívásonként
export type SearchStats = {
  searches: number;
  embeddingTokens: number;
  searchMs: number;
  rerankMs: number;
  rerankInputTokens: number;
  rerankOutputTokens: number;
};
export const emptySearchStats = (): SearchStats => ({
  searches: 0,
  embeddingTokens: 0,
  searchMs: 0,
  rerankMs: 0,
  rerankInputTokens: 0,
  rerankOutputTokens: 0,
});
