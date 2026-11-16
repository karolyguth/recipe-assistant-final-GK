import { deleteConversation, getConversation } from '@/lib/conversations';
import { jsonError, serverError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const validId = (id: string | undefined) => !!id && id.length <= 191;

// GET /api/conversations/:id – a beszélgetés az üzeneteivel (a chat ebből tölti vissza az előzményeket)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!validId(params.id)) return jsonError(400, 'Invalid conversation id.');
  try {
    const found = await getConversation(params.id);
    if (!found) return jsonError(404, `Conversation not found: ${params.id}`);
    return Response.json(found);
  } catch (e) {
    return serverError('Loading conversation', e);
  }
}

// DELETE /api/conversations/:id – az üzenetek is törlődnek (ON DELETE CASCADE)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!validId(params.id)) return jsonError(400, 'Invalid conversation id.');
  try {
    const deleted = await deleteConversation(params.id);
    if (!deleted) return jsonError(404, `Conversation not found: ${params.id}`);
    return Response.json({ id: params.id, deleted: true });
  } catch (e) {
    return serverError('Deleting conversation', e);
  }
}
