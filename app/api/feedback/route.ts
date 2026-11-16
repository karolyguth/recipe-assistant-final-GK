import { z } from 'zod';

import { jsonError, serverError } from '@/lib/api';
import { removeFeedback, saveFeedback } from '@/lib/feedback';

const bodySchema = z.object({
  messageId: z.string().min(1).max(191),
  conversationId: z.string().max(191).nullish(),
  // null: a visszajelzés visszavonása
  rating: z.union([z.literal(1), z.literal(-1), z.null()]),
  comment: z.string().max(1000).nullish(),
});

// POST /api/feedback – 👍 / 👎 egy asszisztens válaszra
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Invalid feedback: messageId and rating (1, -1 or null) are required.');
  const { messageId, conversationId, rating, comment } = parsed.data;
  try {
    if (rating === null) await removeFeedback(messageId);
    else await saveFeedback({ messageId, conversationId, rating, comment: comment?.trim() });
    return Response.json({ messageId, rating });
  } catch (e) {
    return serverError('Saving feedback', e);
  }
}
