# Progress

## Current Status

The initial proof of concept is in place, and the core runtime is now meaningfully hardened.

Completed so far:

- created a standalone pnpm workspace at `logic-flow`
- added a publishable package in `packages/logic-flow`
- added a Vite + React demo app in `apps/demo`
- implemented the first `createFlow(...)` runtime and builder API
- added Zod-validated context and event schemas
- added support for typed handlers, `update(...)`, `goto(...)`, `effect(...)`, and `schedule(...)`
- hardened builder validation for duplicate states, duplicate events in a step, and missing step definitions
- made `destroy()` terminal and inert so stale async completions and later external dispatches stop mutating state
- made `start()` idempotent per instance
- validated timer cleanup, queued external dispatch ordering, and error propagation semantics with focused tests
- added `createInstance({ autoStart: true })` and `instance.send(...)` as small consumer-facing ergonomics
- added `.step('done')` support for empty states without weakening event inference
- narrowed the top-level public export surface to consumer-facing types and values only
- added snapshot subscription support for UI integration
- added focused tests for validation, branching, async effects, and delayed transitions
- documented execution semantics and current capabilities in the README and docs
- validated that the workspace passes focused tests, `pnpm typecheck`, `pnpm lint`, and `pnpm build`

## What Exists Right Now

### Package

- `createFlow(...)` builder
- flow instance creation
- typed event dispatch
- context validation and event validation with Zod
- explicit named states
- pending effect tracking
- delayed enter-time transitions
- transition metadata exposed on `flow.transitions`
- instance lifecycle control with `start()`, `destroy()`, and `subscribe(...)`
- `autoStart` instance creation and `send(...)` alias for external callers
- explicit array-returning step registration contract to preserve TypeScript event inference
- optional empty-state declaration with `.step('done')`
- optional single-registration step returns for one-handler states

### Demo

- rename flow example
- publishing flow example
- React hook for using a flow instance in UI
- snapshot rendering to make runtime state visible during development

## Known Limits

This is still an early prototype.

Not implemented yet:

- a polished higher-level authoring API on top of the current low-level builder
- reusable packaged helpers for common async and form patterns
- state-scoped cancellation model for long-running effects
- child flows or nested workflows
- history states, parallel states, or advanced orchestration features
- devtools or structured inspection UI

Current design constraints:

- the supported step authoring contract is the array-returning form, for example `.step('idle', ({ on }) => [on(...)])`
- steps can also return a single registration directly for one-handler states, for example `.step('review', ({ on }) => on(...))`
- a more imperative `step(..., () => { on(...); })` style was prototyped but is not supported because it weakens TypeScript inference for external `dispatch(...)` and `send(...)`
- authoring ergonomics should only be changed when they preserve or improve the current type guarantees

## Next Steps

### API

- design a cleaner public API layer on top of `createFlow(...)`
- reduce the amount of low-level runtime surface exposed to consumers
- decide which primitives are core and which should become helpers
- explore authoring improvements that keep the current event-union inference story intact

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
- document the supported authoring contract explicitly so consumers do not rely on abandoned experimental syntax

## Recommended Immediate Focus

The next best implementation step is still to shape a stronger public authoring API before adding more features, but that work now has a constraint: do not trade away the current TypeScript inference quality to make the syntax shorter. The current runtime is enough to prove the direction, and the next layer should preserve that correctness while making common workflow code feel obviously better than the XState object model.

For a detailed roadmap focused on replacing XState over time, see [docs/xstate-replacement-plan.md](docs/xstate-replacement-plan.md).
