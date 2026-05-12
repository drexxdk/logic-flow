import type { FlowEventSchemas, FlowInstance, FlowSnapshot } from 'logic-flow';
import { useEffect, useMemo, useState } from 'react';

interface IFlowDefinition<TContext, TSchemas extends FlowEventSchemas, TState extends string> {
  createInstance(): FlowInstance<TContext, TSchemas, TState>;
}

export function useFlow<TContext, TSchemas extends FlowEventSchemas, TState extends string>(
  definition: IFlowDefinition<TContext, TSchemas, TState>,
) {
  const instance = useMemo(() => definition.createInstance(), [definition]);
  const [snapshot, setSnapshot] = useState<FlowSnapshot<TContext, TState, unknown>>(() =>
    instance.getSnapshot(),
  );

  useEffect(() => {
    const unsubscribe = instance.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot as FlowSnapshot<TContext, TState, unknown>);
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
    send: (event: Parameters<typeof instance.dispatch>[0]) => {
      void instance.dispatch(event);
    },
  };
}
