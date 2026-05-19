// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createFlow, defineEvent } from '../src';
import { useFlow } from '../src/react';

afterEach(() => {
  cleanup();
});

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

    const { result } = renderHook(() => useFlow(flow));

    await waitFor(() => {
      expect(result.current.instance).not.toBeNull();
      expect(result.current.snapshot.context).toEqual({ entered: 1 });
    });

    expect(Object.isFrozen(result.current.snapshot)).toBe(true);
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

    const { result } = renderHook(() => useFlow(flow));

    await waitFor(() => {
      expect(result.current.instance).not.toBeNull();
    });

    await act(async () => {
      await result.current.send(synced, { itemCount: 3 });
    });

    await waitFor(() => {
      expect(result.current.snapshot.context).toEqual({ itemCount: 3 });
    });
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

    const { result, unmount } = renderHook(() => useFlow(flow));

    await waitFor(() => {
      expect(result.current.instance).not.toBeNull();
    });

    const { send } = result.current;

    unmount();

    await expect(send({ type: 'INC' })).rejects.toThrow(
      'Cannot send an event after the flow instance is inactive.',
    );
  });
});
