'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

type Rating = 1 | -1 | null;

// 👍 / 👎 egy asszisztens válasz alatt; 👎 után opcionálisan megírható, mi volt a baj
export function FeedbackButtons({
  messageId,
  conversationId,
  initial,
}: {
  messageId: string;
  conversationId: string;
  initial: Rating;
}) {
  const [rating, setRating] = useState<Rating>(initial);
  const [askComment, setAskComment] = useState(false);
  const [comment, setComment] = useState('');

  const send = async (next: Rating, note?: string) => {
    const previous = rating;
    setRating(next);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, conversationId, rating: next, comment: note ?? null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch {
      setRating(previous);
      toast.error('Could not save your feedback. Please try again.');
      return false;
    }
  };

  // Ugyanarra a gombra újra kattintva a visszajelzés visszavonható
  const click = async (value: 1 | -1) => {
    const next = rating === value ? null : value;
    const ok = await send(next);
    setAskComment(ok && next === -1);
    if (ok && next === 1) toast.success('Thanks for the feedback!');
  };

  return (
    <div className="mt-2 text-sm">
      <div className="flex items-center gap-1 text-muted-foreground">
        <span className="mr-1 text-xs">Was this helpful?</span>
        <button
          type="button"
          onClick={() => click(1)}
          aria-pressed={rating === 1}
          aria-label="Helpful"
          className={cn('rounded p-1 hover:bg-zinc-100', rating === 1 && 'bg-green-100 text-green-800')}
        >
          <ThumbsUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => click(-1)}
          aria-pressed={rating === -1}
          aria-label="Not helpful"
          className={cn('rounded p-1 hover:bg-zinc-100', rating === -1 && 'bg-red-100 text-red-800')}
        >
          <ThumbsDown className="h-4 w-4" />
        </button>
      </div>
      {askComment && (
        <form
          className="mt-2 flex max-w-md gap-2"
          onSubmit={async e => {
            e.preventDefault();
            if (await send(-1, comment.trim())) {
              setAskComment(false);
              toast.success('Thanks, this helps us improve Chef.');
            }
          }}
        >
          <input
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="What went wrong? (optional)"
            aria-label="What went wrong?"
            value={comment}
            maxLength={1000}
            onChange={e => setComment(e.currentTarget.value)}
          />
          <button type="submit" className="rounded border px-2 py-1 text-sm hover:bg-zinc-100">
            Send
          </button>
        </form>
      )}
    </div>
  );
}
