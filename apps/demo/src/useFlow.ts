import type { FlowEvent, FlowInstance, FlowSnapshot } from 'logic-flow';
import { useEffect, useMemo, useState } from 'react';

interface IFlowDefinition<TContext, TEvent extends FlowEvent, TState extends string> {
  createInstance(): FlowInstance<TContext, TEvent, TState>;
}

export function useFlow<TContext, TEvent extends FlowEvent, TState extends string>(
  definition: IFlowDefinition<TContext, TEvent, TState>,
) {
  const instance = useMemo(() => definition.createInstance(), [definition]);
  const [snapshot, setSnapshot] = useState<FlowSnapshot<TContext, TState, TEvent>>(() =>
    instance.getSnapshot(),
  );

  useEffect(() => {
    const unsubscribe = instance.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    void instance.start();

    return () => {
      unsubscribe();
      instance.destroy();
    };
  }, [instance]);

  return {
    instance,
    snapshot,
    send: (event: TEvent) => {
      void instance.dispatch(event);
    },
  };
}
