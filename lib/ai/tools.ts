import { tool } from 'ai';
import { z } from 'zod';
import { createResource } from '@/lib/actions/resources';
import { findRelevantContent } from '@/lib/ai/embedding';

export const addResource = tool({
  description: `Save a personal note about the user to the knowledge base, so it can be used in later conversations.
    Only use this tool when the user explicitly asks you to remember something
    (e.g. "remember that...", "jegyezd meg, hogy..."), such as a dietary preference, an allergy, or their own recipe.
    Do NOT use it for questions, for ingredients the user merely mentions,
    or for information that came from the getInformation tool.`,
  inputSchema: z.object({
    content: z
      .string()
      .describe(
        'the fact to remember, as a short self-contained English sentence about the user, e.g. "The user is vegetarian."',
      ),
  }),
  execute: async ({ content }) => createResource({ content }),
});

export const getInformation = tool({
  description: `get information from your knowledge base to answer questions.
    Returns the most relevant entries with their title, source ("upload" = a recipe document,
    "chat" = a note the user asked you to remember), a vector similarity score and a rerank score
    (0-1, how well the entry answers the question; the results are ordered by it).`,
  inputSchema: z.object({
    question: z.string().describe('the users question'),
  }),
  execute: async ({ question }) => findRelevantContent(question),
});
