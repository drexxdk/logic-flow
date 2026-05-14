import { createFlow, defineEvent } from 'logic-flow';
import { z } from 'zod';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const syncFailed = defineEvent('FAILED', { message: z.string() });
const syncCompleted = defineEvent('SYNCED', { itemCount: z.number().int().nonnegative() });

async function runSyncRequest(shouldFail: boolean) {
  await wait(900);

  if (shouldFail) {
    throw new Error('Sync service unavailable.');
  }

  return 3;
}

export const syncFlow = createFlow({
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
  ]);
