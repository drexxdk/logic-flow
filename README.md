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

- a small runtime for creating flows from typed context and event schemas
- named steps with typed event handlers
- context updates through explicit `update(...)`
- state transitions through explicit `goto(...)`
- async effects with pending-effect tracking
- delayed transitions via `schedule(...)`
- subscriptions and snapshots for UI integration

This is intentionally narrow. It is a proof of concept for the authoring model, not a complete replacement for advanced statechart features.

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
