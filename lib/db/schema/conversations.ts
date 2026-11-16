import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { nanoid } from "@/lib/utils";

// Egy beszélgetés (session): a címe az első kérdésből készül
export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  title: text("title").notNull().default("New conversation"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Az üzenetek az AI SDK UIMessage formátumában (parts: szöveg és tool hívások), így a chat változtatás nélkül visszatölthető
export const messages = pgTable(
  "messages",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    // Beszélgetés törlésekor az üzenetei is törlődnek
    conversationId: varchar("conversation_id", { length: 191 })
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    parts: jsonb("parts").notNull(),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  table => [index("messages_conversation_idx").on(table.conversationId, table.createdAt)],
);
