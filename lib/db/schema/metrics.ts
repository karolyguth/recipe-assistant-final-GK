import { sql } from "drizzle-orm";
import { doublePrecision, index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { nanoid } from "@/lib/utils";

export const requestStatuses = ["ok", "error", "aborted"] as const;

// Kérésenkénti monitoring adatok a chat végpontról: ebből dolgozik a dashboard
export const chatMetrics = pgTable(
  "chat_metrics",
  {
    id: varchar("id", { length: 191 })
      .primaryKey()
      .$defaultFn(() => nanoid()),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    // Nincs idegen kulcs: a beszélgetés törlése után is megmaradnak a mérések
    conversationId: varchar("conversation_id", { length: 191 }),
    messageId: varchar("message_id", { length: 191 }),
    model: varchar("model", { length: 100 }).notNull(),
    question: text("question").notNull(),
    status: varchar("status", { length: 20, enum: requestStatuses }).notNull(),
    error: text("error"),
    // Tokenek: a chat modellé (a reasoning tokenek az outputban is benne vannak) és a keresések embeddingjéé
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    embeddingTokens: integer("embedding_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    // Időzítések ezredmásodpercben
    firstTokenMs: integer("first_token_ms"),
    totalMs: integer("total_ms").notNull(),
    searchMs: integer("search_ms").notNull().default(0),
    rerankMs: integer("rerank_ms").notNull().default(0),
    steps: integer("steps").notNull().default(0),
    toolCalls: jsonb("tool_calls").$type<string[]>().notNull().default([]),
  },
  table => [index("chat_metrics_created_idx").on(table.createdAt)],
);
