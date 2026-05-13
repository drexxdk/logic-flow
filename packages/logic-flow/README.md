# logic-flow

`logic-flow` is a code-first workflow runtime for TypeScript and Zod.

It is designed for explicit flat workflows where named states, typed events, and inspectable snapshots matter more than full statechart feature parity.

## Supported 0.1.x Surface

The package entrypoint intentionally exposes a small public contract.

Runtime exports:

- `createFlow`
- `defineEvent`
- `requestStep`
- `FlowInstance`

Type exports:

- `FlowDefinition`
- `FlowEvent`
- `FlowEventDefinition`
- `FlowInstanceOptions`
- `FlowSnapshot`

Anything else in the source should be treated as internal implementation detail.

## Authoring Model

Flows define shared context and state names up front, then attach state-local event handlers and `enter(...)` hooks step by step.

```ts
import { createFlow } from 'logic-flow';
import { z } from 'zod';

const flow = createFlow({
  name: 'publishing-demo',
  context: z.object({
    title: z.string(),
    published: z.boolean(),
  }),
  states: ['draft', 'publishing', 'done'] as const,
  initial: 'draft',
  initialContext: {
    title: 'Hello world',
    published: false,
  },
})
  .step('draft', ({ on, states }) => [
    on('SUBMIT', {}, states.publishing, ({ goto }) => {
      goto(states.publishing);
    }),
  ])
  .step('publishing', ({ enter, states }) => [
    enter(async ({ effect, goto, update }) => {
      await effect('publishRequest', async () => {
        await Promise.resolve();
      });
      update({ published: true });
      goto(states.done);
    }),
  ])
  .step('done')
  .build();
```

The supported step authoring contract is return-value-based:

- return an array when a step has multiple registrations
- return a single registration directly for one-handler steps
- use `.step('done')` for empty states

This is deliberate. The package currently favors that explicit return-value shape because it preserves stronger event inference for external `dispatch(...)` and `send(...)`.

## Helpers

`defineEvent(...)` lets you reuse an event contract across multiple steps or when sending the same event shape from outside the flow.

`requestStep(...)` packages the common async request-state pattern of:

- running work in `enter(...)`
- dispatching typed success or failure events
- keeping the resulting registrations part of the normal step contract

## Runtime Semantics

The current runtime guarantees:

- `goto(...)` is terminal inside a handler or `enter(...)` hook
- internal flow-api `dispatch(...)` is also terminal within the current execution
- `start()` runs initial enter handlers once per instance
- `destroy()` clears timers and prevents stale async completions from mutating the snapshot
- `schedule(...)` work is tied to the current state execution

See the workspace [README.md](../../README.md) and [docs/execution-semantics.md](../../docs/execution-semantics.md) for the broader project status and detailed behavior rules.
