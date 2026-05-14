import type { FlowDefinition, FlowEvent, FlowInstance, FlowSnapshot } from './createFlow';
import { useEffect, useRef, useState } from 'react';

export function useFlow<TContext, TEvent extends FlowEvent, TState extends string>(
  definition: FlowDefinition<TContext, TEvent, TState>,
) {
  const instanceRef = useRef<FlowInstance<TContext, TEvent, TState> | null>(null);
  const [snapshot, setSnapshot] = useState<FlowSnapshot<TContext, TState, TEvent>>(() => ({
    state: definition.initial,
    context: definition.initialContext,
    pendingEffects: [],
  }));

  useEffect(() => {
    const instance = definition.createInstance({ autoStart: true });
    instanceRef.current = instance;
    setSnapshot(instance.getSnapshot());

    const unsubscribe = instance.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return () => {
      unsubscribe();
      if (instanceRef.current === instance) {
        instanceRef.current = null;
      }
      instance.destroy();
    };
  }, [definition]);

  const send = (event: TEvent) => instanceRef.current?.send(event) ?? Promise.resolve();

  return {
    instance: instanceRef.current,
    snapshot,
    send,
  };
}
