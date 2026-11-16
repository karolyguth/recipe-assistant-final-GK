import 'dotenv/config';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import type { z } from 'zod';

// Fájl alapú cache az értékelő (judge) és a szimulált user hívásaihoz: azonos prompt + modell esetén nincs új API hívás
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'llm');

export const JUDGE_MODEL = 'gpt-4.1';

export async function cachedObject<T extends z.ZodTypeAny>(options: {
  model: string;
  schema: T;
  system: string;
  prompt: string;
  temperature: number;
  cacheKey?: string;
}): Promise<z.infer<T>> {
  const hash = createHash('sha256')
    .update(JSON.stringify([options.model, options.system, options.prompt, options.temperature, options.cacheKey ?? '']))
    .digest('hex');
  const file = path.join(CACHE_DIR, `${hash}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const { object } = await generateObject({
    model: openai(options.model),
    schema: options.schema,
    system: options.system,
    prompt: options.prompt,
    temperature: options.temperature,
  });
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(object, null, 2));
  return object;
}
