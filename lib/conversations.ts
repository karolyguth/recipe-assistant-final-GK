import type { UIMessage } from 'ai';
import { asc, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema/conversations';
import { feedbackFor } from '@/lib/feedback';

// Service réteg a beszélgetésekhez: a chat végpont menti, az API listázza, betölti és törli őket

const TITLE_MAX = 60;

function titleFrom(uiMessages: UIMessage[]): string {
  const first = uiMessages.find(m => m.role === 'user')?.parts.find(p => p.type === 'text');
  const text = first && 'text' in first ? first.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) return 'New conversation';
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text;
}

export async function listConversations() {
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
      messageCount: sql<number>`(select count(*)::int from messages m where m.conversation_id = ${conversations}.id)`,
    })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));
}

export async function getConversation(id: string) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conversation) return null;
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  const uiMessages = rows.map(r => ({ id: r.id, role: r.role, parts: r.parts }) as UIMessage);
  // A korábbi 👍 / 👎 értékelések is visszatöltődnek
  const ratings = await feedbackFor(uiMessages.filter(m => m.role === 'assistant').map(m => m.id));
  return { conversation, messages: uiMessages, feedback: ratings };
}

// A teljes beszélgetést menti a válasz végén: új beszélgetést létrehoz, a meglévő üzeneteket frissíti
export async function saveConversation(id: string, uiMessages: UIMessage[]) {
  const now = new Date();
  await db.transaction(async tx => {
    await tx
      .insert(conversations)
      .values({ id, title: titleFrom(uiMessages), createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: conversations.id, set: { updatedAt: now } });
    // A sorrend megmarad: minden üzenet egy kicsit későbbi időbélyeget kap
    for (const [i, m] of uiMessages.entries()) {
      await tx
        .insert(messages)
        .values({ id: m.id, conversationId: id, role: m.role, parts: m.parts, createdAt: new Date(now.getTime() - (uiMessages.length - i)) })
        .onConflictDoUpdate({ target: messages.id, set: { parts: m.parts } });
    }
  });
}

export async function deleteConversation(id: string): Promise<boolean> {
  const deleted = await db.delete(conversations).where(eq(conversations.id, id)).returning({ id: conversations.id });
  return deleted.length > 0;
}
