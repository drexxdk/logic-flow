# logic-flow

`logic-flow` is an experiment in building a code-first alternative to XState.

The goal is to keep the good parts of explicit workflows and named states, while making authoring feel like normal TypeScript instead of nested machine configuration. Instead of encoding most logic as large declarative objects with guarded arrays and string-based action references, the project aims to let developers write branching, validation, async effects, and reusable building blocks in ordinary functions.

## Goals

- Write workflow logic like normal code with `if` / `else`, early returns, and extracted helpers.
- Keep explicit named states and inspectable snapshots.
- Validate context and events with Zod.
- Preserve strong TypeScript inference at the package boundary.
- Make reusable workflow building blocks easy to compose.
- Keep the runtime small and focused.

## Current Shape

The first version currently includes:

- a small runtime for creating flows from typed context schemas and step-local events
- named steps with typed event handlers
- context updates through explicit `update(...)`
- state transitions through explicit `goto(...)` with typed `states.*` refs
- async effects with pending-effect tracking
- delayed transitions via `schedule(...)`
- instance lifecycle control through `start()`, `subscribe(...)`, and `destroy()`
- subscriptions and snapshots for UI integration

This is intentionally narrow. It is a proof of concept for the authoring model, not a complete replacement for advanced statechart features.

## API Shape

Flows define shared context and the list of state names up front. Events are declared inside the step that handles them, and you can optionally declare transition targets up front for stronger editor help.

For the runtime rules around `goto(...)`, `dispatch(...)`, terminal execution, and `try/catch`, see [docs/execution-semantics.md](docs/execution-semantics.md).

```ts
import { createFlow } from 'logic-flow';
import { z } from 'zod';

const publishingFlow = createFlow({
  name: 'publishing-demo',
  context: z.object({
    title: z.string(),
    requiresLegalReview: z.boolean(),
    published: z.boolean(),
    error: z.string().optional(),
  }),
  states: ['draft', 'review', 'publishing', 'published'] as const,
  initial: 'draft',
  initialContext: {
    title: 'New workflow runtime',
    requiresLegalReview: true,
    published: false,
  },
})
  .step('draft', ({ on, states }) => [
    on('CHANGE_TITLE', { value: z.string() }, ({ event, update }) => {
      update({ title: event.value, error: undefined, published: false });
    }),
    on(
      'SUBMIT',
      {},
      { targets: [states.review, states.publishing] as const },
      ({ ctx, goto, update }) => {
        if (ctx.title.trim().length < 6) {
          update({ error: 'Title must be at least 6 characters.' });
          return;
        }

        goto(ctx.requiresLegalReview ? states.review : states.publishing);
      },
    ),
  ])
  .step('review', ({ on, states }) => [
    on('APPROVE', {}, ({ goto }) => {
      goto(states.publishing);
    }),
  ])
  .build();
```

What this buys you:

- the event name and the runtime `type` literal are always the same source of truth
- each step declares only the events it can handle
- handler `event` payloads are inferred from the local shape passed to `on(...)`
- transitions can target `states.review` or `states.publishing` instead of repeating raw strings
- optional `targets` metadata narrows `goto(...)` to the declared destinations and is exposed on `flow.transitions`
- the built flow exposes the full inferred event union to `dispatch(...)`

## Runtime Semantics

The current runtime contract is intentionally small but now reasonably explicit:

- `goto(...)` is terminal inside a handler or `enter(...)` hook
- flow-api `dispatch(...)` is also terminal inside a handler or `enter(...)` hook
- `start()` runs the initial enter lifecycle once per instance
- `destroy()` makes the instance inert: queued work, timers, and in-flight async completions stop mutating the snapshot
- `schedule(...)` work is owned by the active state execution and is cleared on cancellation, transition, or destroy
- thrown handler or `enter(...)` errors reject the corresponding `dispatch(...)` or `start()` call
- rejected `effect(...)` work propagates failure but still clears `pendingEffects`

For the full behavior rules and examples, see [docs/execution-semantics.md](docs/execution-semantics.md).

