import { createFlow, requestStep } from 'logic-flow';
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
      update({ title: event.value, error: undefined, published: false });
    }),

    on('TOGGLE_LEGAL_REVIEW', {}, ({ ctx, update }) => {
      update({ requiresLegalReview: !ctx.requiresLegalReview });
    }),

    on('SUBMIT', {}, [states.review, states.publishing], ({ ctx, goto, update }) => {
      if (ctx.title.trim().length < 6) {
        update({ error: 'Title must be at least 6 characters.' });
      } else {
        goto(ctx.requiresLegalReview ? states.review : states.publishing);
      }
    }),
  ])
  .step('review', ({ on, states }) =>
    on('APPROVE', {}, states.publishing, ({ goto }) => {
      goto(states.publishing);
    }),
  )
  .step('publishing', (api) =>
    requestStep(api, {
      run: ({ effect }) =>
        effect('publishRequest', async () => {
          await wait(1000);
        }),
      success: {
        type: 'PUBLISHED',
        target: api.states.published,
        handle: ({ goto, update }) => {
          update({ published: true, error: undefined });
          goto(api.states.published);
        },
      },
      failure: {
        type: 'FAILED',
        shape: { message: z.string() },
        target: api.states.draft,
        mapError: () => ({ message: 'Publish request failed.' }),
        handle: ({ event, goto, update }) => {
          update({ error: event.message });
          goto(api.states.draft);
        },
      },
    }),
  )
  .step('published', ({ enter, states }) =>
    enter(states.draft, ({ schedule }) => {
      schedule(1500, ({ goto, update }) => {
        update({ published: false });
        goto(states.draft);
      });
    }),
  );