// Generált RAG tesztkérdések a kurzus módszerével (week-4 rag_level_evaluation.py): minden recepthez egy LLM ír
// egy valószerű felhasználói kérdést, és a keresésnek ezt a receptet kell visszaadnia.
// Futtatás: pnpm eval:generate-rag   -> eval/data/rag-generated.json (verziókezelve, így a mérés megismételhető)
import 'dotenv/config';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { cachedObject } from './lib/llm';

const RECIPES_DIR = path.resolve(__dirname, '..', 'data/recipes/recipes');
const GENERATOR_MODEL = 'gpt-4.1-mini';

// A kurzus DEFAULT_QUERY_GENERATOR_PROMPT-ja, dokumentum helyett receptre
const PROMPT = `You are helping to evaluate a RAG (Retrieval-Augmented Generation) system.
Given a recipe, generate a realistic user query that someone might ask when looking for information contained in this recipe.

Requirements:
- The query should be natural and realistic (how a real user would ask)
- The query should be answerable by the provided recipe
- Keep queries concise (1-2 sentences maximum)
- Focus on the main topics or key information in the recipe
- Return only the query, no additional text`;

async function main() {
  const files = readdirSync(RECIPES_DIR).filter(f => f.endsWith('.md')).sort();
  const cases = [];
  for (const f of files) {
    const recipe = f.replace(/\.md$/, '');
    const { query } = await cachedObject({
      model: GENERATOR_MODEL,
      schema: z.object({ query: z.string() }),
      system: PROMPT,
      prompt: `Recipe:\n${readFileSync(path.join(RECIPES_DIR, f), 'utf8')}`,
      temperature: 0.7,
      cacheKey: `rag-query:${recipe}`,
    });
    // A két pereces recept ugyanarra az ételre vonatkozik, ezért egymás találatai is helyesek
    const relevant = recipe.startsWith('soft-pretzels') ? ['soft-pretzels-1', 'soft-pretzels-2'] : [recipe];
    cases.push({ id: `g-${recipe}`, type: 'generated', query, relevant });
    process.stdout.write(`\r  ${cases.length} / ${files.length}`);
  }
  const out = {
    description: `LLM által generált kérdések (${GENERATOR_MODEL}), receptenként egy, a kurzus rag_level_evaluation.py módszerével.`,
    cases,
  };
  writeFileSync(path.join(__dirname, 'data/rag-generated.json'), JSON.stringify(out, null, 2));
  console.log(`\nWrote ${cases.length} queries to eval/data/rag-generated.json`);
  process.exit(0);
}

main();
