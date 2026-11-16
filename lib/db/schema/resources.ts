import { sql } from "drizzle-orm";
import {
  text,
  varchar,
  timestamp,
  pgTable,
  vector,
  jsonb,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { nanoid } from "@/lib/utils";

export const resourceSources = ["upload", "chat"] as const;
export type ResourceSource = (typeof resourceSources)[number];

// Feldolgozási állapotok: uploaded -> processing -> processed | failed
export const resourceStatuses = [
  "uploaded",
  "processing",
  "processed",
  "failed",
] as const;
export type ResourceStatus = (typeof resourceStatuses)[number];

export const resources = pgTable("resources", {
  id: varchar("id", { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  content: text("content").notNull(),
  fileName: varchar("file_name", { length: 255 }),
  title: text("title"),
  source: varchar("source", { length: 20, enum: resourceSources })
    .notNull()
    .default("upload"),
  status: varchar("status", { length: 20, enum: resourceStatuses })
    .notNull()
    .default("uploaded"),
  error: text("error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const embeddings = pgTable("embeddings", {
  id: varchar("id", { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  // Dokumentum törlésekor a chunkjai is törlődnek
  resourceId: varchar("resource_id", { length: 191 })
    .notNull()
    .references(() => resources.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  // text-embedding-3-large
  embedding: vector("embedding", { dimensions: 3072 }).notNull(),
});

export const insertResourceSchema = createSelectSchema(resources).pick({
  content: true,
});

// Type for resources - used to type API request params and within Components
export type NewResourceParams = z.infer<typeof insertResourceSchema>;
