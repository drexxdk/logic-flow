# Execution Semantics

This document describes the runtime rules that matter when writing `logic-flow` handlers and lifecycle hooks such as `enter(...)` and `exit(...)`.

The examples here assume the supported array-returning step registration form, for example `.step('idle', ({ on }) => [on(...)])`. That shape is not just stylistic in the current implementation; it is how `logic-flow` preserves the inferred event union exposed through external `dispatch(...)` and `send(...)`.

## Two Kinds Of Control Flow

`logic-flow` exposes two different primitives for changing what happens next:

- `goto(nextState)`: transition directly to another state
- `dispatch(event)`: send an event back through the flow so the current state can react to it

They are related, but they are not the same.

### `goto(...)`

Use `goto(...)` when you already know the next state and want to move there directly.

```ts
on('APPROVE', {}, states.publishing, ({ goto }) => {
  goto(states.publishing);
});
```

### `dispatch(...)`

Use `dispatch(...)` when you want to feed a result back into the normal event model.

```ts
enter(async ({ dispatch, effect }) => {
  await effect('publishRequest', async () => {
    await wait(1000);
  });

  await dispatch({ type: 'PUBLISHED' });
});
```

When the event is defined in the same step, you can also dispatch through the local `on(...)` registration handle instead of building a raw event object.

```ts
.step('publishing', ({ enter, on, states }) => {
  const published = on('PUBLISHED', {}, states.done, ({ goto }) => {
    goto(states.done);
  });

  return [
    enter(async ({ dispatch, effect }) => {
      await effect('publishRequest', async () => {
        await wait(1000);
      });

      await dispatch(published);
    }),
    published,
  ];
})
```

That event is then handled by the matching `on(...)` registration for the current state.

## Terminal Operations Inside Flow Logic

Inside a flow handler or `enter(...)` hook, both `goto(...)` and flow-api `dispatch(...)` are terminal operations.

That means once either of these is called successfully, the current execution context is considered finished.

Examples:

```ts
on('APPROVE', {}, states.publishing, ({ goto }) => {
  goto(states.publishing);

  // unreachable
  console.log('will not run');
});
```

```ts
enter(async ({ dispatch }) => {
  await dispatch({ type: 'PUBLISHED' });

  // unreachable in the same flow execution context
  await dispatch({ type: 'PUBLISHED' });
});
```

The same rule applies when dispatching through a registration handle:

```ts
enter(async ({ dispatch }) => {
  await dispatch(published);

  // unreachable in the same flow execution context
  await dispatch(published);
});
```

This rule exists to prevent stale logic from continuing after the flow has already moved on.

## Why `dispatch(...)` Is Also Terminal

Internal `dispatch(...)` is terminal for the same reason `goto(...)` is terminal: dispatching an event can immediately cause other handlers to run, update context, and transition state.

Allowing the original handler to continue after that would create unstable control flow, for example:

- dispatching the same event twice by accident
- updating context after the flow has already moved to another state
- running cleanup or side effects that no longer match the new state

Because of that, once a handler or `enter(...)` hook dispatches an event through the flow API, that execution path should be treated as done.

## Internal Dispatch vs External Dispatch

This terminal rule applies to `dispatch(...)` called from the flow API inside handlers and `enter(...)` hooks.

It does **not** mean that calling `instance.dispatch(...)` from application code is terminal for your app code. External dispatch is just the public way to send an event into the flow.

External callers can send either a plain event object or a reusable event definition with payload:

```ts
await instance.send({ type: 'FAILED', message: 'Network down' });
await instance.send(failed, { message: 'Network down' });
```

If external code sends another event while the flow is already processing one, that later event is queued and handled after the active execution finishes. That includes re-entrant sends triggered by subscription callbacks or other observer code reacting to snapshot updates.

If the active event handler rejects, later queued external events still continue in order. Each external `instance.dispatch(...)` or `instance.send(...)` call resolves or rejects for its own queued execution chain instead of being stranded behind an earlier failure.

## Instance Lifecycle

`FlowInstance` has two important lifecycle boundaries:

- `start()` runs the initial state's `enter(...)` hooks
- `destroy()` stops the instance from doing further work

Snapshot reads through `getSnapshot()` and `subscribe(...)` are exposed as frozen copies. Consumers can inspect them safely, but runtime state still only changes through handler APIs such as `update(...)`, `goto(...)`, and `dispatch(...)`.

### `start()` runs once per instance

Calling `start()` multiple times on the same instance does not replay the initial enter lifecycle.

This keeps instance startup idempotent for UI integrations that may call startup more than once by mistake or through overlapping effects.

