import { createFlow, defineEvent, requestStep } from 'logic-flow';
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
  .step('syncing', (api) =>
    requestStep(api, {
      run: async ({ ctx, effect }) => {
        const itemCount = await effect('catalogSync', async () => runSyncRequest(ctx.shouldFail));
        return { itemCount };
      },
      success: {
        event: syncCompleted,
        target: api.states.synced,
        handle: ({ event, goto, update }) => {
          update({ syncedItems: event.itemCount, error: undefined });
          goto(api.states.synced);
        },
      },
      failure: {
        event: syncFailed,
        target: api.states.failed,
        mapError: () => ({ message: 'Initial sync failed. Toggle failure and retry.' }),
        handle: ({ event, goto, update }) => {
          update({ error: event.message });
          goto(api.states.failed);
        },
      },
    }),
  )
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
  .step('retrying', (api) =>
    requestStep(api, {
      run: async ({ ctx, effect }) => {
        const itemCount = await effect('catalogSync', async () => runSyncRequest(ctx.shouldFail));
        return { itemCount };
      },
      success: {
        event: syncCompleted,
        target: api.states.synced,
        handle: ({ event, goto, update }) => {
          update({ syncedItems: event.itemCount, error: undefined });
          goto(api.states.synced);
        },
      },
      failure: {
        event: syncFailed,
        target: api.states.failed,
        mapError: () => ({
          message: 'Retry failed. The same FAILED contract still applies.',
        }),
        handle: ({ event, goto, update }) => {
          update({ error: event.message });
          goto(api.states.failed);
        },
      },
    }),
  )
  .step('synced', ({ on, states }) => [
    on('RESET', {}, states.idle, ({ goto, update }) => {
      update({ syncedItems: 0, error: undefined, lastAttempt: undefined });
      goto(states.idle);
    }),
    on('TOGGLE_FAILURE', {}, ({ ctx, update }) => {
      update({ shouldFail: !ctx.shouldFail });
    }),
  ]);
