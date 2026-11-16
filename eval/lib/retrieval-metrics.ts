// Visszakeresési metrikák receptszinten: a rangsor a receptek sorrendje (egy recept csak egyszer számít,
// akkor is, ha több chunkja is találat)

export type RankedRecipes = string[];

export function precisionAt(ranked: RankedRecipes, relevant: string[], k: number) {
  return ranked.slice(0, k).filter(r => relevant.includes(r)).length / k;
}

export function recallAt(ranked: RankedRecipes, relevant: string[], k: number) {
  return ranked.slice(0, k).filter(r => relevant.includes(r)).length / relevant.length;
}

// Reciprok rang: 1 / az első releváns recept helye (0, ha nincs a listában)
export function reciprocalRank(ranked: RankedRecipes, relevant: string[]) {
  const i = ranked.findIndex(r => relevant.includes(r));
  return i < 0 ? 0 : 1 / (i + 1);
}

export function dedupe(recipes: string[]): RankedRecipes {
  return [...new Set(recipes)];
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
