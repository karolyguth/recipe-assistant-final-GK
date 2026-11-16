import { eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { feedback } from '@/lib/db/schema/feedback';

export type Rating = 1 | -1;

// Egy válaszra egy visszajelzés: újabb kattintás felülírja (pl. 👍 -> 👎)
export async function saveFeedback(input: { messageId: string; conversationId?: string | null; rating: Rating; comment?: string | null }) {
  const now = new Date();
  await db
    .insert(feedback)
    .values({ ...input, comment: input.comment || null, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: feedback.messageId,
      set: { rating: input.rating, comment: input.comment || null, updatedAt: now },
    });
}

export async function removeFeedback(messageId: string) {
  await db.delete(feedback).where(eq(feedback.messageId, messageId));
}

// A beszélgetés betöltésekor a korábbi értékelések is megjelennek
export async function feedbackFor(messageIds: string[]): Promise<Record<string, Rating>> {
  if (messageIds.length === 0) return {};
  const rows = await db
    .select({ messageId: feedback.messageId, rating: feedback.rating })
    .from(feedback)
    .where(inArray(feedback.messageId, messageIds));
  return Object.fromEntries(rows.map(r => [r.messageId, r.rating as Rating]));
}