## Capability Snapshot

This is the practical support level today.

| Capability                      | Status    | Notes                                                                           |
| ------------------------------- | --------- | ------------------------------------------------------------------------------- |
| Flat named states               | Supported | Core builder/runtime model                                                      |
| Step-local event declarations   | Supported | Events are declared where they are handled                                      |
| Typed event payloads            | Supported | Inferred from local Zod shapes                                                  |
| Context validation              | Supported | Validated with Zod on initialization and updates                                |
| Direct transitions              | Supported | `goto(...)` plus optional `targets` narrowing                                   |
| Internal event feedback         | Supported | Flow-api `dispatch(...)` is supported and terminal                              |
| Async effects                   | Supported | `effect(...)` tracks pending work                                               |
| Delayed transitions             | Supported | `schedule(...)` supports delayed work scoped to state execution                 |
| Snapshot subscriptions          | Supported | `getSnapshot()` and `subscribe(...)` are available                              |
| Lifecycle disposal              | Supported | `destroy()` clears timers and prevents stale updates                            |
| ESLint authoring rule           | Supported | `logic-flow/terminal-goto`                                                      |
| Child flows / actors            | Not yet   | Planned as the next major capability after lifecycle hardening                  |
| Exit hooks / cancellation model | Not yet   | Current teardown behavior is instance-level, not full state-scoped cancellation |
| Hierarchical states             | Not yet   | Flat states only                                                                |
| History states                  | Not yet   | No history semantics yet                                                        |
| Parallel states                 | Not yet   | No orthogonal regions yet                                                       |
| Persistence / restore API       | Not yet   | Snapshots are inspectable, but no restore contract exists                       |
| Devtools / inspection UI        | Not yet   | Demo exposes snapshots, but there is no dedicated inspector                     |

If you need full XState-style orchestration features today, this project is not there yet. If you need explicit flat workflows with strong typing, local event declaration, async tracking, and inspectable snapshots, the current runtime is already usable.

## Workspace

- `packages/logic-flow`: publishable npm package
- `apps/demo`: Vite + React playground using the local package

## Package Structure

### `packages/logic-flow`

The npm package contains the runtime and public API.

- `src/createFlow.ts`: core runtime and builder API
- `src/index.ts`: package entrypoint
- `test/createFlow.test.ts`: focused runtime tests
- `docs/execution-semantics.md`: behavior and control-flow rules for handlers and enter hooks

### `apps/demo`

The demo is a small React app used to exercise the API in realistic scenarios.

Current demos include:

- a rename flow with validation, async save behavior, and delayed success handling
- a publishing flow with plain branching between review and publish paths

## Development

Install dependencies:

```bash
pnpm install
```

Run the demo app:

```bash
pnpm dev
```

Deploy the demo to GitHub Pages:

1. Enable GitHub Pages in the repository settings and choose GitHub Actions as the source.
2. Push to `main`.
3. The workflow in `.github/workflows/deploy-demo.yml` will build the workspace and publish `apps/demo/dist`.

Run package tests:

```bash
pnpm test
```

Validate the workspace:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## ESLint Plugin

The workspace also publishes `eslint-plugin-logic-flow` for editor and CI checks that complement the runtime.

Current rule:

- `logic-flow/terminal-goto`: reports meaningful statements after `goto(...)` in the same block

Example consumer config:

```js
import js from '@eslint/js';
import logicFlowPlugin from 'eslint-plugin-logic-flow';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  logicFlowPlugin.configs.recommended,
);
```

## Design Direction

The intended direction is:

- normal TypeScript control flow instead of guard arrays
- Zod at runtime boundaries
- explicit but lightweight workflow primitives
- reusable functions instead of string-registered actions and guards

If this project succeeds, the result should feel closer to writing a well-typed workflow runtime in application code than authoring a machine in a config DSL.

## Status

The repo is scaffolded as a standalone pnpm workspace and currently builds, lints, typechecks, and tests successfully.

See `PROGRESS.md` for implementation status and next steps.
