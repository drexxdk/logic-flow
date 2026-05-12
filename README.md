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
- subscriptions and snapshots for UI integration

This is intentionally narrow. It is a proof of concept for the authoring model, not a complete replacement for advanced statechart features.

## API Shape

Flows define shared context and the list of state names up front. Events are declared inside the step that handles them, and you can optionally declare transition targets up front for stronger editor help.

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

## Workspace

- `packages/logic-flow`: publishable npm package
- `apps/demo`: Vite + React playground using the local package

## Package Structure

### `packages/logic-flow`

The npm package contains the runtime and public API.

- `src/createFlow.ts`: core runtime and builder API
- `src/index.ts`: package entrypoint
- `test/createFlow.test.ts`: focused runtime tests

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
