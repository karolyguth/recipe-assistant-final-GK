'use client';

import type { UIMessage } from 'ai';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Chat } from '@/components/chat';
import { ConversationList } from '@/components/conversation-list';
import { DocumentList } from '@/components/document-list';
import { DocumentUpload } from '@/components/document-upload';
import { nanoid } from '@/lib/utils';

// Az aktív beszélgetés azonosítója az URL-ben (?c=...), így újratöltés után is ugyanaz a beszélgetés nyílik meg
function setUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('c', id);
  else url.searchParams.delete('c');
  window.history.replaceState(null, '', url);
}

type Active = { id: string; messages: UIMessage[]; feedback: Record<string, 1 | -1> };

export function Workspace() {
  const [active, setActive] = useState<Active | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const startNew = useCallback(() => {
    setActive({ id: nanoid(), messages: [], feedback: {} });
    setUrl(null);
  }, []);

  const open = useCallback(
    async (id: string) => {
      setLoadingId(id);
      try {
        const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setActive({ id, messages: body.messages, feedback: body.feedback ?? {} });
        setUrl(id);
      } catch (e) {
        toast.error(`Could not open the conversation: ${e instanceof Error ? e.message : 'unknown error'}`);
        startNew();
      } finally {
        setLoadingId(null);
      }
    },
    [startNew],
  );

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('c');
    if (id) open(id);
    else startNew();
  }, [open, startNew]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:h-screen md:flex-row md:overflow-hidden">
      <section className="order-1 flex min-h-[85vh] flex-1 flex-col md:order-2 md:min-h-0">
        {active && !loadingId ? (
          // A key miatt beszélgetésváltáskor a chat állapota tisztán újraindul
          <Chat
            key={active.id}
            id={active.id}
            initialMessages={active.messages}
            initialFeedback={active.feedback}
            onSaved={() => setUrl(active.id)}
          />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the conversation…
          </p>
        )}
      </section>
      <aside className="order-2 space-y-4 md:order-1 md:w-80 md:shrink-0 md:overflow-y-auto lg:w-96">
        <ConversationList
          activeId={active?.id ?? ''}
          onSelect={id => id !== active?.id && open(id)}
          onNew={startNew}
          onDeleted={id => id === active?.id && startNew()}
        />
        <DocumentUpload />
        <DocumentList />
      </aside>
    </main>
  );
}