### `exit(...)` runs before leaving a state

When a transition leaves the current state, that state's `exit(...)` handlers run before timers are cleared, the next state is committed, and the next state's `enter(...)` handlers begin.

The same rule applies during `destroy()`: the current state's `exit(...)` handlers run once before the instance becomes inert.

`exit(...)` is intended for synchronous cleanup and observation of the state being left. Its API exposes the current snapshot, state refs, and the triggering event when one exists.

### `destroy()` makes the instance inert

After `destroy()`:

- pending timers are cleared
- pending effect names are removed from the snapshot
- later external `dispatch(...)` calls are ignored
- in-flight async completions and scheduled tasks no longer mutate the snapshot
- already-queued external dispatches settle without running if they have not started yet

This prevents stale work from updating state after the owning UI or runtime has already disposed the flow instance.

## Effect Ownership

`effect(...)` work belongs to the currently active state execution.

The task receives an `AbortSignal` so it can cooperate with cancellation directly:

```ts
enter(async ({ effect }) => {
  await effect('publishRequest', async (signal) => {
    signal.throwIfAborted?.();
    await wait(1000);
  });
});
```

That means when the flow leaves a state:

- the owned effect signals are aborted
- that state's pending effect names are removed from the snapshot immediately
- the old async task may still settle later, but resumed flow logic from that old execution becomes inert
- stale `update(...)`, `goto(...)`, `dispatch(...)`, `schedule(...)`, and nested `effect(...)` calls from the old execution no longer affect the live state

This same invalidation happens on self-transitions and `destroy()`.

This is cooperative cancellation: if the task ignores the signal, the promise may still run until it settles, but stale flow logic from that execution still becomes inert after the state is left.

## Scheduled Work Ownership

Scheduled work created by `schedule(...)` belongs to the currently active state execution.

That means scheduled tasks are cleared when:

- the returned cancellation function is called
- the flow transitions to another state
- the instance is destroyed

This keeps delayed work scoped to the state that created it, instead of allowing old timers to fire after the flow has already moved on.

The same cleanup happens on self-transitions. Re-entering a state clears the previously owned scheduled work before the new enter lifecycle registers replacement timers.

## Transition Metadata

When you know the intended destinations up front, declare them in `targets`.

```ts
on('SUBMIT', {}, [states.review, states.publishing], ({ ctx, goto }) => {
  goto(ctx.requiresLegalReview ? states.review : states.publishing);
});
```

This gives two benefits:

- `goto(...)` is narrowed to the declared targets in the editor
- the declared graph is exposed through `flow.transitions`

## `try/catch` Guidance

Keep `try/catch` blocks narrow around async work.

Good:

```ts
enter(async ({ dispatch, effect }) => {
  try {
    await effect('publishRequest', async () => {
      await wait(1000);
    });
    await dispatch({ type: 'PUBLISHED' });
  } catch {
    await dispatch({ type: 'FAILED', message: 'Publish request failed.' });
  }
});
```

The same guidance applies to the registration-handle form:

```ts
enter(async ({ dispatch, effect }) => {
  try {
    await effect('publishRequest', async () => {
      await wait(1000);
    });
    await dispatch(published);
  } catch {
    await dispatch(failed, { message: 'Publish request failed.' });
  }
});
```

Be careful with broad `try/catch` around flow control primitives. `goto(...)` ends execution by throwing an internal transition signal, so overly broad catches can interfere with transition handling.

## Error Propagation

Errors thrown by event handlers or `enter(...)` hooks are not swallowed by the runtime.

- a thrown event handler causes the corresponding `instance.dispatch(...)` call to reject
- a thrown `enter(...)` hook causes `instance.start()` or the triggering transition to reject
- a rejected `effect(...)` promise rejects the surrounding handler or `enter(...)` hook

The runtime still performs normal `effect(...)` cleanup when an effect rejects, so `pendingEffects` does not stay stuck after a failure.

When multiple external events are queued, one rejected event does not cancel the later queued ones automatically. Their own `dispatch(...)` calls still settle when those later events run.

This means application code should treat `start()` and `dispatch(...)` as async boundaries that may fail, and should catch errors there when the flow author has not handled them inside the workflow itself.

## Editor Enforcement

The companion package `eslint-plugin-logic-flow` provides `logic-flow/terminal-goto`.

That rule reports meaningful statements after:

- `goto(...)`
- `await dispatch(...)`

inside the same block.

Use the lint rule together with the runtime semantics. The runtime prevents stale flow execution; the lint rule makes the problem visible while authoring.
