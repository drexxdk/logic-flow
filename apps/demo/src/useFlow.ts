import type { FlowDefinition, FlowEvent, FlowSnapshot } from 'logic-flow';
import { useEffect, useMemo, useState } from 'react';

export function useFlow<TContext, TEvent extends FlowEvent, TState extends string>(
  definition: FlowDefinition<TContext, TEvent, TState>,
) {
  const instance = useMemo(() => definition.createInstance({ autoStart: true }), [definition]);
  const [snapshot, setSnapshot] = useState<FlowSnapshot<TContext, TState, TEvent>>(() =>
    instance.getSnapshot(),
  );

  useEffect(() => {
    const unsubscribe = instance.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return () => {
      unsubscribe();
      instance.destroy();
    };
  }, [instance]);

  return {
    instance,
    snapshot,
    send: instance.send,
  };
}
