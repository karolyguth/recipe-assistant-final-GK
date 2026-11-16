// Becsült árak USD-ben, 1 millió tokenre (OpenAI árlista szerint; ha változik, itt kell frissíteni)
type Price = { input: number; cachedInput: number; output: number };

export const CHAT_PRICES: Record<string, Price> = {
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
};

export const EMBEDDING_PRICES: Record<string, number> = {
  "text-embedding-3-small": 0.02,
  "text-embedding-3-large": 0.13,
};

const PER_TOKEN = 1 / 1_000_000;

// A cache-elt input tokenek olcsóbbak, ezért külön számolódnak; ismeretlen modellnél 0 (a dashboard jelzi)
export function chatCostUsd(
  model: string,
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
): number {
  const price = CHAT_PRICES[model];
  if (!price) return 0;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    (uncached * price.input + usage.cachedInputTokens * price.cachedInput + usage.outputTokens * price.output) * PER_TOKEN
  );
}

export function embeddingCostUsd(model: string, tokens: number): number {
  return (EMBEDDING_PRICES[model] ?? 0) * tokens * PER_TOKEN;
}
