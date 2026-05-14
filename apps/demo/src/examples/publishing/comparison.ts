import type { CodeExample } from '../../components/CodeComparison';

export const publishingComparison: CodeExample = {
  title: 'Complete authoring comparison',
  xstateCode: `import { assign, fromPromise, setup } from 'xstate';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const publishMachine = setup({
  types: {
    context: {} as {
      title: string;
      requiresLegalReview: boolean;
      error?: string;
      published: boolean;
    },
    events: {} as
      | { type: 'CHANGE_TITLE'; value: string }
      | { type: 'TOGGLE_LEGAL_REVIEW' }
      | { type: 'SUBMIT' }
      | { type: 'APPROVE' },
  },
  actors: {
    publishRequest: fromPromise(async () => {
      await wait(1000);
    }),
  },
}).createMachine({
  initial: 'draft',
  context: {
    title: 'New workflow runtime',
    requiresLegalReview: true,
    published: false,
  },
  states: {
    draft: {
      on: {
        CHANGE_TITLE: {
          actions: assign(({ event }) => ({
            title: event.value,
            error: undefined,
            published: false,
          })),
        },
        TOGGLE_LEGAL_REVIEW: {
          actions: assign(({ context }) => ({
            requiresLegalReview: !context.requiresLegalReview,
          })),
        },
        SUBMIT: [
          {
            guard: ({ context }) => context.title.trim().length < 6,
            actions: assign({ error: 'Title must be at least 6 characters.' }),
          },
          {
            guard: ({ context }) => context.requiresLegalReview,
            target: 'review',
          },
          { target: 'publishing' },
        ],
      },
    },
    review: {
      on: {
        APPROVE: { target: 'publishing' },
      },
    },
    publishing: {
      invoke: {
        src: 'publishRequest',
        onDone: {
          target: 'published',
          actions: assign({ published: true, error: undefined }),
        },
        onError: {
          target: 'draft',
          actions: assign({ error: 'Publish request failed.' }),
        },
      },
    },
    published: {
      after: {
        1500: {
          target: 'draft',
          actions: assign({ published: false }),
        },
      },
    },
  },
});`,
  logicFlowCode: `import { createFlow, requestStep } from 'logic-flow';
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
  );`,
  typedLineNumbers: [7, 20, 26, 34, 40, 48, 55, 66],
  typedReasons: [
    'The logic-flow version still keeps the runtime schema and inferred context type in one place, even after inlining the one-off XState types for fairness.',
    'Normal `if` and `else` branching replaces the guard-array encoding while still narrowing `goto(...)` to the declared submit targets.',
    '`requestStep(...)` keeps the async success and failure contracts local to the request state instead of scattering them between actor setup and invoke callbacks.',
  ],
};
