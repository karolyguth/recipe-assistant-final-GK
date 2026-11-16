import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { nanoid } from "@/lib/utils";

// Felhasználói visszajelzés egy asszisztens válaszra: +1 (hasznos) vagy -1 (nem hasznos), opcionális megjegyzéssel.
// A message_id ugyanaz, mint a chat_metrics sorában, így a visszajelzés a kérés méréseivel együtt elemezhető.
export const feedback = pgTable("feedback", {
  id: varchar("id", { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  messageId: varchar("message_id", { length: 191 }).notNull().unique(),
  conversationId: varchar("conversation_id", { length: 191 }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});
