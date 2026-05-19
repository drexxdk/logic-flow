import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createFlow, defineEvent, type FlowEvent } from '../src';
import { useFlow } from '../src/react';

interface HookRender<TContext, TEvent extends FlowEvent, TState extends string> {
  instance: ReturnType<typeof useFlow<TContext, TEvent, TState>>['instance'];
  snapshot: ReturnType<typeof useFlow<TContext, TEvent, TState>>['snapshot'];
  send: ReturnType<typeof useFlow<TContext, TEvent, TState>>['send'];
}

function flushMicrotasks() {
  return Promise.resolve();
}

function createUseFlowHarness<TContext, TEvent extends FlowEvent, TState extends string>(
  definition: Parameters<typeof useFlow<TContext, TEvent, TState>>[0],
) {
  let renderer: ReactTestRenderer | undefined;
  let latest: HookRender<TContext, TEvent, TState> | undefined;

  function Harness() {
    latest = useFlow(definition);
    return null;
  }

  return {
    async mount() {
      await act(async () => {
        renderer = create(createElement(Harness));
        await flushMicrotasks();
      });

      return this;
    },
    latest() {
      if (!latest) {
        throw new Error('Harness did not render useFlow.');
      }

      return latest;
    },
    async unmount() {
      await act(async () => {
        renderer?.unmount();
        await flushMicrotasks();
      });
    },
  };
}

describe('useFlow', () => {
  it('auto-starts the instance and reflects enter-driven updates in the snapshot', async () => {
    const flow = createFlow({
      name: 'react-auto-start',
      context: z.object({ entered: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { entered: 0 },
    }).step('idle', ({ enter }) => [
      enter(({ ctx, update }) => {
        update({ entered: ctx.entered + 1 });
      }),
    ]);

    const harness = await createUseFlowHarness(flow).mount();

    expect(harness.latest().instance).not.toBeNull();
    expect(harness.latest().snapshot.context).toEqual({ entered: 1 });
    expect(Object.isFrozen(harness.latest().snapshot)).toBe(true);
  });

  it('supports sending reusable event definitions through the hook surface', async () => {
    const synced = defineEvent('SYNCED', { itemCount: z.number().int().nonnegative() });

    const flow = createFlow({
      name: 'react-send-runtime',
      context: z.object({ itemCount: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { itemCount: 0 },
    }).step('idle', ({ on }) => [
      on(synced, ({ event, update }) => {
        update({ itemCount: event.itemCount });
      }),
    ]);

    const harness = await createUseFlowHarness(flow).mount();

    await act(async () => {
      await harness.latest().send(synced, { itemCount: 3 });
      await flushMicrotasks();
    });

    expect(harness.latest().snapshot.context).toEqual({ itemCount: 3 });
  });

  it('rejects sends after the hook unmounts and destroys the backing instance', async () => {
    const flow = createFlow({
      name: 'react-send-after-unmount',
      context: z.object({ count: z.number() }),
      states: ['idle'] as const,
      initial: 'idle',
      initialContext: { count: 0 },
    }).step('idle', ({ on }) => [
      on('INC', {}, ({ ctx, update }) => {
        update({ count: ctx.count + 1 });
      }),
    ]);

    const harness = await createUseFlowHarness(flow).mount();
    const { send } = harness.latest();

    await harness.unmount();

    await expect(send({ type: 'INC' })).rejects.toThrow(
      'Cannot send an event after the flow instance is inactive.',
    );
  });
});