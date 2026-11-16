'use client';

import { useChat } from '@ai-sdk/react';
import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import { BarChart3, ChefHat, Loader2, Square } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { notifyConversationsChanged } from '@/components/conversation-list';
import { notifyDocumentsChanged } from '@/components/document-list';
import { FeedbackButtons } from '@/components/feedback-buttons';
import { Button } from '@/components/ui/button';

const EXAMPLE_QUESTIONS = [
  'What dessert can I make with chocolate?',
  'What can I cook if I have chicken breast at home?',
  'Any quick dinner ideas?',
  'How do I make carbonara?',
  'Which vegetarian main dishes do you recommend?',
];

// Az id a beszélgetés azonosítója: a useChat elküldi a szervernek, az ez alapján menti az üzeneteket
export function Chat({
  id,
  initialMessages,
  initialFeedback,
  onSaved,
}: {
  id: string;
  initialMessages: UIMessage[];
  initialFeedback: Record<string, 1 | -1>;
  onSaved: () => void;
}) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error, regenerate, stop } = useChat({
    id,
    messages: initialMessages,
    onFinish: ({ message }) => {
      // Új jegyzet mentésekor frissül a dokumentumlista
      if (message.parts.some(p => isToolUIPart(p) && getToolName(p) === 'addResource')) {
        notifyDocumentsChanged();
      }
      // A szerver a válasz végén menti a beszélgetést: frissül a lista és az URL
      setTimeout(() => {
        notifyConversationsChanged();
        onSaved();
      }, 300);
    },
  });

  const busy = status === 'submitted' || status === 'streaming';

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="mb-4 flex shrink-0 items-center gap-3">
        <ChefHat className="h-8 w-8 shrink-0" aria-hidden />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Recipe Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Ask about the recipes in the knowledge base: ingredients, quick ideas, techniques, substitutions.
          </p>
        </div>
        <Link href="/dashboard" className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
          <BarChart3 className="h-4 w-4" /> Monitoring
        </Link>
      </header>

      {messages.length === 0 && (
        <div className="mb-4 flex shrink-0 flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map(q => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              className="rounded-full border px-3 py-1 text-sm hover:bg-accent"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-4 md:min-h-0 md:overflow-y-auto md:pr-2">
        {messages.map((m, i) => {
          const textParts = m.parts.filter(p => p.type === 'text');
          const toolParts = m.parts.filter(isToolUIPart);
          // Értékelni csak a kész választ lehet (a még érkezőt nem)
          const rateable = m.role === 'assistant' && textParts.length > 0 && !(busy && i === messages.length - 1);

          return (
            <div
              key={m.id}
              className={
                m.role === 'user'
                  ? 'ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-lg bg-zinc-100 px-3 py-2'
                  : 'whitespace-pre-wrap break-words'
              }
            >
              <div>
                <div className="mb-1 text-sm font-bold">{m.role === 'user' ? 'You' : 'Chef'}</div>

                {/* Show text content naturally */}
                {textParts.map((part, index) => (
                  <p key={index} className="mb-2 last:mb-0">{part.text}</p>
                ))}

                {/* Show collapsible tool details */}
                {toolParts.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                      ▶ Show how I found this ({toolParts.length} tool call{toolParts.length !== 1 ? 's' : ''})
                    </summary>
                    <div className="mt-2 pl-4 border-l-2 border-gray-200 space-y-2">
                      {toolParts.map((part, index) => (
                        <div key={index} className="text-sm">
                          <p className="font-medium">
                            {part.state === 'output-available' ? 'Called' : 'Calling'}{' '}
                            {getToolName(part)}
                          </p>
                          <pre className="my-1 bg-zinc-100 p-2 rounded-sm text-xs overflow-x-auto">
                            Input: {JSON.stringify(part.input, null, 2)}
                          </pre>
                          {part.state === 'output-available' && part.output ? (
                            <pre className="my-1 bg-green-100 p-2 rounded-sm text-xs overflow-x-auto">
                              Output: {typeof part.output === 'string' ? part.output : JSON.stringify(part.output, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {rateable && (
                  <FeedbackButtons messageId={m.id} conversationId={id} initial={initialFeedback[m.id] ?? null} />
                )}
              </div>
            </div>
          );
        })}

        {/* Várakozásjelző: a gpt-5 20–30 mp-ig is gondolkodhat */}
        {status === 'submitted' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching the recipes and thinking…
          </p>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            Something went wrong while answering.{' '}
            <button className="underline" onClick={() => regenerate()}>
              Try again
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 flex shrink-0 gap-2 bg-background pb-2 pt-3"
      >
        <input
          className="min-w-0 flex-1 rounded border border-gray-300 p-2 shadow-sm disabled:bg-zinc-50"
          value={input}
          placeholder={busy ? 'Chef is answering…' : 'Ask about a recipe…'}
          aria-label="Your question"
          disabled={busy}
          onChange={e => setInput(e.currentTarget.value)}
        />
        {busy && (
          <Button type="button" variant="outline" size="icon" onClick={() => stop()} aria-label="Stop answering">
            <Square className="h-4 w-4" />
          </Button>
        )}
      </form>
    </div>
  );
}
