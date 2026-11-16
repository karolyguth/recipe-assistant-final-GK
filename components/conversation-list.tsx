'use client';

import { Loader2, MessageSquarePlus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Ezzel jelzi a chat, ha egy beszélgetés elmentődött (új cím, frissebb időpont)
const CONVERSATIONS_CHANGED = 'conversations-changed';
export function notifyConversationsChanged() {
  window.dispatchEvent(new Event(CONVERSATIONS_CHANGED));
}

type ConversationItem = { id: string; title: string; updatedAt: string; messageCount: number };

const timeFormat = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ConversationList({
  activeId,
  onSelect,
  onNew,
  onDeleted,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
}) {
  const [items, setItems] = useState<ConversationItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setItems(body.conversations);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load conversations');
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(CONVERSATIONS_CHANGED, load);
    return () => window.removeEventListener(CONVERSATIONS_CHANGED, load);
  }, [load]);

  const handleDelete = async (c: ConversationItem) => {
    if (!window.confirm(`Delete the conversation "${c.title}"?`)) return;
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      onDeleted(c.id);
      await load();
    } catch (e) {
      toast.error(`Could not delete the conversation: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Conversations</h2>
        <Button variant="outline" size="sm" onClick={onNew}>
          <MessageSquarePlus className="mr-1 h-4 w-4" /> New chat
        </Button>
      </div>

      {loadError && (
        <p className="text-sm text-red-700">
          Could not load the conversations: {loadError}{' '}
          <button className="underline" onClick={load}>
            Try again
          </button>
        </p>
      )}

      {!items && !loadError && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      )}

      {items && items.length === 0 && (
        <p className="text-sm text-muted-foreground">No saved conversations yet. Ask Chef something to start one.</p>
      )}

      {items && items.length > 0 && (
        <ul className="max-h-[30vh] space-y-1 overflow-y-auto">
          {items.map(c => (
            <li key={c.id} className={cn('flex items-center gap-1 rounded-md', c.id === activeId && 'bg-zinc-100')}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className="min-w-0 flex-1 px-2 py-1.5 text-left"
                aria-current={c.id === activeId ? 'true' : undefined}
              >
                <p className="truncate text-sm font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground">
                  {timeFormat.format(new Date(c.updatedAt))} · {c.messageCount} message{c.messageCount !== 1 ? 's' : ''}
                </p>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => handleDelete(c)}
                disabled={busyId !== null}
                aria-label={`Delete conversation ${c.title}`}
              >
                {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
