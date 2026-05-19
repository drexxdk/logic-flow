import type { CodeExample } from '../../components/CodeComparison';

export const syncComparison: CodeExample = {
  title: 'Complete authoring comparison',
  xstateCode: `import { assign, fromPromise, raise, setup } from 'xstate';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function runSyncRequest(shouldFail: boolean) {
  await wait(900);

  if (shouldFail) {
    throw new Error('Sync service unavailable.');
  }

  return 3;
}

const syncMachine = setup({
  types: {
    context: {} as {
      syncedItems: number;
      shouldFail: boolean;
      lastAttempt?: 'syncing' | 'retrying';
      error?: string;
    },
    events: {} as
      | { type: 'START' }
      | { type: 'RETRY' }
      | { type: 'RESET' }
      | { type: 'TOGGLE_FAILURE' }
      | { type: 'FAILED'; message: string }
      | { type: 'SYNCED'; itemCount: number },
  },
  actors: {
    syncCatalog: fromPromise(async ({ input }: { input: { shouldFail: boolean } }) =>
      runSyncRequest(input.shouldFail),
    ),
  },
}).createMachine({
  initial: 'idle',
  context: {
    syncedItems: 0,
    shouldFail: false,
  },
  states: {
    idle: {
      on: {
        START: {
          target: 'syncing',
          actions: assign({ error: undefined, lastAttempt: 'syncing' }),
        },
        TOGGLE_FAILURE: {
          actions: assign(({ context }) => ({ shouldFail: !context.shouldFail })),
        },
      },
    },
    syncing: {
      invoke: {
        src: 'syncCatalog',
        input: ({ context }) => ({ shouldFail: context.shouldFail }),
        onDone: {
          actions: raise(({ event }) => ({ type: 'SYNCED', itemCount: event.output })),
        },
        onError: {
          actions: raise({ type: 'FAILED', message: 'Initial sync failed. Toggle failure and retry.' }),
        },
      },
      on: {
        FAILED: {
          target: 'failed',
          actions: assign(({ event }) => ({ error: event.message })),
        },
        SYNCED: {
          target: 'synced',
          actions: assign(({ event }) => ({ syncedItems: event.itemCount, error: undefined })),
        },
      },
    },
    failed: {
      on: {
        RETRY: {
          target: 'retrying',
          actions: assign({ error: undefined, lastAttempt: 'retrying' }),
        },
        TOGGLE_FAILURE: {
          actions: assign(({ context }) => ({ shouldFail: !context.shouldFail })),
        },
        RESET: {
          target: 'idle',
          actions: assign({ error: undefined, syncedItems: 0, lastAttempt: undefined }),
        },
      },
    },
    retrying: {
      invoke: {
        src: 'syncCatalog',
        input: ({ context }) => ({ shouldFail: context.shouldFail }),
        onDone: {
          actions: raise(({ event }) => ({ type: 'SYNCED', itemCount: event.output })),
        },
        onError: {
          actions: raise({ type: 'FAILED', message: 'Retry failed. The same FAILED contract still applies.' }),
        },
      },
      on: {
        FAILED: {
          target: 'failed',
          actions: assign(({ event }) => ({ error: event.message })),
        },
        SYNCED: {
          target: 'synced',
          actions: assign(({ event }) => ({ syncedItems: event.itemCount, error: undefined })),
        },
      },
    },
    synced: {
      on: {
        RESET: {
          target: 'idle',
          actions: assign({ error: undefined, syncedItems: 0, lastAttempt: undefined }),
        },
        TOGGLE_FAILURE: {
          actions: assign(({ context }) => ({ shouldFail: !context.shouldFail })),
        },
      },
    },
  },
});`,
  logicFlowCode: `import { createFlow, defineEvent } from 'logic-flow';
import { z } from 'zod';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
/* @typed */ const syncFailed = defineEvent('FAILED', { message: z.string() });
/* @typed */ const syncCompleted = defineEvent('SYNCED', { itemCount: z.number().int().nonnegative() });

async function runSyncRequest(shouldFail: boolean) {
  await wait(900);

  if (shouldFail) {
    throw new Error('Sync service unavailable.');
  }

  return 3;
}

/* @typed */ export const syncFlow = createFlow({
  name: 'sync-demo',
  context: z.object({
    syncedItems: z.number(),
    shouldFail: z.boolean(),
    lastAttempt: z.enum(['syncing', 'retrying']).optional(),
    error: z.string().optional(),
  }),
  states: ['idle', 'syncing', 'failed', 'retrying', 'synced'] as const,
  initial: 'idle',
  initialContext: {
    syncedItems: 0,
    shouldFail: false,
  },
})
  .step('idle', ({ on, states }) => [
    on('START', {}, states.syncing, ({ goto, update }) => {
      update({ error: undefined, lastAttempt: 'syncing' });
      goto(states.syncing);
    }),
    on('TOGGLE_FAILURE', {}, ({ ctx, update }) => {
      update({ shouldFail: !ctx.shouldFail });
    }),
  ])
  .step('syncing', ({ enter, on, states }) => {
/* @typed */     const failed = on(syncFailed, states.failed, ({ event, goto, update }) => {
      update({ error: event.message });
      goto(states.failed);
    });
/* @typed */     const synced = on(syncCompleted, states.synced, ({ event, goto, update }) => {
      update({ syncedItems: event.itemCount, error: undefined });
      goto(states.synced);
    });

    return [
/* @typed */       enter(async ({ ctx, dispatch, effect }) => {
        try {
          const itemCount = await effect('catalogSync', async () => runSyncRequest(ctx.shouldFail));
          await dispatch(synced, { itemCount });
        } catch {
          await dispatch(failed, { message: 'Initial sync failed. Toggle failure and retry.' });
        }
      }),
      failed,
      synced,
    ];
  })
  .step('failed', ({ on, states }) => [
    on('RETRY', {}, states.retrying, ({ goto, update }) => {
      update({ error: undefined, lastAttempt: 'retrying' });
      goto(states.retrying);
    }),
    on('TOGGLE_FAILURE', {}, ({ ctx, update }) => {
      update({ shouldFail: !ctx.shouldFail });
    }),
    on('RESET', {}, states.idle, ({ goto, update }) => {
      update({ error: undefined, syncedItems: 0, lastAttempt: undefined });
      goto(states.idle);
    }),
  ])
  .step('retrying', ({ enter, on, states }) => {
/* @typed */     const failed = on(syncFailed, states.failed, ({ event, goto, update }) => {
      update({ error: event.message });
      goto(states.failed);
    });
/* @typed */     const synced = on(syncCompleted, states.synced, ({ event, goto, update }) => {
      update({ syncedItems: event.itemCount, error: undefined });
      goto(states.synced);
    });

    return [
      enter(async ({ ctx, dispatch, effect }) => {
        try {
          const itemCount = await effect('catalogSync', async () => runSyncRequest(ctx.shouldFail));
          await dispatch(synced, { itemCount });
        } catch {
          await dispatch(failed, {
            message: 'Retry failed. The same FAILED contract still applies.',
          });
        }
      }),
      failed,
      synced,
    ];
  })
  .step('synced', ({ on, states }) => [
    on('RESET', {}, states.idle, ({ goto, update }) => {
      update({ syncedItems: 0, error: undefined, lastAttempt: undefined });
      goto(states.idle);
    }),
    on('TOGGLE_FAILURE', {}, ({ ctx, update }) => {
      update({ shouldFail: !ctx.shouldFail });
    }),
  ]);`,
  typedReasons: [
    '`defineEvent(...)` gives the shared FAILED and SYNCED contracts one reusable source of truth instead of rebuilding inline event objects in each invoke branch.',
    'The same event definitions are reused directly in both request states, so local handlers and internal dispatches stay aligned without extra glue code.',
    'The flow code keeps the retry state logic as normal functions while still preserving typed context, events, and transition targets throughout the chain.',
  ],
};
