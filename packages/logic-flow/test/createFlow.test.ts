import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createFlow } from '../src';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe('createFlow', () => {
  it('validates event payloads with zod', async () => {
    const flow = createFlow({
      name: 'counter',
      context: z.object({ count: z.number() }),
      events: {
        ADD: z.object({ type: z.literal('ADD'), amount: z.number().int().positive() }),
      },
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0 },
    })
      .step('idle', ({ on }) => {
        on('ADD', ({ ctx, event, update }) => {
          update({ count: ctx.count + event.amount });
        });
      })
      .build();

    const instance = flow.createInstance();

    await expect(instance.dispatch({ type: 'ADD', amount: -1 })).rejects.toThrow();
  });

  it('allows normal if else branching inside handlers', async () => {
    const flow = createFlow({
      name: 'branching',
      context: z.object({
        status: z.enum(['idle', 'error', 'ready']),
        note: z.string().optional(),
      }),
      events: {
        SUBMIT: z.object({ type: z.literal('SUBMIT'), title: z.string() }),
      },
      states: ['editing'] as const,
      initial: 'editing',
      initialContext: { status: 'idle' },
    })
      .step('editing', ({ on }) => {
        on('SUBMIT', ({ event, update }) => {
          if (event.title.trim().length < 5) {
            update({ status: 'error', note: 'too-short' });
            return;
          }

          update({ status: 'ready', note: undefined });
        });
      })
      .build();

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'SUBMIT', title: 'bad' });
    expect(instance.getSnapshot().context).toEqual({ status: 'error', note: 'too-short' });

    await instance.dispatch({ type: 'SUBMIT', title: 'valid title' });
    expect(instance.getSnapshot().context).toEqual({ status: 'ready', note: undefined });
  });

  it('tracks pending effects while async work is running', async () => {
    const deferred = createDeferred<void>();

    const flow = createFlow({
      name: 'effects',
      context: z.object({ done: z.boolean() }),
      events: {
        SAVE: z.object({ type: z.literal('SAVE') }),
      },
      states: ['idle', 'done'] as const,
      initial: 'idle',
      initialContext: { done: false },
    })
      .step('idle', ({ on }) => {
        on('SAVE', async ({ effect, goto, update }) => {
          await effect('persist', () => deferred.promise);
          update({ done: true });
          goto('done');
        });
      })
      .step('done', () => undefined)
      .build();

    const instance = flow.createInstance();
    const dispatchPromise = instance.dispatch({ type: 'SAVE' });

    expect(instance.getSnapshot().pendingEffects).toContain('persist');

    deferred.resolve();
    await dispatchPromise;

    expect(instance.getSnapshot().pendingEffects).toEqual([]);
    expect(instance.getSnapshot().state).toBe('done');
    expect(instance.getSnapshot().context.done).toBe(true);
  });

  it('supports delayed transitions from enter handlers', async () => {
    vi.useFakeTimers();

    const flow = createFlow({
      name: 'delay',
      context: z.object({ finished: z.boolean() }),
      events: {
        COMPLETE: z.object({ type: z.literal('COMPLETE') }),
      },
      states: ['idle', 'success', 'closed'] as const,
      initial: 'idle',
      initialContext: { finished: false },
    })
      .step('idle', ({ on }) => {
        on('COMPLETE', ({ goto, update }) => {
          update({ finished: true });
          goto('success');
        });
      })
      .step('success', ({ enter }) => {
        enter(({ schedule }) => {
          schedule(250, ({ goto: delayedGoto }) => {
            delayedGoto('closed');
          });
        });
      })
      .step('closed', () => undefined)
      .build();

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'COMPLETE' });
    expect(instance.getSnapshot().state).toBe('success');

    await vi.advanceTimersByTimeAsync(250);
    expect(instance.getSnapshot().state).toBe('closed');

    vi.useRealTimers();
  });
});
