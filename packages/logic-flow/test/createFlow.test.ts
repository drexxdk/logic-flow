import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import * as logicFlow from '../src';
import { createFlow, defineEvent, requestStep } from '../src';
import { useFlow } from '../src/react';

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
  it('exposes only the supported runtime exports from the package entrypoint', () => {
    expect(Object.keys(logicFlow).sort()).toEqual(
      ['FlowInstance', 'createFlow', 'defineEvent', 'requestStep'].sort(),
    );
  });

  it('validates event payloads with zod', async () => {
    const flow = createFlow({
      name: 'counter',
      context: z.object({ count: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0 },
    }).step('idle', ({ on }) => [
      on('ADD', { amount: z.number().int().positive() }, ({ ctx, event, update }) => {
        update({ count: ctx.count + event.amount });
      }),
    ]);

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
    }).step('editing', ({ on }) => [
      on('SUBMIT', { title: z.string() }, ({ event, update }) => {
        if (event.title.trim().length < 5) {
          update({ status: 'error', note: 'too-short' });
          return;
        }

        update({ status: 'ready', note: undefined });
      }),
    ]);

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
      .step('done', () => []);

    const instance = flow.createInstance();
    const dispatchPromise = instance.dispatch({ type: 'SAVE' });

    expect(instance.getSnapshot().pendingEffects).toContain('persist');

    deferred.resolve();
    await dispatchPromise;

    expect(instance.getSnapshot().pendingEffects).toEqual([]);
    expect(instance.getSnapshot().state).toBe('done');
    expect(instance.getSnapshot().context.done).toBe(true);
  });

  it('returns frozen snapshot copies so external mutation cannot bypass runtime state', async () => {
    const flow = createFlow({
      name: 'snapshot-safety',
      context: z.object({
        draft: z.object({ count: z.number() }),
      }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: {
        draft: { count: 0 },
      },
    }).step('idle', ({ on }) => [
      on('INC', {}, ({ ctx, update }) => {
        update({ draft: { count: ctx.draft.count + 1 } });
      }),
    ]);

    const instance = flow.createInstance();
    const snapshot = instance.getSnapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.context)).toBe(true);
    expect(Object.isFrozen(snapshot.context.draft)).toBe(true);
    expect(Object.isFrozen(snapshot.pendingEffects)).toBe(true);

    expect(() => {
      (snapshot.context as { draft: { count: number } }).draft.count = 99;
    }).toThrow(TypeError);

    await instance.dispatch({ type: 'INC' });

    expect(instance.getSnapshot().context).toEqual({ draft: { count: 1 } });
  });

  it('delivers frozen snapshot copies to subscribers', async () => {
    const flow = createFlow({
      name: 'subscriber-snapshot-safety',
      context: z.object({ count: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0 },
    }).step('idle', ({ on }) => [
      on('INC', {}, ({ ctx, update }) => {
        update({ count: ctx.count + 1 });
      }),
    ]);

    const instance = flow.createInstance();
    const receivedSnapshots: Array<ReturnType<typeof instance.getSnapshot>> = [];

    const unsubscribe = instance.subscribe((snapshot) => {
      receivedSnapshots.push(snapshot);
    });

    await instance.dispatch({ type: 'INC' });
    unsubscribe();

    expect(receivedSnapshots).toHaveLength(3);
    expect(receivedSnapshots[0]).not.toBe(receivedSnapshots[1]);
    expect(receivedSnapshots[1]).not.toBe(instance.getSnapshot());
    expect(Object.isFrozen(receivedSnapshots[1])).toBe(true);

    expect(() => {
      (receivedSnapshots[1]!.context as { count: number }).count = 99;
    }).toThrow(TypeError);

    expect(instance.getSnapshot().context.count).toBe(1);
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
      .step('closed', () => []);

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'COMPLETE' });
    expect(instance.getSnapshot().state).toBe('success');

    await vi.advanceTimersByTimeAsync(250);
    expect(instance.getSnapshot().state).toBe('closed');

    vi.useRealTimers();
  });

  it('supports requestStep for async request states without losing event inference', async () => {
    const deferred = createDeferred<void>();

    const flow = createFlow({
      name: 'request-step',
      context: z.object({ saved: z.boolean(), error: z.string().optional() }),
      states: ['idle', 'saving', 'done'] as const,
      initial: 'idle',
      initialContext: { saved: false },
    })
      .step('idle', ({ on, states }) =>
        on('SAVE', {}, states.saving, ({ goto, update }) => {
          update({ error: undefined });
          goto(states.saving);
        }),
      )
      .step('saving', (api) =>
        requestStep(api, {
          run: async ({ effect }) => {
            await effect('persist', () => deferred.promise);
            return {};
          },
          success: {
            type: 'SAVED',
            shape: {},
            target: api.states.done,
            handle: ({ goto, update }) => {
              update({ saved: true, error: undefined });
              goto(api.states.done);
            },
          },
          failure: {
            type: 'FAILED',
            shape: { message: z.string() },
            target: api.states.idle,
            mapError: () => ({ message: 'Save failed.' }),
            handle: ({ event, goto, update }) => {
              update({ error: event.message });
              goto(api.states.idle);
            },
          },
        }),
      )
      .step('done');

    const instance = flow.createInstance();
    const assertExternalSendTypes = () => {
      void instance.send({ type: 'SAVED' });
      void instance.send({ type: 'FAILED', message: 'typed failure' });

      // @ts-expect-error FAILED requires its message payload.
      void instance.send({ type: 'FAILED' });
    };

    void assertExternalSendTypes;

    const dispatchPromise = instance.dispatch({ type: 'SAVE' });

    await Promise.resolve();

    expect(instance.getSnapshot().pendingEffects).toEqual(['persist']);

    deferred.resolve();
    await dispatchPromise;

    expect(instance.getSnapshot()).toMatchObject({
      state: 'done',
      context: { saved: true, error: undefined },
      pendingEffects: [],
    });
    expect(flow.transitions).toEqual({
      idle: [{ kind: 'event', event: 'SAVE', targets: ['saving'] }],
      saving: [
        { kind: 'event', event: 'SAVED', targets: ['done'] },
        { kind: 'event', event: 'FAILED', targets: ['idle'] },
      ],
      done: [],
    });
  });

  it('types internal dispatch against registered events', () => {
    createFlow({
      name: 'typed-internal-dispatch',
      context: z.object({ failed: z.boolean() }),
      states: ['idle', 'saving', 'done'] as const,
      initial: 'idle',
      initialContext: { failed: false },
    })
      .step('idle', ({ on, states }) =>
        on('SAVE', {}, states.saving, ({ goto }) => {
          goto(states.saving);
        }),
      )
      .step('saving', ({ enter, on, states }) => {
        const failed = on(
          'FAILED',
          { message: z.string() },
          states.idle,
          ({ event, goto, update }) => {
            update({ failed: event.message.length > 0 });
            goto(states.idle);
          },
        );

        return [
          enter(({ dispatch }) => {
            const assertDispatchTypes = () => {
              // @ts-expect-error FAILED requires its message payload.
              void dispatch(failed);

              // @ts-expect-error UNKNOWN is not part of the flow event union.
              void dispatch({ type: 'UNKNOWN' });
            };

            void assertDispatchTypes;
            return dispatch(failed, { message: 'typed failure' });
          }),
          failed,
        ];
      })
      .step('done');
  });

  it('supports reusable event definitions across registration and dispatch', async () => {
    const failed = defineEvent('FAILED', { message: z.string() });
    const synced = defineEvent('SYNCED', { itemCount: z.number().int().nonnegative() });

    const assertReusableDefinitionSurface = () => {
      // @ts-expect-error create is intentionally not part of the public event definition API.
      void synced.create({ itemCount: 4 });
    };

    void assertReusableDefinitionSurface;

    const flow = createFlow({
      name: 'reusable-events',
      context: z.object({ itemCount: z.number(), error: z.string().optional() }),
      states: ['idle', 'syncing', 'failed', 'done'] as const,
      initial: 'idle',
      initialContext: { itemCount: 0 },
    })
      .step('idle', ({ on, states }) =>
        on('START', {}, states.syncing, ({ goto }) => {
          goto(states.syncing);
        }),
      )
      .step('syncing', ({ enter, on, states }) => [
        enter(({ dispatch }) => dispatch(synced, { itemCount: 2 })),
        on(failed, states.failed, ({ event, goto, update }) => {
          update({ error: event.message });
          goto(states.failed);
        }),
        on(synced, states.done, ({ event, goto, update }) => {
          update({ itemCount: event.itemCount, error: undefined });
          goto(states.done);
        }),
      ])
      .step('failed', () => [])
      .step('done', () => []);

    const instance = flow.createInstance();
    const assertExternalReusableSendTypes = () => {
      void instance.send(synced, { itemCount: 4 });

      // @ts-expect-error SYNCED requires its itemCount payload.
      void instance.send(synced);
    };

    void assertExternalReusableSendTypes;

    await instance.send(synced, { itemCount: 4 });

    await instance.dispatch({ type: 'START' });

    expect(instance.getSnapshot()).toMatchObject({
      state: 'done',
      context: { itemCount: 2, error: undefined },
    });
  });

  it('types useFlow send like the core instance send surface', () => {
    const synced = defineEvent('SYNCED', { itemCount: z.number().int().nonnegative() });

    const flow = createFlow({
      name: 'react-send-types',
      context: z.object({ itemCount: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { itemCount: 0 },
    }).step('idle', ({ on }) => [
      on(synced, ({ event, update }) => {
        update({ itemCount: event.itemCount });
      }),
    ]);

    const assertUseFlowSendTypes = () => {
      const { send } = useFlow(flow);

      void send({ type: 'SYNCED', itemCount: 2 });
      void send(synced, { itemCount: 2 });

      // @ts-expect-error SYNCED requires its payload object.
      void send(synced);

      // @ts-expect-error UNKNOWN is not part of the flow event union.
      void send({ type: 'UNKNOWN' });
    };

    void assertUseFlowSendTypes;
  });

  it('transitions immediately when goto is called', async () => {
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
        }),
      ])
      .step('success', ({ enter }) => [
        enter(() => {
          order.push('enter-success');
        }),
      ]);

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'COMPLETE' });

    expect(order).toEqual(['before-goto', 'enter-success']);
    expect(instance.getSnapshot().state).toBe('success');
  });

  it('runs exit handlers before entering the next state', async () => {
    const order: string[] = [];

    const flow = createFlow({
      name: 'exit-before-enter',
      context: z.object({ done: z.boolean() }),
      states: ['idle', 'done'] as const,
      initial: 'idle',
      initialContext: { done: false },
    })
      .step('idle', ({ exit, on, states }) => [
        exit(({ event, state }) => {
          const eventType = (event as { type?: string } | undefined)?.type ?? 'none';
          order.push(`exit:${state}:${eventType}`);
        }),
        on('COMPLETE', {}, states.done, ({ goto }) => {
          order.push('before-goto');
          goto(states.done);
        }),
      ])
      .step('done', ({ enter }) => [
        enter(() => {
          order.push('enter-done');
        }),
      ]);

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'COMPLETE' });

    expect(order).toEqual(['before-goto', 'exit:idle:COMPLETE', 'enter-done']);
    expect(instance.getSnapshot().state).toBe('done');
  });

  it('prevents further flow api calls after an internal dispatch', async () => {
    const flow = createFlow({
      name: 'dispatch-terminal',
      context: z.object({ failed: z.boolean() }),
      states: ['idle', 'done'] as const,
      initial: 'idle',
      initialContext: { failed: false },
    })
      .step('idle', ({ enter, on, states }) => {
        const finish = on('FINISH', {}, { targets: [states.done] as const }, ({ goto }) => {
          goto(states.done);
        });

        return [enter(({ dispatch }) => dispatch(finish).then(() => dispatch(finish))), finish];
      })
      .step('done', () => []);

    const instance = flow.createInstance();

    await expect(instance.start()).rejects.toThrow(
      'The current flow execution already ended after dispatch(...).',
    );
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
        on('SUBMIT', {}, [states.review, states.published], ({ ctx, goto }) => {
          goto(ctx.approved ? states.published : states.review);
        }),
      ])
      .step('review', ({ enter, states }) => [
        enter(states.published, ({ goto }) => {
          goto(states.published);
        }),
      ])
      .step('published', () => []);

    expect(flow.transitions).toEqual({
      draft: [{ kind: 'event', event: 'SUBMIT', targets: ['review', 'published'] }],
      review: [{ kind: 'enter', targets: ['published'] }],
      published: [],
    });
  });

  it('accepts direct target arguments for event and enter transitions', async () => {
    const flow = createFlow({
      name: 'direct-targets',
      context: z.object({ ready: z.boolean() }),
      states: ['idle', 'review', 'done'] as const,
      initial: 'idle',
      initialContext: { ready: false },
    })
      .step('idle', ({ on, states }) => [
        on('SUBMIT', {}, states.review, ({ goto }) => {
          goto(states.review);
        }),
      ])
      .step('review', ({ enter, on, states }) => [
        enter(states.done, ({ goto }) => {
          goto(states.done);
        }),
        on('RESET', {}, states.idle, ({ goto }) => {
          goto(states.idle);
        }),
      ])
      .step('done', () => []);

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'SUBMIT' });

    expect(instance.getSnapshot().state).toBe('done');
    expect(flow.transitions).toEqual({
      idle: [{ kind: 'event', event: 'SUBMIT', targets: ['review'] }],
      review: [
        { kind: 'enter', targets: ['done'] },
        { kind: 'event', event: 'RESET', targets: ['idle'] },
      ],
      done: [],
    });
  });

  it('allows defining an empty step without a registration callback', async () => {
    const flow = createFlow({
      name: 'empty-step',
      context: z.object({ complete: z.boolean() }),
      states: ['idle', 'done'] as const,
      initial: 'idle',
      initialContext: { complete: false },
    })
      .step('idle', ({ on, states }) => [
        on('FINISH', {}, states.done, ({ goto, update }) => {
          update({ complete: true });
          goto(states.done);
        }),
      ])
      .step('done');

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'FINISH' });

    expect(instance.getSnapshot()).toMatchObject({
      state: 'done',
      context: { complete: true },
    });
    expect(flow.transitions).toEqual({
      idle: [{ kind: 'event', event: 'FINISH', targets: ['done'] }],
      done: [],
    });
  });

  it('allows returning a single registration without wrapping it in an array', async () => {
    const flow = createFlow({
      name: 'single-registration',
      context: z.object({ approved: z.boolean() }),
      states: ['review', 'published'] as const,
      initial: 'review',
      initialContext: { approved: false },
    })
      .step('review', ({ on, states }) =>
        on('APPROVE', {}, states.published, ({ goto, update }) => {
          update({ approved: true });
          goto(states.published);
        }),
      )
      .step('published');

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'APPROVE' });

    expect(instance.getSnapshot().state).toBe('published');
    expect(instance.getSnapshot().context.approved).toBe(true);
    expect(flow.transitions).toEqual({
      review: [{ kind: 'event', event: 'APPROVE', targets: ['published'] }],
      published: [],
    });
  });

  it('fails when a declared state has no step definition before use', () => {
    expect(() =>
      createFlow({
        name: 'missing-step',
        context: z.object({ ready: z.boolean() }),
        states: ['idle', 'done'] as const,
        initial: 'idle',
        initialContext: { ready: false },
      })
        .step('idle', () => [])
        .createInstance(),
    ).toThrow('State "done" must be defined before using the flow.');
  });

  it('fails when the same state is defined more than once', () => {
    expect(() =>
      createFlow({
        name: 'duplicate-step',
        context: z.object({ ready: z.boolean() }),
        states: ['idle'] as const,
        initial: 'idle',
        initialContext: { ready: false },
      })
        .step('idle', () => [])
        .step('idle', () => []),
    ).toThrow('State "idle" is already defined in flow "duplicate-step".');
  });

  it('fails when the same event is registered twice in one step', () => {
    expect(() =>
      createFlow({
        name: 'duplicate-event',
        context: z.object({ count: z.number() }),
        states: ['idle'] as const,
        initial: 'idle',
        initialContext: { count: 0 },
      }).step('idle', ({ on }) => [
        on('INC', {}, ({ ctx, update }) => {
          update({ count: ctx.count + 1 });
        }),
        on('INC', {}, ({ ctx, update }) => {
          update({ count: ctx.count + 2 });
        }),
      ]),
    ).toThrow('Event "INC" is already defined for state "idle" in flow "duplicate-event".');
  });

  it('does not apply async completion updates after destroy', async () => {
    const deferred = createDeferred<void>();

    const flow = createFlow({
      name: 'destroy-effect',
      context: z.object({ saved: z.boolean() }),
      states: ['idle', 'saving', 'done'] as const,
      initial: 'idle',
      initialContext: { saved: false },
    })
      .step('idle', ({ on, states }) => [
        on('SAVE', {}, { targets: [states.saving] as const }, ({ goto }) => {
          goto(states.saving);
        }),
      ])
      .step('saving', ({ enter, on, states }) => {
        const saved = on('SAVED', {}, { targets: [states.done] as const }, ({ goto, update }) => {
          update({ saved: true });
          goto(states.done);
        });

        return [
          enter(async ({ effect, dispatch }) => {
            await effect('persist', () => deferred.promise);
            await dispatch(saved);
          }),
          saved,
        ];
      })
      .step('done', () => []);

    const instance = flow.createInstance();
    const dispatchPromise = instance.dispatch({ type: 'SAVE' });

    await Promise.resolve();

    expect(instance.getSnapshot().state).toBe('saving');
    expect(instance.getSnapshot().pendingEffects).toEqual(['persist']);

    instance.destroy();

    expect(instance.getSnapshot().state).toBe('saving');
    expect(instance.getSnapshot().pendingEffects).toEqual([]);

    deferred.resolve();
    await dispatchPromise;

    expect(instance.getSnapshot().state).toBe('saving');
    expect(instance.getSnapshot().context.saved).toBe(false);
    expect(instance.getSnapshot().pendingEffects).toEqual([]);
  });

  it('runs exit handlers when an instance is destroyed', () => {
    const order: string[] = [];

    const flow = createFlow({
      name: 'destroy-exit',
      context: z.object({ ready: z.boolean() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { ready: false },
    }).step('idle', ({ exit }) => [
      exit(({ event, state, getSnapshot }) => {
        const eventType = (event as { type?: string } | undefined)?.type ?? 'none';
        order.push(`exit:${state}:${eventType}`);
        order.push(`snapshot:${getSnapshot().state}`);
      }),
    ]);

    const instance = flow.createInstance();

    instance.destroy();

    expect(order).toEqual(['exit:idle:none', 'snapshot:idle']);
  });

  it('ignores external dispatch after destroy', async () => {
    const flow = createFlow({
      name: 'destroy-dispatch',
      context: z.object({ count: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0 },
    }).step('idle', ({ on }) => [
      on('INC', {}, ({ ctx, update }) => {
        update({ count: ctx.count + 1 });
      }),
    ]);

    const instance = flow.createInstance();

    instance.destroy();
    await instance.dispatch({ type: 'INC' });

    expect(instance.getSnapshot().context.count).toBe(0);
  });

  it('processes queued external dispatches in order while another event is running', async () => {
    const firstEventDeferred = createDeferred<void>();

    const flow = createFlow({
      name: 'queued-dispatch',
      context: z.object({ count: z.number(), order: z.array(z.string()) }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0, order: [] },
    }).step('idle', ({ on }) => [
      on('FIRST', {}, async ({ ctx, effect, update }) => {
        update({ order: [...ctx.order, 'first:start'] });
        await effect('first', () => firstEventDeferred.promise);
        update((currentContext) => ({
          count: currentContext.count + 1,
          order: [...currentContext.order, 'first:end'],
        }));
      }),
      on('SECOND', {}, ({ ctx, update }) => {
        update({
          count: ctx.count + 1,
          order: [...ctx.order, 'second'],
        });
      }),
    ]);

    const instance = flow.createInstance();
    const firstDispatchPromise = instance.dispatch({ type: 'FIRST' });

    await Promise.resolve();

    const secondDispatchPromise = instance.dispatch({ type: 'SECOND' });

    expect(instance.getSnapshot().context).toEqual({
      count: 0,
      order: ['first:start'],
    });

    firstEventDeferred.resolve();
    await Promise.all([firstDispatchPromise, secondDispatchPromise]);

    expect(instance.getSnapshot().context).toEqual({
      count: 2,
      order: ['first:start', 'first:end', 'second'],
    });
  });

  it('queues re-entrant external dispatches triggered during subscription notifications', async () => {
    const firstEventDeferred = createDeferred<void>();

    const flow = createFlow({
      name: 'subscription-reentrant-dispatch',
      context: z.object({ count: z.number(), order: z.array(z.string()) }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0, order: [] },
    }).step('idle', ({ on }) => [
      on('FIRST', {}, async ({ ctx, effect, update }) => {
        update({ order: [...ctx.order, 'first:start'] });
        await effect('first', () => firstEventDeferred.promise);
        update((currentContext) => ({
          count: currentContext.count + 1,
          order: [...currentContext.order, 'first:end'],
        }));
      }),
      on('SECOND', {}, ({ ctx, update }) => {
        update({
          count: ctx.count + 1,
          order: [...ctx.order, 'second'],
        });
      }),
    ]);

    const instance = flow.createInstance();
    let hasQueuedSecond = false;

    instance.subscribe((snapshot) => {
      if (!hasQueuedSecond && snapshot.lastEvent?.type === 'FIRST') {
        hasQueuedSecond = true;
        void instance.dispatch({ type: 'SECOND' });
      }
    });

    const firstDispatchPromise = instance.dispatch({ type: 'FIRST' });

    await Promise.resolve();

    expect(instance.getSnapshot().context).toEqual({
      count: 0,
      order: ['first:start'],
    });

    firstEventDeferred.resolve();
    await firstDispatchPromise;

    expect(instance.getSnapshot().context).toEqual({
      count: 2,
      order: ['first:start', 'first:end', 'second'],
    });
  });

  it('does not rerun enter handlers when start is called twice', async () => {
    const order: string[] = [];

    const flow = createFlow({
      name: 'start-once',
      context: z.object({ entered: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { entered: 0 },
    }).step('idle', ({ enter }) => [
      enter(({ ctx, update }) => {
        order.push('enter');
        update({ entered: ctx.entered + 1 });
      }),
    ]);

    const instance = flow.createInstance();

    await instance.start();
    await instance.start();

    expect(order).toEqual(['enter']);
    expect(instance.getSnapshot().context.entered).toBe(1);
  });

  it('cancels a scheduled task when the returned cleanup function is called', async () => {
    vi.useFakeTimers();

    const flow = createFlow({
      name: 'schedule-cancel',
      context: z.object({ fired: z.boolean() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { fired: false },
    }).step('idle', ({ enter }) => [
      enter(({ schedule, update }) => {
        const cancel = schedule(100, ({ update: delayedUpdate }) => {
          delayedUpdate({ fired: true });
        });

        update({ fired: false });
        cancel();
      }),
    ]);

    const instance = flow.createInstance();

    await instance.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(instance.getSnapshot().context.fired).toBe(false);

    vi.useRealTimers();
  });

  it('does not require a final build call', async () => {
    const flow = createFlow({
      name: 'no-build',
      context: z.object({ count: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0 },
    }).step('idle', ({ on }) =>
      on('INC', {}, ({ ctx, update }) => {
        update({ count: ctx.count + 1 });
      }),
    );

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'INC' });

    expect(instance.getSnapshot().context.count).toBe(1);
  });

  it('allows requestStep success events without an empty shape or payload object', async () => {
    const deferred = createDeferred<void>();

    const flow = createFlow({
      name: 'request-step-no-payload',
      context: z.object({ saved: z.boolean() }),
      states: ['idle', 'saving', 'done'] as const,
      initial: 'idle',
      initialContext: { saved: false },
    })
      .step('idle', ({ on, states }) =>
        on('SAVE', {}, states.saving, ({ goto }) => {
          goto(states.saving);
        }),
      )
      .step('saving', (api) =>
        requestStep(api, {
          run: ({ effect }) => effect('persist', () => deferred.promise),
          success: {
            type: 'SAVED',
            target: api.states.done,
            handle: ({ goto, update }) => {
              update({ saved: true });
              goto(api.states.done);
            },
          },
          failure: {
            type: 'FAILED',
            shape: { message: z.string() },
            target: api.states.idle,
            mapError: () => ({ message: 'Save failed.' }),
          },
        }),
      )
      .step('done');

    const instance = flow.createInstance();
    const dispatchPromise = instance.dispatch({ type: 'SAVE' });

    deferred.resolve();
    await dispatchPromise;

    expect(instance.getSnapshot()).toMatchObject({
      state: 'done',
      context: { saved: true },
      pendingEffects: [],
    });
  });

  it('clears scheduled tasks when transitioning out of the owning state', async () => {
    vi.useFakeTimers();

    const flow = createFlow({
      name: 'schedule-transition-clear',
      context: z.object({ closedByDelay: z.boolean() }),
      states: ['idle', 'waiting', 'done'] as const,
      initial: 'idle',
      initialContext: { closedByDelay: false },
    })
      .step('idle', ({ on, states }) => [
        on('BEGIN', {}, { targets: [states.waiting] as const }, ({ goto }) => {
          goto(states.waiting);
        }),
      ])
      .step('waiting', ({ enter, on, states }) => [
        enter(({ schedule, states: stateRefs }) => {
          schedule(100, ({ goto, update }) => {
            update({ closedByDelay: true });
            goto(stateRefs.done);
          });
        }),
        on('CANCEL', {}, { targets: [states.done] as const }, ({ goto }) => {
          goto(states.done);
        }),
      ])
      .step('done', () => []);

    const instance = flow.createInstance();

    await instance.dispatch({ type: 'BEGIN' });
    expect(instance.getSnapshot().state).toBe('waiting');

    await instance.dispatch({ type: 'CANCEL' });
    expect(instance.getSnapshot().state).toBe('done');

    await vi.advanceTimersByTimeAsync(100);

    expect(instance.getSnapshot().state).toBe('done');
    expect(instance.getSnapshot().context.closedByDelay).toBe(false);

    vi.useRealTimers();
  });

  it('clears previously scheduled work before re-entering the same state', async () => {
    vi.useFakeTimers();

    const flow = createFlow({
      name: 'schedule-self-transition-clear',
      context: z.object({ firedCount: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { firedCount: 0 },
    }).step('idle', ({ enter, on, states }) => [
      enter(({ schedule, update }) => {
        schedule(100, ({ getSnapshot: readSnapshot, update: delayedUpdate }) => {
          delayedUpdate({ firedCount: readSnapshot().context.firedCount + 1 });
        });
        update({ firedCount: 0 });
      }),
      on('REARM', {}, states.idle, ({ goto }) => {
        goto(states.idle);
      }),
    ]);

    const instance = flow.createInstance();

    await instance.start();
    await vi.advanceTimersByTimeAsync(50);

    await instance.dispatch({ type: 'REARM' });
    await vi.advanceTimersByTimeAsync(50);

    expect(instance.getSnapshot().context.firedCount).toBe(0);

    await vi.advanceTimersByTimeAsync(50);

    expect(instance.getSnapshot().context.firedCount).toBe(1);

    vi.useRealTimers();
  });

  it('clears pending effects when leaving the owning state before they settle', async () => {
    vi.useFakeTimers();

    const deferred = createDeferred<void>();
    let capturedSignal: AbortSignal | undefined;

    const flow = createFlow({
      name: 'effect-transition-clear',
      context: z.object({ staleWriteApplied: z.boolean() }),
      states: ['waiting', 'done'] as const,
      initial: 'waiting',
      initialContext: { staleWriteApplied: false },
    })
      .step('waiting', ({ enter, states }) => [
        enter(async ({ effect, schedule, update }) => {
          schedule(50, ({ goto }) => {
            goto(states.done);
          });

          await effect('persist', (signal) => {
            capturedSignal = signal;
            return deferred.promise;
          });
          update({ staleWriteApplied: true });
        }),
      ])
      .step('done');

    const instance = flow.createInstance();
    const startPromise = instance.start();

    await Promise.resolve();

    expect(instance.getSnapshot().pendingEffects).toEqual(['persist']);

    await vi.advanceTimersByTimeAsync(50);

    expect(instance.getSnapshot().state).toBe('done');
    expect(instance.getSnapshot().pendingEffects).toEqual([]);
  expect(capturedSignal?.aborted).toBe(true);

    deferred.resolve();
    await startPromise;

    expect(instance.getSnapshot().context.staleWriteApplied).toBe(false);

    vi.useRealTimers();
  });

  it('clears prior state-owned effects before self-reentry settles them', async () => {
    vi.useFakeTimers();

    const firstDeferred = createDeferred<void>();
    const secondDeferred = createDeferred<void>();
    let firstSignal: AbortSignal | undefined;
    let secondSignal: AbortSignal | undefined;
    let enterCount = 0;

    const flow = createFlow({
      name: 'effect-self-transition-clear',
      context: z.object({ staleWriteApplied: z.boolean(), currentRun: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { staleWriteApplied: false, currentRun: 0 },
    }).step('idle', ({ enter, on, states }) => [
      enter(async ({ effect, update }) => {
        enterCount += 1;
        update({ currentRun: enterCount });

        await effect('persist', (signal) => {
          if (enterCount === 1) {
            firstSignal = signal;
            return firstDeferred.promise;
          }

          secondSignal = signal;
          return secondDeferred.promise;
        });

        update({ staleWriteApplied: true });
      }),
      on('REENTER', {}, states.idle, ({ goto }) => {
        goto(states.idle);
      }),
    ]);

    const instance = flow.createInstance();
    const startPromise = instance.start();

    await Promise.resolve();

    expect(instance.getSnapshot().pendingEffects).toEqual(['persist']);
    expect(instance.getSnapshot().context.currentRun).toBe(1);

    const reenterPromise = instance.dispatch({ type: 'REENTER' });

    await Promise.resolve();

    expect(instance.getSnapshot().pendingEffects).toEqual(['persist']);
    expect(instance.getSnapshot().context.currentRun).toBe(2);
  expect(firstSignal?.aborted).toBe(true);
  expect(secondSignal?.aborted).toBe(false);

    firstDeferred.resolve();
    await startPromise;

    expect(instance.getSnapshot().context.staleWriteApplied).toBe(false);
    expect(instance.getSnapshot().pendingEffects).toEqual(['persist']);

    secondDeferred.resolve();
    await reenterPromise;

    expect(instance.getSnapshot().context.staleWriteApplied).toBe(true);
    expect(instance.getSnapshot().pendingEffects).toEqual([]);

    vi.useRealTimers();
  });

  it('aborts active effects when an instance is destroyed', async () => {
    const deferred = createDeferred<void>();
    let capturedSignal: AbortSignal | undefined;

    const flow = createFlow({
      name: 'effect-destroy-abort',
      context: z.object({ ready: z.boolean() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { ready: false },
    }).step('idle', ({ enter }) => [
      enter(async ({ effect, update }) => {
        await effect('persist', (signal) => {
          capturedSignal = signal;
          return deferred.promise;
        });
        update({ ready: true });
      }),
    ]);

    const instance = flow.createInstance();
    const startPromise = instance.start();

    await Promise.resolve();

    expect(instance.getSnapshot().pendingEffects).toEqual(['persist']);

    instance.destroy();

    expect(capturedSignal?.aborted).toBe(true);
    expect(instance.getSnapshot().pendingEffects).toEqual([]);

    deferred.resolve();
    await startPromise;

    expect(instance.getSnapshot().context.ready).toBe(false);
  });

  it('rejects dispatch when an event handler throws', async () => {
    const flow = createFlow({
      name: 'handler-throws',
      context: z.object({ count: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0 },
    }).step('idle', ({ on }) => [
      on('FAIL', {}, () => {
        throw new Error('handler failed');
      }),
    ]);

    const instance = flow.createInstance();

    await expect(instance.dispatch({ type: 'FAIL' })).rejects.toThrow('handler failed');
    expect(instance.getSnapshot().context.count).toBe(0);
    expect(instance.getSnapshot().state).toBe('idle');
    expect(instance.getSnapshot().lastEvent).toEqual({ type: 'FAIL' });
  });

  it('clears pending effects when an effect rejects during dispatch', async () => {
    const deferred = createDeferred<void>();

    const flow = createFlow({
      name: 'effect-rejects',
      context: z.object({ attempted: z.boolean() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { attempted: false },
    }).step('idle', ({ on }) => [
      on('RUN', {}, async ({ effect, update }) => {
        update({ attempted: true });
        await effect('persist', () => deferred.promise);
      }),
    ]);

    const instance = flow.createInstance();
    const dispatchPromise = instance.dispatch({ type: 'RUN' });

    await Promise.resolve();

    expect(instance.getSnapshot().pendingEffects).toEqual(['persist']);

    deferred.reject(new Error('persist failed'));

    await expect(dispatchPromise).rejects.toThrow('persist failed');
    expect(instance.getSnapshot().pendingEffects).toEqual([]);
    expect(instance.getSnapshot().context.attempted).toBe(true);
  });

  it('continues processing queued external dispatches after the active handler rejects', async () => {
    const deferred = createDeferred<void>();

    const flow = createFlow({
      name: 'queued-dispatch-after-error',
      context: z.object({ count: z.number(), order: z.array(z.string()) }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0, order: [] },
    }).step('idle', ({ on }) => [
      on('FIRST', {}, async ({ ctx, effect, update }) => {
        update({ order: [...ctx.order, 'first:start'] });
        await effect('first', () => deferred.promise);
      }),
      on('SECOND', {}, ({ ctx, update }) => {
        update({
          count: ctx.count + 1,
          order: [...ctx.order, 'second'],
        });
      }),
    ]);

    const instance = flow.createInstance();
    const firstDispatchPromise = instance.dispatch({ type: 'FIRST' });

    await Promise.resolve();

    const secondDispatchPromise = instance.dispatch({ type: 'SECOND' });

    deferred.reject(new Error('first failed'));

    await expect(firstDispatchPromise).rejects.toThrow('first failed');
    await expect(secondDispatchPromise).resolves.toBeUndefined();

    expect(instance.getSnapshot().context).toEqual({
      count: 1,
      order: ['first:start', 'second'],
    });
    expect(instance.getSnapshot().pendingEffects).toEqual([]);
    expect(instance.getSnapshot().lastEvent).toEqual({ type: 'SECOND' });
  });

  it('settles queued external dispatches without running them after destroy', async () => {
    const deferred = createDeferred<void>();

    const flow = createFlow({
      name: 'queued-dispatch-destroy',
      context: z.object({ count: z.number(), order: z.array(z.string()) }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0, order: [] },
    }).step('idle', ({ on }) => [
      on('FIRST', {}, async ({ ctx, effect, update }) => {
        update({ order: [...ctx.order, 'first:start'] });
        await effect('first', () => deferred.promise);
        update((currentContext) => ({
          count: currentContext.count + 1,
          order: [...currentContext.order, 'first:end'],
        }));
      }),
      on('SECOND', {}, ({ ctx, update }) => {
        update({
          count: ctx.count + 1,
          order: [...ctx.order, 'second'],
        });
      }),
    ]);

    const instance = flow.createInstance();
    const firstDispatchPromise = instance.dispatch({ type: 'FIRST' });

    await Promise.resolve();

    const secondDispatchPromise = instance.dispatch({ type: 'SECOND' });

    instance.destroy();

    deferred.resolve();
    await Promise.all([firstDispatchPromise, secondDispatchPromise]);

    expect(instance.getSnapshot().context).toEqual({
      count: 0,
      order: ['first:start'],
    });
    expect(instance.getSnapshot().pendingEffects).toEqual([]);
    expect(instance.getSnapshot().lastEvent).toEqual({ type: 'FIRST' });
  });

  it('rejects start when an enter handler throws', async () => {
    const flow = createFlow({
      name: 'enter-throws',
      context: z.object({ ready: z.boolean() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { ready: false },
    }).step('idle', ({ enter }) => [
      enter(() => {
        throw new Error('enter failed');
      }),
    ]);

    const instance = flow.createInstance();

    await expect(instance.start()).rejects.toThrow('enter failed');
    expect(instance.getSnapshot().state).toBe('idle');
    expect(instance.getSnapshot().context.ready).toBe(false);
  });

  it('can auto-start an instance from the flow definition', async () => {
    const flow = createFlow({
      name: 'auto-start-instance',
      context: z.object({ entered: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { entered: 0 },
    }).step('idle', ({ enter }) => [
      enter(({ ctx, update }) => {
        update({ entered: ctx.entered + 1 });
      }),
    ]);

    const instance = flow.createInstance({ autoStart: true });

    await Promise.resolve();

    expect(instance.getSnapshot().context.entered).toBe(1);
  });

  it('does not rerun enter handlers when start is called after auto-start', async () => {
    const order: string[] = [];

    const flow = createFlow({
      name: 'auto-start-idempotent',
      context: z.object({ entered: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { entered: 0 },
    }).step('idle', ({ enter }) => [
      enter(({ ctx, update }) => {
        order.push('enter');
        update({ entered: ctx.entered + 1 });
      }),
    ]);

    const instance = flow.createInstance({ autoStart: true });

    await Promise.resolve();
    await instance.start();

    expect(order).toEqual(['enter']);
    expect(instance.getSnapshot().context.entered).toBe(1);
  });

  it('supports send as an alias for external dispatch', async () => {
    const flow = createFlow({
      name: 'send-alias',
      context: z.object({ count: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0 },
    }).step('idle', ({ on }) => [
      on('INC', {}, ({ ctx, update }) => {
        update({ count: ctx.count + 1 });
      }),
    ]);

    const instance = flow.createInstance();

    await instance.send({ type: 'INC' });

    expect(instance.getSnapshot().context.count).toBe(1);
  });

  it('keeps send usable when passed around as a callback', async () => {
    const flow = createFlow({
      name: 'send-callback',
      context: z.object({ count: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0 },
    }).step('idle', ({ on }) => [
      on('INC', {}, ({ ctx, update }) => {
        update({ count: ctx.count + 1 });
      }),
    ]);

    const instance = flow.createInstance();
    const send = instance.send;

    await send({ type: 'INC' });

    expect(instance.getSnapshot().context.count).toBe(1);
  });
});
