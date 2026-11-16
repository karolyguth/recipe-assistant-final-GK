// RAG szintű értékelés: precision@k, recall@k, MRR és hit@1 a tesztkészleten, több beállítással.
//   - chunkolás: receptenként egy chunk (éles) / fix 800 karakteres darabok / "##" szekciónként
//   - embedding modell: text-embedding-3-small / text-embedding-3-large (éles)
//   - reranking: nincs / LLM reranker (gpt-4.1-mini, éles)
//   - élő rendszer: a pgvector + reranking ugyanazzal a kóddal, amit a chat használ
// Futtatás: pnpm eval:rag   (az embeddingek az eval/.cache mappába kerülnek, újrafuttatáskor nem fizetünk újra)
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';

import { chunkDocument, extractTitle } from '@/lib/ai/chunking';
import { findRelevantContent } from '@/lib/ai/embedding';
import { extractRecipeMetadata, formatRecipeHeader } from '@/lib/ai/recipe-metadata';
import { RERANK_MODEL, rerankScores } from '@/lib/ai/rerank';
import { dedupe, mean, precisionAt, recallAt, reciprocalRank, round } from './lib/retrieval-metrics';

const ROOT = path.resolve(__dirname, '..');
const RECIPES_DIR = path.join(ROOT, 'data/recipes/recipes');
const CACHE_DIR = path.join(__dirname, '.cache');
const RESULTS_DIR = path.join(__dirname, 'results');
const K = 4; // az éles rendszer is 4 receptet ad a modellnek
const CANDIDATES = 20; // ennyi jelöltet kap a reranker
const LIST = 10; // ennyi receptig számoljuk a reciprok rangot

type Case = { id: string; type: string; query: string; relevant: string[] };
type Chunk = { recipe: string; text: string };
type Strategy = 'recipe' | 'fixed' | 'section';
type Variant = {
  id: string;
  label: string;
  strategy: Strategy;
  model: 'text-embedding-3-small' | 'text-embedding-3-large';
  rerank: boolean;
  live?: boolean;
};

const VARIANTS: Variant[] = [
  { id: 'recipe-small', label: 'Receptenként, 3-small, rerank nélkül', strategy: 'recipe', model: 'text-embedding-3-small', rerank: false },
  { id: 'fixed-small', label: 'Fix 800 karakter, 3-small, rerank nélkül', strategy: 'fixed', model: 'text-embedding-3-small', rerank: false },
  { id: 'section-small', label: 'Szekciónként, 3-small, rerank nélkül', strategy: 'section', model: 'text-embedding-3-small', rerank: false },
  { id: 'recipe-large', label: 'Receptenként, 3-large, rerank nélkül', strategy: 'recipe', model: 'text-embedding-3-large', rerank: false },
  { id: 'recipe-small-rerank', label: `Receptenként, 3-small, LLM rerank (${RERANK_MODEL})`, strategy: 'recipe', model: 'text-embedding-3-small', rerank: true },
  { id: 'recipe-large-rerank', label: `Receptenként, 3-large, LLM rerank (${RERANK_MODEL}) – éles`, strategy: 'recipe', model: 'text-embedding-3-large', rerank: true },
  { id: 'live', label: 'Élő rendszer: pgvector + LLM rerank (a chat kódja)', strategy: 'recipe', model: 'text-embedding-3-large', rerank: true, live: true },
];

// ---------- chunkolási stratégiák ----------

function loadRecipes() {
  return readdirSync(RECIPES_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => ({ recipe: f.replace(/\.md$/, ''), fileName: f, content: readFileSync(path.join(RECIPES_DIR, f), 'utf8') }));
}

