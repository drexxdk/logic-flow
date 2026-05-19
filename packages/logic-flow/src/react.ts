import type { FlowDefinition, FlowEvent, FlowInstance, FlowSnapshot } from './createFlow';
import { useEffect, useRef, useState } from 'react';

function readInitialSnapshot<TContext, TEvent extends FlowEvent, TState extends string>(
  definition: FlowDefinition<TContext, TEvent, TState>,
): FlowSnapshot<TContext, TState, TEvent> {
  const instance = definition.createInstance();
  const snapshot = instance.getSnapshot();

  instance.destroy();

  return snapshot;
}

export function useFlow<TContext, TEvent extends FlowEvent, TState extends string>(
  definition: FlowDefinition<TContext, TEvent, TState>,
) {
  const instanceRef = useRef<FlowInstance<TContext, TEvent, TState> | null>(null);
  const [snapshot, setSnapshot] = useState<FlowSnapshot<TContext, TState, TEvent>>(() =>
    readInitialSnapshot(definition),
  );

  useEffect(() => {
    setSnapshot(readInitialSnapshot(definition));

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

  const send: FlowInstance<TContext, TEvent, TState>['send'] = ((
    eventOrDefinition: TEvent,
    payload?: unknown,
  ) => {
    if (!instanceRef.current) {
      return Promise.reject(new Error('Cannot send an event after the flow instance is inactive.'));
    }

    return instanceRef.current.send(eventOrDefinition as never, payload as never);
  }) as FlowInstance<TContext, TEvent, TState>['send'];

  return {
    instance: instanceRef.current,
    snapshot,
    send,
  };
}
