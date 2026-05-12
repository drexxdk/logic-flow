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
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0 },
    })
      .step('idle', ({ on }) => [
        on('ADD', { amount: z.number().int().positive() }, ({ ctx, event, update }) => {
          update({ count: ctx.count + event.amount });
        }),
      ])
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
      states: ['editing'] as const,
      initial: 'editing',
      initialContext: { status: 'idle' },
    })
      .step('editing', ({ on }) => [
        on('SUBMIT', { title: z.string() }, ({ event, update }) => {
          if (event.title.trim().length < 5) {
            update({ status: 'error', note: 'too-short' });
            return;
          }

          update({ status: 'ready', note: undefined });
        }),
      ])
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
      states: ['idle', 'done'] as const,
      initial: 'idle',
      initialContext: { done: false },
    })
      .step('idle', ({ on, states }) => [
        on('SAVE', {}, async ({ effect, goto, update }) => {
          await effect('persist', () => deferred.promise);
          update({ done: true });
          goto(states.done);
        }),
      ])
      .step('done', () => [])
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
      states: ['idle', 'success', 'closed'] as const,
      initial: 'idle',
      initialContext: { finished: false },
    })
      .step('idle', ({ on, states }) => [
        on('COMPLETE', {}, ({ goto, update }) => {
          update({ finished: true });
          goto(states.success);
        }),
      ])
      .step('success', ({ enter, states }) => [
        enter(({ schedule }) => {
          schedule(250, ({ goto: delayedGoto }) => {
            delayedGoto(states.closed);
          });
        }),
      ])
      .step('closed', () => [])
      .build();

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'COMPLETE' });
    expect(instance.getSnapshot().state).toBe('success');

    await vi.advanceTimersByTimeAsync(250);
    expect(instance.getSnapshot().state).toBe('closed');

    vi.useRealTimers();
  });

  it('stops executing the current handler after goto', async () => {
    const order: string[] = [];

    const flow = createFlow({
      name: 'abort-on-goto',
      context: z.object({ done: z.boolean() }),
      states: ['idle', 'success'] as const,
      initial: 'idle',
      initialContext: { done: false },
    })
      .step('idle', ({ on, states }) => [
        on('COMPLETE', {}, { targets: [states.success] as const }, ({ goto }) => {
          order.push('before-goto');
          goto(states.success);
          order.push('after-goto');
        }),
      ])
      .step('success', ({ enter }) => [
        enter(() => {
          order.push('enter-success');
        }),
      ])
      .build();

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'COMPLETE' });

    expect(order).toEqual(['before-goto', 'enter-success']);
    expect(instance.getSnapshot().state).toBe('success');
  });

  it('exposes declared transition targets for editor help', () => {
    const flow = createFlow({
      name: 'transition-help',
      context: z.object({ approved: z.boolean() }),
      states: ['draft', 'review', 'published'] as const,
      initial: 'draft',
      initialContext: { approved: false },
    })
      .step('draft', ({ on, states }) => [
        on(
          'SUBMIT',
          {},
          { targets: [states.review, states.published] as const },
          ({ ctx, goto }) => {
            goto(ctx.approved ? states.published : states.review);
          },
        ),
      ])
      .step('review', ({ enter, states }) => [
        enter({ targets: [states.published] as const }, ({ goto }) => {
          goto(states.published);
        }),
      ])
      .step('published', () => [])
      .build();

    expect(flow.transitions).toEqual({
      draft: [{ kind: 'event', event: 'SUBMIT', targets: ['review', 'published'] }],
      review: [{ kind: 'enter', targets: ['published'] }],
      published: [],
    });
  });
});
