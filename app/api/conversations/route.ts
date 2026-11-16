import { listConversations } from '@/lib/conversations';
import { serverError } from '@/lib/api';

export const dynamic = 'force-dynamic';

// GET /api/conversations – a beszélgetések listája, a legutóbb használt elöl
export async function GET() {
  try {
    return Response.json({ conversations: await listConversations() });
  } catch (e) {
    return serverError('Listing conversations', e);
  }
}