function chunksFor(strategy: Strategy, recipes: ReturnType<typeof loadRecipes>): Chunk[] {
  return recipes.flatMap(({ recipe, fileName, content }) => {
    if (strategy === 'recipe') {
      // Ugyanaz, mint az élő feldolgozás (lib/ai/embedding.ts): összefoglaló sor + a recept
      const header = formatRecipeHeader(extractRecipeMetadata(content, fileName));
      return chunkDocument(content, fileName).map(c => ({ recipe, text: header ? `${header}\n\n${c}` : c }));
    }
    if (strategy === 'fixed') {
      // Szerkezettől független darabolás: 800 karakter, 150 karakter átfedéssel
      const text = content.replace(/\r\n/g, '\n').trim();
      const out: Chunk[] = [];
      for (let i = 0; i < text.length; i += 650) out.push({ recipe, text: text.slice(i, i + 800) });
      return out;
    }
    // Szekciónként (hozzávalók, lépések, megjegyzések...), mindegyik elé a recept címe
    const title = extractTitle(content, fileName) ?? recipe;
    return content
      .split(/\n(?=##\s)/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => ({ recipe, text: s.startsWith('# ') ? s : `# ${title}\n\n${s}` }));
  });
}

// ---------- embedding, fájl cache-sel ----------

async function embedAll(model: Variant['model'], texts: string[]): Promise<number[][]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const key = createHash('sha256').update(model + '\n' + texts.join('\n\u0000\n')).digest('hex').slice(0, 24);
  const file = path.join(CACHE_DIR, `emb-${model}-${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const { embeddings } = await embedMany({ model: openai.embedding(model), values: texts.slice(i, i + 100) });
    out.push(...embeddings);
  }
  writeFileSync(file, JSON.stringify(out));
  return out;
}

// A reranker hívásai is cache-elve: újrafuttatáskor ugyanazt a pontozást kapjuk, és nem fizetünk újra
async function cachedRerank(query: string, docs: string[]): Promise<number[]> {
  const key = createHash('sha256').update([RERANK_MODEL, query, ...docs].join('\n\u0000\n')).digest('hex').slice(0, 24);
  const file = path.join(CACHE_DIR, `rerank-${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const { scores } = await rerankScores(query, docs);
  writeFileSync(file, JSON.stringify(scores));
  return scores;
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
};

// ---------- egy beállítás futtatása ----------

type CaseResult = { id: string; ranked: string[]; p: number; r: number; rr: number; hit1: number; ms: number };

async function runVariant(v: Variant, cases: Case[], recipes: ReturnType<typeof loadRecipes>): Promise<CaseResult[]> {
  const score = (c: Case, ranked: string[], ms: number): CaseResult => ({
    id: c.id,
    ranked: ranked.slice(0, LIST),
    p: precisionAt(ranked, c.relevant, K),
    r: recallAt(ranked, c.relevant, K),
    rr: reciprocalRank(ranked.slice(0, LIST), c.relevant),
    hit1: c.relevant.includes(ranked[0]) ? 1 : 0,
    ms,
  });

  if (v.live) {
    const out: CaseResult[] = [];
    for (const c of cases) {
      const started = Date.now();
      const { results } = await findRelevantContent(c.query, { topK: LIST });
      out.push(score(c, dedupe(results.map(r => (r.fileName ?? '').replace(/\.md$/, ''))), Date.now() - started));
    }
    return out;
  }

  const chunks = chunksFor(v.strategy, recipes);
  const chunkVectors = await embedAll(v.model, chunks.map(c => c.text));
  const queryVectors = await embedAll(v.model, cases.map(c => c.query));
  const out: CaseResult[] = [];
  for (const [i, c] of cases.entries()) {
    const started = Date.now();
    let order = chunks
      .map((chunk, j) => ({ chunk, score: cosine(queryVectors[i], chunkVectors[j]) }))
      .sort((a, b) => b.score - a.score);
    if (v.rerank) {
      const top = order.slice(0, CANDIDATES);
      const scores = await cachedRerank(c.query, top.map(t => t.chunk.text));
      // Egyenlő pontnál a vektoros sorrend marad (stabil rendezés)
      order = top.map((t, j) => ({ ...t, score: scores[j] })).sort((a, b) => b.score - a.score);
    }
    out.push(score(c, dedupe(order.map(o => o.chunk.recipe)), Date.now() - started));
  }
  return out;
}

// ---------- összesítés és riport ----------

function summarize(results: CaseResult[]) {
  return {
    precision: round(mean(results.map(r => r.p))),
    recall: round(mean(results.map(r => r.r))),
    mrr: round(mean(results.map(r => r.rr))),
    hit1: round(mean(results.map(r => r.hit1))),
    ms: Math.round(mean(results.map(r => r.ms))),
  };
}

async function main() {
  // Kézzel írt kérdések (pontos és tág) + LLM által generált kérdések receptenként (a kurzus módszere)
  const load = (f: string) => (JSON.parse(readFileSync(path.join(__dirname, 'data', f), 'utf8')) as { cases: Case[] }).cases;
  const cases = [...load('rag-golden.json'), ...load('rag-generated.json')];
  const recipes = loadRecipes();
  const known = new Set(recipes.map(r => r.recipe));
  for (const c of cases) for (const r of c.relevant) if (!known.has(r)) throw new Error(`${c.id}: unknown recipe ${r}`);

  const all: Record<string, CaseResult[]> = {};
  for (const v of VARIANTS) {
    process.stdout.write(`${v.id.padEnd(26)} `);
    all[v.id] = await runVariant(v, cases, recipes);
    const s = summarize(all[v.id]);
    console.log(`P@${K} ${s.precision}  R@${K} ${s.recall}  MRR ${s.mrr}  hit@1 ${s.hit1}  ${s.ms} ms`);
  }

  const specific = cases.filter(c => c.type !== 'broad' && c.type !== 'generated');
  const broad = cases.filter(c => c.type === 'broad');
  const generated = cases.filter(c => c.type === 'generated');
  const pick = (id: string, subset: Case[]) => all[id].filter(r => subset.some(c => c.id === r.id));
  const row = (v: Variant, subset: Case[]) => {
    const s = summarize(pick(v.id, subset));
    return `| ${v.label} | ${s.precision} | ${s.recall} | ${s.mrr} | ${s.hit1} | ${s.ms} |`;
  };
  const header = `| Beállítás | P@${K} | R@${K} | MRR | Hit@1 | Idő / kérdés (ms) |\n|---|---|---|---|---|---|`;
  const chunkCounts = (['recipe', 'fixed', 'section'] as Strategy[]).map(s => `${s}: ${chunksFor(s, recipes).length}`).join(', ');

  // Hibák: ahol az éles beállításnál a releváns recept nem az első
  const prod = 'recipe-large-rerank';
  const misses = cases
    .map((c, i) => ({ c, r: all[prod][i] }))
    .filter(({ r }) => r.rr < 1)
    .map(({ c, r }) => `| ${c.id} | ${c.query} | ${c.relevant.join(', ')} | ${r.ranked.slice(0, K).join(', ')} |`);

  const md = [
    '# RAG szintű értékelés',
    '',
    `${cases.length} teszteset (${specific.length} pontos és ${broad.length} tág kézzel írt kérdés, ${generated.length} LLM által generált kérdés receptenként), ${recipes.length} recept. Chunkok száma: ${chunkCounts}.`,
    `Metrikák receptszinten: P@${K} és R@${K} (az éles rendszer ${K} receptet ad a modellnek), MRR (az első releváns recept helye, ${LIST}-ig), Hit@1.`,
    'Az idő oszlop: a memóriabeli LLM rerank változatoknál a reranker válaszai cache-ből jönnek; a valós keresési idő (embedding + pgvector + LLM rerank) az élő rendszer sorában látszik.',
    `A pontos kérdéseknek 1-2 releváns receptje van, ezért ott a P@${K} felső korlátja kb. 0,3; a tág kérdéseknél 2-5 recept is jó, ott a P@${K} is beszédes.`,
    '',
    '## Összes kérdés',
    '',
    header,
    ...VARIANTS.map(v => row(v, cases)),
    '',
    '## Pontos kérdések (egy konkrét étel vagy technika)',
    '',
    header,
    ...VARIANTS.map(v => row(v, specific)),
    '',
    '## Tág kérdések (több recept is jó válasz)',
    '',
    header,
    ...VARIANTS.map(v => row(v, broad)),
    '',
    '## Generált kérdések (receptenként egy, a kurzus rag_level_evaluation módszerével)',
    '',
    header,
    ...VARIANTS.map(v => row(v, generated)),
    '',
    `## Ahol az éles beállításnál a releváns recept nem az első helyen van`,
    '',
    `| Eset | Kérdés | Releváns | Első ${K} találat |`,
    '|---|---|---|---|',
    ...misses,
    '',
  ].join('\n');

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(path.join(RESULTS_DIR, 'rag.md'), md);
  writeFileSync(path.join(RESULTS_DIR, 'rag.json'), JSON.stringify({ k: K, candidates: CANDIDATES, variants: VARIANTS, cases, results: all }, null, 2));
  console.log('\nResults: eval/results/rag.md, eval/results/rag.json');
  process.exit(0);
}

main();
