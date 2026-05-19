import { createFlow, defineEvent, requestStep } from 'logic-flow';
import { z } from 'zod';

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };

    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    signal?.addEventListener('abort', handleAbort, { once: true });
  });

const cancelPublish = defineEvent('CANCEL', {});
const publishFailed = defineEvent('FAILED', { message: z.string() });
const publishSucceeded = defineEvent('PUBLISHED', {});

export const publishingFlow = createFlow({
  name: 'publishing-demo',
  context: z.object({
    title: z.string(),
    requiresLegalReview: z.boolean(),
    error: z.string().optional(),
    notice: z.string().optional(),
    published: z.boolean(),
  }),
  states: ['draft', 'review', 'publishing', 'published'] as const,
  initial: 'draft',
  initialContext: {
    title: 'New workflow runtime',
    requiresLegalReview: true,
    published: false,
  },
})
  .step('draft', ({ on, states }) => [
    on('CHANGE_TITLE', { value: z.string() }, ({ event, update }) => {
      update({ title: event.value, error: undefined, notice: undefined, published: false });
    }),

    on('TOGGLE_LEGAL_REVIEW', {}, ({ ctx, update }) => {
      update({ requiresLegalReview: !ctx.requiresLegalReview, notice: undefined });
    }),

    on('SUBMIT', {}, [states.review, states.publishing], ({ ctx, goto, update }) => {
      if (ctx.title.trim().length < 6) {
        update({ error: 'Title must be at least 6 characters.', notice: undefined });
      } else {
        update({ error: undefined, notice: undefined, published: false });
        goto(ctx.requiresLegalReview ? states.review : states.publishing);
      }
    }),
  ])
  .step('review', ({ on, states }) =>
    on('APPROVE', {}, states.publishing, ({ goto, update }) => {
      update({ error: undefined, notice: undefined });
      goto(states.publishing);
    }),
  )
  .step('publishing', (api) => [
    ...requestStep(api, {
      run: ({ effect }) =>
        effect('publishRequest', async (signal) => {
          await wait(1000, signal);
        }),
      success: {
        event: publishSucceeded,
        target: api.states.published,
        handle: ({ goto, update }) => {
          update({ published: true, error: undefined, notice: 'Publish finished.' });
          goto(api.states.published);
        },
      },
      failure: {
        event: publishFailed,
        target: api.states.draft,
        mapError: () => ({ message: 'Publish request failed.' }),
        handle: ({ event, goto, update }) => {
          update({ error: event.message, notice: undefined });
          goto(api.states.draft);
        },
      },
    }),
    api.on(cancelPublish, api.states.draft, ({ goto, update }) => {
      update({ error: undefined, notice: 'Publishing cancelled.' });
      goto(api.states.draft);
    }),
  ])
  .step('published', ({ enter, states }) =>
    enter(states.draft, ({ schedule }) => {
      schedule(1500, ({ goto, update }) => {
        update({ published: false, notice: undefined });
        goto(states.draft);
      });
    }),
  );
