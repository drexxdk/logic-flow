# logic-flow

`logic-flow` is a code-first workflow runtime for TypeScript and Zod.

It is designed for explicit flat workflows where named states, typed events, and inspectable snapshots matter more than full statechart feature parity.

## Supported 0.1.x Surface

The package entrypoint intentionally exposes a small public contract.

Runtime exports:

- `createFlow`
- `defineEvent`
- `FlowCancellationError`
- `requestStep`
- `FlowInstance`
- `isFlowCancellationError`

Type exports:

- `FlowDefinition`
- `FlowBuilder`
- `FlowEvent`
- `FlowEventDefinition`
- `FlowInstanceOptions`
- `FlowSnapshot`

Anything else in the source should be treated as internal implementation detail.

## When It Fits

`logic-flow` is a good fit today when you need:

- flat named workflows with explicit state transitions
- typed event payloads validated with Zod
- state-local event declarations instead of global event maps
- state lifecycle hooks through `enter(...)` and `exit(...)`
- async request lifecycles driven by `enter(...)`, `effect(...)`, and `requestStep(...)`
- state-scoped effect ownership so stale async completions do not write after a transition
- `AbortSignal` support inside `effect(...)` tasks for cooperative cancellation
- delayed transitions and snapshot subscriptions for UI integration

It is not the right tool yet when your workflow depends on:

- child machines or actor-style composition
- richer cancellation primitives beyond cooperative `AbortSignal` support
- hierarchical, history, or parallel state semantics
- persistence, restore, or dedicated devtools support

If those missing features are the reason you use XState today, keep XState for that slice or treat `logic-flow` as a narrower workflow tool for now.

## XState Evaluation

For teams comparing this package to XState, the current translation is roughly:

- machine states -> `states: [...]` plus `.step(...)`
- `assign(...)` -> `update(...)`
- guarded branching -> normal TypeScript `if` / `else`
- `send(...)` to the same machine -> flow-api `dispatch(...)`
- delayed `after` transitions -> `schedule(...)`
- invoked request state -> `enter(...)` with `effect(...)`, or `requestStep(...)` for the common success/failure pattern

The main difference is authoring style: `logic-flow` keeps branching and workflow logic in ordinary functions instead of moving most behavior into a configuration object.

## Authoring Model

Flows define shared context and state names up front, then attach state-local event handlers and lifecycle hooks step by step.

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
      await effect('publishRequest', async (signal) => {
        if (signal.aborted) {
          return;
        }

        await Promise.resolve();
      });
      update({ published: true });
      goto(states.done);
    }),
  ])
  .step('done');
```

The supported step authoring contract is return-value-based:

- return an array when a step has multiple registrations
- return a single registration directly for one-handler steps
- use `.step('done')` for empty states

There is no separate final `.build()` call. A flow is ready once every declared state has been defined.

This is deliberate. The package currently favors that explicit return-value shape because it preserves stronger event inference for external `dispatch(...)` and `send(...)`.

## Helpers

`defineEvent(...)` lets you reuse an event contract across multiple steps or when sending the same event shape from outside the flow.

`requestStep(...)` packages the common async request-state pattern of:

- running work in `enter(...)`
- dispatching typed success or failure events
- keeping the resulting registrations part of the normal step contract

Cooperative cancellation is treated separately from failure. If `config.run(...)` ends because the active execution was cancelled, `requestStep(...)` does not call `mapError(...)` or dispatch the failure event.

When a success event has no payload, omit `shape` and let `run(...)` return `void`.

## Runtime Semantics

The current runtime guarantees:

- `goto(...)` is terminal inside a handler or `enter(...)` hook
- internal flow-api `dispatch(...)` is also terminal within the current execution
- `exit(...)` runs before a state is left, including teardown through `destroy()`
- `getSnapshot()` and `subscribe(...)` expose frozen snapshot copies so consumers cannot mutate runtime state out of band
- external `instance.dispatch(...)` and `instance.send(...)` calls queue in order while work is active, and later queued events still settle even after an earlier failure
- `start()` runs initial enter handlers once per instance
- `destroy()` clears timers, prevents stale async completions from mutating the snapshot, and settles queued calls that never started
- `effect(...)` passes an `AbortSignal` to the task and owns that work by active state execution, so leaving the state aborts cooperative tasks, clears pending effect names, and makes stale completions inert
- `FlowCancellationError` and `isFlowCancellationError(...)` are part of the public contract for cooperative effect cancellation
- `schedule(...)` work is tied to the current state execution

See the workspace [README.md](../../README.md) and [docs/execution-semantics.md](../../docs/execution-semantics.md) for the broader project status and detailed behavior rules.
