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

const embeddingModel = openai.embedding("text-embedding-3-small");

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

export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll("\n", " ");
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  return embedding;
};
// Két lépcsős keresés: a pgvector SEARCH_CANDIDATES jelöltet ad, a cross-encoder ezekből választja ki a legjobb SEARCH_TOP_K-t
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

export type SearchOptions = { rerank?: boolean; candidates?: number; topK?: number };

const round = (n: number) => Math.round(n * 1000) / 1000;

export const findRelevantContent = async (
  userQuery: string,
  { rerank = true, candidates = SEARCH_CANDIDATES, topK = SEARCH_TOP_K }: SearchOptions = {},
) => {
  const userQueryEmbedded = await generateEmbedding(userQuery);
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

  // Reranking: a jelölteket a cross-encoder pontszáma szerint rendezzük újra
  if (rerank) {
    const scores = await rerankScores(userQuery, results.map((r) => r.content));
    results = results
      .map((r, i) => ({ ...r, rerankScore: round(scores[i]) }))
      .sort((a, b) => b.rerankScore! - a.rerankScore!)
      .slice(0, topK);
  }
  return { results };
};
