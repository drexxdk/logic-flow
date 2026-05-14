import type { CodeExample } from './CodeComparison';

export const renameComparison: CodeExample = {
  title: 'Authoring comparison',
  xstateCode: `const renameMachine = setup({
  types: {
    context: {} as RenameContext,
    events: {} as
      | { type: 'OPEN' }
      | { type: 'CHANGE'; value: string }
      | { type: 'SAVE' }
      | { type: 'SAVED'; heading: string }
      | { type: 'FAILED'; message: string },
  },
}).createMachine({
  initial: 'closed',
  states: {
    editing: {
      on: {
        CHANGE: {
          actions: assign(({ event, context }) => ({
            heading: event.value,
            error: validateHeading(context, event.value),
          })),
        },
        SAVE: {
          target: 'saving',
          guard: ({ context }) => !context.error,
        },
      },
    },
    saving: {
      invoke: {
        src: 'renameHeading',
        onDone: {
          target: 'success',
          actions: assign(({ event }) => ({
            savedHeading: event.output.heading,
          })),
        },
        onError: {
          target: 'editing',
          actions: assign({ error: 'Saving failed. Try again.' }),
        },
      },
      after: { 1200: { target: 'closed' } },
    },
  },
});`,
  logicFlowCode: `const renameFlow = createFlow({
  context: z.object({
    heading: z.string(),
    savedHeading: z.string(),
    error: z.string().optional(),
  }),
  states: ['closed', 'editing', 'saving', 'success'] as const,
  initial: 'closed',
})
  .step('editing', ({ on, states }) => [
    on('CHANGE', { value: z.string() }, ({ ctx, event, update }) => {
      update({
        heading: event.value,
        error: validateHeading(ctx, event.value),
      });
    }),
    on('SAVE', {}, states.saving, ({ ctx, goto }) => {
      if (ctx.error) return;
      goto(states.saving);
    }),
  ])
  .step('saving', ({ enter, on, states }) => {
    const saved = on('SAVED', { heading: z.string() }, states.success, ({ event, goto, update }) => {
      update({ savedHeading: event.heading });
      goto(states.success);
    });

    return [
      enter(async ({ ctx, dispatch, effect }) => {
        await effect('renameRequest', renameHeading);
        await dispatch(saved, { heading: ctx.heading.trim() });
      }),
      saved,
    ];
  })
  );`,
  typedLineNumbers: [2, 7, 10, 16, 21, 28],
  typedReasons: [
    'Local Zod payloads make CHANGE and SAVED payloads infer directly from the handler site.',
    '`states.saving` and `states.success` narrow `goto(...)` targets without string literals.',
    'Dispatching through the `saved` registration keeps the internal event payload aligned with the handler contract.',
  ],
};

export const publishingComparison: CodeExample = {
  title: 'Authoring comparison',
  xstateCode: `const publishingMachine = setup({
  types: {
    context: {} as PublishingContext,
    events: {} as
      | { type: 'CHANGE_TITLE'; value: string }
      | { type: 'TOGGLE_LEGAL_REVIEW' }
      | { type: 'SUBMIT' }
      | { type: 'APPROVE' },
  },
}).createMachine({
  initial: 'draft',
  states: {
    draft: {
      on: {
        CHANGE_TITLE: {
          actions: assign(({ event }) => ({ title: event.value })),
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
    publishing: {
      invoke: {
        src: 'publishRequest',
        onDone: { target: 'published' },
        onError: { target: 'draft' },
      },
    },
  },
});`,
  logicFlowCode: `const publishingFlow = createFlow({
  context: z.object({
    title: z.string(),
    requiresLegalReview: z.boolean(),
    error: z.string().optional(),
  }),
  states: ['draft', 'review', 'publishing', 'published'] as const,
  initial: 'draft',
})
  .step('draft', ({ on, states }) => [
    on('CHANGE_TITLE', { value: z.string() }, ({ event, update }) => {
      update({ title: event.value, error: undefined });
    }),
    on('SUBMIT', {}, [states.review, states.publishing], ({ ctx, goto, update }) => {
      if (ctx.title.trim().length < 6) {
        update({ error: 'Title must be at least 6 characters.' });
      } else {
        goto(ctx.requiresLegalReview ? states.review : states.publishing);
      }
    }),
  ])
  .step('publishing', (api) =>
    requestStep(api, {
      run: ({ effect }) => effect('publishRequest', publishPost),
      success: {
        type: 'PUBLISHED',
        target: api.states.published,
      },
      failure: {
        type: 'FAILED',
        shape: { message: z.string() },
        target: api.states.draft,
      },
    }),
  );`,
  typedLineNumbers: [2, 7, 10, 13, 21, 27, 32],
  typedReasons: [
    'The local CHANGE_TITLE payload is inferred from the Zod shape instead of being predeclared in a global event union.',
    'Declaring `[states.review, states.publishing]` narrows `goto(...)` to the allowed submit targets.',
    '`requestStep(...)` keeps success and failure payload contracts typed from one config surface.',
  ],
};

export const syncComparison: CodeExample = {
  title: 'Authoring comparison',
  xstateCode: `const syncMachine = setup({
  types: {
    context: {} as SyncContext,
    events: {} as
      | { type: 'START' }
      | { type: 'RETRY' }
      | { type: 'RESET' }
      | { type: 'TOGGLE_FAILURE' }
      | { type: 'FAILED'; message: string }
      | { type: 'SYNCED'; itemCount: number },
  },
}).createMachine({
  states: {
    syncing: {
      invoke: {
        src: 'syncCatalog',
        onDone: {
          target: 'synced',
          actions: raise(({ event }) => ({ type: 'SYNCED', itemCount: event.output })),
        },
        onError: {
          target: 'failed',
          actions: raise({ type: 'FAILED', message: 'Initial sync failed.' }),
        },
      },
    },
    retrying: {
      invoke: {
        src: 'syncCatalog',
        onDone: { target: 'synced' },
        onError: { target: 'failed' },
      },
    },
  },
});`,
  logicFlowCode: `const syncFailed = defineEvent('FAILED', { message: z.string() });
const syncCompleted = defineEvent('SYNCED', {
  itemCount: z.number().int().nonnegative(),
});

const syncFlow = createFlow({
  context: z.object({
    syncedItems: z.number(),
    shouldFail: z.boolean(),
  }),
  states: ['idle', 'syncing', 'failed', 'retrying', 'synced'] as const,
  initial: 'idle',
})
  .step('syncing', ({ enter, on, states }) => {
    const failed = on(syncFailed, states.failed, ({ event, goto, update }) => {
      update({ error: event.message });
      goto(states.failed);
    });
    const synced = on(syncCompleted, states.synced, ({ event, goto, update }) => {
      update({ syncedItems: event.itemCount, error: undefined });
      goto(states.synced);
    });

    return [
      enter(async ({ ctx, dispatch, effect }) => {
        const itemCount = await effect('catalogSync', () => runSyncRequest(ctx.shouldFail));
        await dispatch(synced, { itemCount });
      }),
      failed,
      synced,
    ];
  });`,
  typedLineNumbers: [1, 2, 10, 13, 17, 24],
  typedReasons: [
    '`defineEvent(...)` creates one reusable contract that stays typed everywhere it is registered or dispatched.',
    'Registering `failed` and `synced` locally keeps each handler payload tied to the reusable event definition.',
    '`dispatch(synced, { itemCount })` reuses the same typed contract instead of rebuilding a raw event object.',
  ],
};
