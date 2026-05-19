import type { CodeExample } from '../../components/CodeComparison';

export const publishingComparison: CodeExample = {
  title: 'Complete authoring comparison',
  xstateCode: `import { assign, fromPromise, setup } from 'xstate';

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

const publishMachine = setup({
  types: {
    context: {} as {
      title: string;
      requiresLegalReview: boolean;
      error?: string;
      notice?: string;
      published: boolean;
    },
    events: {} as
      | { type: 'CHANGE_TITLE'; value: string }
      | { type: 'TOGGLE_LEGAL_REVIEW' }
      | { type: 'SUBMIT' }
      | { type: 'APPROVE' }
      | { type: 'CANCEL' },
  },
  actors: {
    publishRequest: fromPromise(async ({ signal }) => {
      await wait(1000, signal);
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
            notice: undefined,
            published: false,
          })),
        },
        TOGGLE_LEGAL_REVIEW: {
          actions: assign(({ context }) => ({
            requiresLegalReview: !context.requiresLegalReview,
            notice: undefined,
          })),
        },
        SUBMIT: [
          {
            guard: ({ context }) => context.title.trim().length < 6,
            actions: assign({ error: 'Title must be at least 6 characters.', notice: undefined }),
          },
          {
            guard: ({ context }) => context.requiresLegalReview,
            actions: assign({ error: undefined, notice: undefined, published: false }),
            target: 'review',
          },
          {
            actions: assign({ error: undefined, notice: undefined, published: false }),
            target: 'publishing',
          },
        ],
      },
    },
    review: {
      on: {
        APPROVE: {
          actions: assign({ error: undefined, notice: undefined }),
          target: 'publishing',
        },
      },
    },
    publishing: {
      on: {
        CANCEL: {
          actions: assign({ error: undefined, notice: 'Publishing cancelled.' }),
          target: 'draft',
        },
      },
      invoke: {
        src: 'publishRequest',
        onDone: {
          target: 'published',
          actions: assign({ published: true, error: undefined, notice: 'Publish finished.' }),
        },
        onError: {
          target: 'draft',
          actions: assign({ error: 'Publish request failed.', notice: undefined }),
        },
      },
    },
    published: {
      after: {
        1500: {
          target: 'draft',
          actions: assign({ published: false, notice: undefined }),
        },
      },
    },
  },
});`,
  logicFlowCode: `import { createFlow, defineEvent, requestStep } from 'logic-flow';
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

/* @typed */ export const publishingFlow = createFlow({
  name: 'publishing-demo',
/* @typed */   context: z.object({
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
/* @typed */     on('CHANGE_TITLE', { value: z.string() }, ({ event, update }) => {
      update({ title: event.value, error: undefined, notice: undefined, published: false });
    }),
    on('TOGGLE_LEGAL_REVIEW', {}, ({ ctx, update }) => {
      update({ requiresLegalReview: !ctx.requiresLegalReview, notice: undefined });
    }),
/* @typed */     on('SUBMIT', {}, [states.review, states.publishing], ({ ctx, goto, update }) => {
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
/* @typed */   .step('publishing', (api) =>
/* @typed */     requestStep(api, {
        run: ({ effect }) =>
          effect('publishRequest', async (signal) => {
            await wait(1000, signal);
          }),
        cancel: {
          event: cancelPublish,
          target: api.states.draft,
          handle: ({ goto, update }) => {
            update({ error: undefined, notice: 'Publishing cancelled.' });
            goto(api.states.draft);
          },
        },
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
  )
  .step('published', ({ enter, states }) =>
    enter(states.draft, ({ schedule }) => {
/* @typed */       schedule(1500, ({ goto, update }) => {
        update({ published: false, notice: undefined });
        goto(states.draft);
      });
    }),
  );`,
  typedReasons: [
    'The logic-flow version still keeps the runtime schema and inferred context type in one place, even after inlining the one-off XState types for fairness.',
    'Normal `if` and `else` branching replaces the guard-array encoding while still narrowing `goto(...)` to the declared submit targets.',
    '`requestStep(...)` now keeps success, failure, and cancel transitions inside one helper call while still using reusable typed event definitions.',
  ],
};
