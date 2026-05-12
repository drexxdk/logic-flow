# Progress

## Current Status

The initial proof of concept is in place.

Completed so far:

- created a standalone pnpm workspace at `logic-flow`
- added a publishable package in `packages/logic-flow`
- added a Vite + React demo app in `apps/demo`
- implemented the first `createFlow(...)` runtime and builder API
- added Zod-validated context and event schemas
- added support for typed handlers, `update(...)`, `goto(...)`, `effect(...)`, and `schedule(...)`
- added snapshot subscription support for UI integration
- added focused tests for validation, branching, async effects, and delayed transitions
- validated that the workspace passes `pnpm typecheck`, `pnpm lint`, and `pnpm build`

## What Exists Right Now

### Package

- `createFlow(...)` builder
- flow instance creation
- typed event dispatch
- context validation and event validation with Zod
- explicit named states
- pending effect tracking
- delayed enter-time transitions

### Demo

- rename flow example
- publishing flow example
- React hook for using a flow instance in UI
- snapshot rendering to make runtime state visible during development

## Known Limits

This is still an early prototype.

Not implemented yet:

- a polished high-level authoring API on top of the current low-level builder
- reusable packaged helpers for common async and form patterns
- cancellation model for long-running effects
- child flows or nested workflows
- history states, parallel states, or advanced orchestration features
- devtools or structured inspection UI
- documentation beyond the README and demo code

## Next Steps

### API

- design a cleaner public API layer on top of `createFlow(...)`
- reduce the amount of low-level runtime surface exposed to consumers
- decide which primitives are core and which should become helpers

### Reuse

- add reusable helpers for form validation, async mutation flows, and delayed redirects
- add small composable utilities instead of pushing consumers toward config-driven patterns again

### Package Quality

- add more runtime tests, especially for edge cases and re-entrant event flows
- add pack validation and inspect the published tarball contents
- decide on final package naming and publishing metadata

### Demo and Docs

- improve the demo UX and explain the patterns being shown
- add side-by-side examples comparing XState-style authoring and `logic-flow`
- add usage docs for the core API and intended extension points

## Recommended Immediate Focus

The next best implementation step is to shape a stronger public authoring API before adding more features. The current runtime is enough to prove the direction, but the product value will come from making common workflow code feel obviously better than the XState object model.

For a detailed roadmap focused on replacing XState over time, see [docs/xstate-replacement-plan.md](docs/xstate-replacement-plan.md).
