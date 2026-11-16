import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { cosineDistance, desc, eq, gt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { embeddings, resources } from "@/lib/db/schema/resources";
import { chunkDocument } from "@/lib/ai/chunking";
import { rerankScores } from "@/lib/ai/rerank";
import {
  extractRecipeMetadata,
  formatRecipeHeader,
} from "@/lib/ai/recipe-metadata";

// A RAG szintű értékelésben a 3-large adta a legjobb találatokat
export const EMBEDDING_MODEL = "text-embedding-3-large";
export const EMBEDDING_DIMENSIONS = 3072;
const embeddingModel = openai.embedding(EMBEDDING_MODEL);

export const generateEmbeddings = async (
  value: string,
  fileName?: string,
): Promise<Array<{ embedding: number[]; content: string }>> => {
  let chunks = chunkDocument(value, fileName);
  if (chunks.length === 0)
    throw new Error("The document is empty, nothing to embed.");

  // Receptek: összefoglaló sor (cím, nehézség, idő) a chunk elé
  if (fileName && /\.md$/i.test(fileName)) {
    const header = formatRecipeHeader(extractRecipeMetadata(value, fileName));
    if (header) chunks = chunks.map((chunk) => `${header}\n\n${chunk}`);
  }
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });
  return embeddings.map((e, i) => ({ content: chunks[i], embedding: e }));
};

export const generateEmbedding = async (value: string): Promise<number[]> =>
  (await embedQuery(value)).embedding;

// A token használatot is visszaadja a monitoringhoz
const embedQuery = async (value: string) => {
  const input = value.replaceAll("\n", " ");
  const { embedding, usage } = await embed({
    model: embeddingModel,
    value: input,
  });
  return { embedding, tokens: usage?.tokens ?? 0 };
};
// Két lépcsős keresés: a pgvector SEARCH_CANDIDATES jelöltet ad, az LLM reranker ezekből választja ki a legjobb SEARCH_TOP_K-t
export const SEARCH_CANDIDATES = 20;
export const SEARCH_TOP_K = 4;
export const SEARCH_MIN_SIMILARITY = 0.3;

export type SearchResult = {
  title: string | null;
  fileName: string | null;
  source: "upload" | "chat";
  similarity: number;
  rerankScore: number | null;
  content: string;
};

// Egy keresés mérései a monitoringhoz
export type SearchTiming = {
  embeddingTokens: number;
  searchMs: number;
  rerankMs: number;
  rerankInputTokens: number;
  rerankOutputTokens: number;
};

export type SearchOptions = {
  rerank?: boolean;
  candidates?: number;
  topK?: number;
  onStats?: (stats: SearchTiming) => void;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

export const findRelevantContent = async (
  userQuery: string,
  { rerank = true, candidates = SEARCH_CANDIDATES, topK = SEARCH_TOP_K, onStats }: SearchOptions = {},
) => {
  const started = Date.now();
  let rerankMs = 0;
  let rerankInputTokens = 0;
  let rerankOutputTokens = 0;
  const { embedding: userQueryEmbedded, tokens } = await embedQuery(userQuery);
  const report = () =>
    onStats?.({ embeddingTokens: tokens, searchMs: Date.now() - started, rerankMs, rerankInputTokens, rerankOutputTokens });
  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded,
  )})`;
  const rows = await db
    .select({
      title: resources.title,
      fileName: resources.fileName,
      source: resources.source,
      similarity,
      content: embeddings.content,
    })
    .from(embeddings)
    .innerJoin(resources, eq(embeddings.resourceId, resources.id))
    .where(gt(similarity, SEARCH_MIN_SIMILARITY))
    .orderBy((t) => desc(t.similarity))
    .limit(rerank ? candidates : topK);

  if (rows.length === 0) {
    report();
    return {
      results: [],
      message: "No relevant information found in the knowledge base.",
    };
  }

  let results: SearchResult[] = rows.map((row) => ({
    ...row,
    similarity: round(Number(row.similarity)),
    rerankScore: null,
  }));

  // Reranking: a jelölteket az LLM pontszáma szerint rendezzük újra; egyenlő pontnál a vektoros sorrend marad
  if (rerank) {
    const rerankStarted = Date.now();
    const reranked = await rerankScores(userQuery, results.map((r) => r.content));
    rerankMs = Date.now() - rerankStarted;
    rerankInputTokens = reranked.inputTokens;
    rerankOutputTokens = reranked.outputTokens;
    const scores = reranked.scores;
    results = results
      .map((r, i) => ({ ...r, rerankScore: round(scores[i]) }))
      .sort((a, b) => b.rerankScore! - a.rerankScore!)
      .slice(0, topK);
  }
  report();
  return { results };
};
