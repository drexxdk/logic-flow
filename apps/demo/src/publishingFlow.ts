import { createFlow } from 'logic-flow';
import { z } from 'zod';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const publishingFlow = createFlow({
  name: 'publishing-demo',
  context: z.object({
    title: z.string(),
    requiresLegalReview: z.boolean(),
    error: z.string().optional(),
    published: z.boolean(),
  }),
  events: {
    CHANGE_TITLE: z.object({ type: z.literal('CHANGE_TITLE'), value: z.string() }),
    TOGGLE_LEGAL_REVIEW: z.object({ type: z.literal('TOGGLE_LEGAL_REVIEW') }),
    SUBMIT: z.object({ type: z.literal('SUBMIT') }),
    APPROVE: z.object({ type: z.literal('APPROVE') }),
    PUBLISHED: z.object({ type: z.literal('PUBLISHED') }),
    FAILED: z.object({ type: z.literal('FAILED'), message: z.string() }),
  },
  states: ['draft', 'review', 'publishing', 'published'] as const,
  initial: 'draft',
  initialContext: {
    title: 'New workflow runtime',
    requiresLegalReview: true,
    published: false,
  },
})
  .step('draft', ({ on }) => {
    on('CHANGE_TITLE', ({ event, update }) => {
      update({ title: event.value, error: undefined, published: false });
    });

    on('TOGGLE_LEGAL_REVIEW', ({ ctx, update }) => {
      update({ requiresLegalReview: !ctx.requiresLegalReview });
    });

    on('SUBMIT', ({ ctx, goto, update }) => {
      if (ctx.title.trim().length < 6) {
        update({ error: 'Title must be at least 6 characters.' });
        return;
      }

      if (ctx.requiresLegalReview) {
        goto('review');
        return;
      }

      goto('publishing');
    });
  })
  .step('review', ({ on }) => {
    on('APPROVE', ({ goto }) => {
      goto('publishing');
    });
  })
  .step('publishing', ({ enter, on }) => {
    enter(async ({ dispatch, effect }) => {
      try {
        await effect('publishRequest', async () => {
          await wait(1000);
        });
        await dispatch({ type: 'PUBLISHED' });
      } catch {
        await dispatch({ type: 'FAILED', message: 'Publish request failed.' });
      }
    });

    on('FAILED', ({ event, goto, update }) => {
      update({ error: event.message });
      goto('draft');
    });

    on('PUBLISHED', ({ goto, update }) => {
      update({ published: true, error: undefined });
      goto('published');
    });
  })
  .step('published', ({ enter }) => {
    enter(({ schedule }) => {
      schedule(1500, ({ goto, update }) => {
        update({ published: false });
        goto('draft');
      });
    });
  })
  .build();
