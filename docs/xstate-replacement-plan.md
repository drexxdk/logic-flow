# XState Replacement Plan

## Goal

This document defines what `logic-flow` would need in order to replace XState for a meaningful set of real applications, not just simple demos.

The target is not perfect feature parity with every XState capability. The target is:

- cover the features most teams actually rely on in production
- keep the authoring model code-first and TypeScript-native
- preserve strong editor help and runtime safety
- make migration from XState legible through docs and demos

## Current Position

`logic-flow` is already a credible proof of concept for small and medium workflows that benefit from explicit states but do not need full statechart machinery.

Today it is strongest at:

- flat named-state workflows
- step-local event declarations
- typed event payload inference with Zod validation
- explicit context updates through `update(...)`
- explicit transitions through `goto(...)`
- internal event feedback through `dispatch(...)`
- async side effects through `effect(...)`
- delayed work through `schedule(...)`
- snapshot subscriptions for React or other UI integration
- editor enforcement around terminal flow operations through `eslint-plugin-logic-flow`
- inspectable declared transition targets through `flow.transitions`

That is enough for forms, approval flows, CRUD mutations, async request lifecycles, and many UI wizards.

It is not yet enough to replace XState in larger systems where orchestration, nesting, cancellation, and actor-like composition are the main value.

## Current Features

### Runtime and Authoring

- `createFlow(...)` builder with explicit `states`, `initial`, and `initialContext`
- per-step `on(...)` handlers with local event declaration
- per-step `enter(...)` hooks
- typed `states.*` references instead of raw transition strings
- optional `targets` metadata to narrow `goto(...)`
- `flow.transitions` metadata for declared graph edges
- terminal semantics for `goto(...)` inside handlers and `enter(...)`
- terminal semantics for internal flow-api `dispatch(...)`

### Type Safety and Validation

- Zod validation for context
- Zod validation for event payloads
- inferred event unions from step-local declarations
- typed event payload access inside handlers
- typed snapshot access for state, context, last event, and pending effects

### Async and Scheduling

- `effect(name, task)` for tracked async work
- `pendingEffects` snapshot visibility
- `schedule(ms, task)` for delayed work from enter hooks
- queued instance dispatch processing

### UI and Tooling

- React demo app showing realistic usage
- `useFlow(...)` integration pattern in the demo
- ESLint plugin for terminal flow operation mistakes
- dedicated execution semantics documentation

### Validation Coverage

- runtime tests for validation, branching, async effects, delayed transitions, and terminal execution behavior
- workspace validation through lint, typecheck, test, and build

## Missing Features That Matter For XState Replacement

The following gaps are ordered by product importance rather than implementation ease.

### 1. Child Flows and Actor-Style Composition

Why it matters:

- XState scales because machines can invoke or spawn other machines
- larger systems need isolated workflow units that communicate through events and lifecycle boundaries
- without this, application code has to manually orchestrate multiple flows outside the runtime

What is missing:

- child flow spawning or invocation
- parent-child event routing
- lifecycle ownership of child flows
- completion, failure, and cancellation semantics for children
- a typed way to observe child snapshots

Target outcome:

- flows can invoke other flows as first-class runtime objects
- parent flows can react to child completion or failure without manual glue code

### 2. Exit Hooks and Cancellation Semantics

Why it matters:

- async work must stop or become irrelevant when the flow leaves a state
- timers, requests, and subscriptions need structured cleanup
- correctness breaks down quickly without cancellation rules

What is missing:

- `exit(...)` lifecycle support
- cancellation tokens or abort signals for effects
- automatic cleanup of state-owned async work on transition
- a clear ownership model for scheduled tasks and long-running work

Target outcome:

- every state can define cleanup logic
- effects and schedules can be cancelled or invalidated on transition
- authors do not need ad hoc guard flags to avoid stale async writes

### 3. Hierarchical States

Why it matters:

- many real workflows need shared behavior across nested substates
- parent states reduce duplication for common handlers and lifecycle logic
- some XState migrations will stall immediately without nesting

What is missing:

- nested state definitions
- parent fallback event handling
- parent enter and exit lifecycle behavior
- a snapshot model that can represent nested active states

Target outcome:

- flows can model parent-child state structure without flattening everything into long state names

### 4. Final, Done, and History Semantics

Why it matters:

- larger orchestrations often depend on completion signals
- returning to prior substates is a common need
- final and history semantics reduce manual bookkeeping in context

What is missing:

- final states
- flow completion status beyond current state name
- `done`-style completion events
- shallow and deep history support

Target outcome:

- flows can complete in a structured way and resume prior nested state where appropriate

### 5. Parallel States or a Clear Alternative

Why it matters:

- XState supports orthogonal regions for workflows that progress independently but share a parent machine
- some products rely on this heavily for UI and background coordination

What is missing:

- parallel state regions
- synchronization semantics between regions
- combined snapshot representation for parallel activity

Target outcome:

- either implement parallel states directly or define a strong actor-based composition model that makes them unnecessary in common cases

### 6. First-Class Async Invocation Model

Why it matters:

- current async usage is manual `effect(...)` plus `dispatch(...)`
- XState users are used to invoked services with structured success and failure behavior
- first-class async primitives improve reuse, readability, and inspection

What is missing:

- named invoked tasks as a standard pattern
- built-in success and error event mapping
- lifecycle and restart rules for invoked work
- a reusable abstraction for request states that does not require repetitive local wiring

Target outcome:

- common async flows can be expressed with less boilerplate and stronger lifecycle guarantees

### 7. Shared and Global Event Handling

Why it matters:

- local event declaration is good for readability
- real apps still need cross-cutting events such as cancel, reset, retry, auth expiry, or navigation interruption
- requiring every state to redefine these handlers does not scale

What is missing:

- machine-level handlers
- parent-level inherited handlers if hierarchy is added
- explicit precedence rules between local and shared handlers

Target outcome:

- shared workflow behavior can be defined once without losing locality for state-specific events

### 8. Better Inspection, Persistence, and Replay

Why it matters:

- XState offers more confidence because machine behavior is inspectable
- production systems often need persisted snapshots, debug traces, and rehydration

What is missing:

- snapshot restore API
- versioning or migration story for stored snapshots
- event trace or transition log support
- richer graph inspection than declared `targets`

Target outcome:

- flows can be persisted and resumed safely
- developers can inspect transitions and runtime history more deeply than current snapshots allow

### 9. Testing Helpers and Devtools

Why it matters:

- feature parity is not only runtime parity
- migration is easier when teams get tooling support and predictable testing patterns

What is missing:

- dedicated test helpers for stepping flows and asserting transitions
- a browser inspection panel or demo devtools view
- time-travel or event-log-oriented debugging utilities

Target outcome:

- developers can understand and verify flow behavior without reading raw implementation details each time

### 10. Migration Surface and Documentation Depth

Why it matters:

- teams replace XState only if the migration path is obvious
- strong runtime ideas are not enough if the translation model is unclear

What is missing:

- explicit XState-to-logic-flow mapping guides
- side-by-side examples for common machine patterns
- docs for when not to use `logic-flow`
- feature support matrix and tradeoff documentation

Target outcome:

- a team using XState can quickly answer whether a given machine maps cleanly, partially, or not yet

## Features That Are Nice To Have But Not Blocking Yet

These matter later, but they are not the primary blockers for replacing XState in the next stage:

- richer graph visualization
- generated diagrams from flow metadata
- code generators or codemods
- more opinionated helper packages for common domains
- React-specific convenience bindings beyond the demo hook

## Strategy

The core strategic decision should stay the same:

- do not clone XState's config DSL
- keep branching and business logic in plain TypeScript
- add higher-level primitives only where they improve correctness, inspection, or migration clarity

That means new features should be introduced as code-first runtime concepts, not as declarative ceremony for its own sake.

## Proposed Roadmap

### Phase 1: Productize The Current Core

Goal:

- make the existing flat-flow model solid enough that teams can trust it for real UI workflows

Deliverables:

- formalize the public API surface
- tighten docs for current semantics and best practices
- add more tests for re-entrancy, scheduling, and error propagation
- rename or generalize any terminology that still overfits `goto(...)`
- improve the ESLint plugin package, docs, and recommended configuration
- document feature support versus XState at a high level

Exit criteria:

- current feature set is clearly documented, stable, and easy to evaluate

### Phase 2: Add Lifecycle Completeness

Goal:

- make async work and state ownership safe enough for production usage

Deliverables:

- add `exit(...)`
- add cancellation for effects and scheduled work
- define ownership and cleanup rules for state-scoped work
- add tests for cancellation and stale async prevention

Exit criteria:

- authors can write long-running or delayed behavior without manual stale-state defensive code

### Phase 3: Add Composition Through Child Flows

Goal:

- support decomposition of large machines into smaller workflow units

Deliverables:

- child flow invocation API
- parent-child event and completion model
- snapshot access for children
- lifecycle and cleanup semantics for child flows
- examples showing actor-like composition patterns

Exit criteria:

- non-trivial workflows can be split into cooperating flows without losing type safety or runtime clarity

### Phase 4: Add Structured Statechart Features Selectively

Goal:

- cover the subset of statechart semantics that unlock real migration from XState

Deliverables:

- hierarchical states
- final states and completion semantics
- history support
- either parallel states or a documented actor-based alternative

Exit criteria:

- most business machines that currently need XState can be expressed without major conceptual gaps

### Phase 5: Migration and Tooling Layer

Goal:

- make it easy for existing XState users to evaluate, learn, and migrate

Deliverables:

- feature matrix: XState feature, current `logic-flow` equivalent, status, notes
- migration guide with side-by-side examples
- testing helpers and inspection tools
- richer demo page covering the translation story

Exit criteria:

- the project is understandable as an alternative product, not just an interesting runtime experiment

## Demo Page Plan

The demo app should evolve from a playground into a migration showcase.

The goal is not only to prove that features work. The goal is to make an XState user immediately see how the same concepts map into `logic-flow`.

### Demo Objectives

- demonstrate each major XState-style capability that `logic-flow` supports today
- show the recommended `logic-flow` equivalent when the implementation differs from XState
- make unsupported features visible instead of hiding them
- reduce migration risk by showing realistic authoring patterns rather than toy snippets

### Demo Sections To Add

#### 1. Core Workflow Mapping

Show:

- state machine basics
- event handling
- guarded branching through plain TypeScript conditionals
- context updates
- direct transitions with `goto(...)`

Why:

- this is the lowest-friction migration path for XState users

#### 2. Async Invocation Mapping

Show:

- request lifecycle with `effect(...)`
- success and failure routing with `dispatch(...)`
- pending effect visibility in the UI

Why:

- async service invocation is one of the first patterns teams look for

#### 3. Delayed Transitions Mapping

Show:

- time-based transitions via `schedule(...)`
- cancellation behavior once cancellation exists

Why:

- delayed transitions are common in success banners, redirects, retries, and polling

#### 4. Shared Behavior Mapping

Show:

- the current recommended pattern for shared behavior across states
- later, machine-level or parent-level handlers if added

Why:

- XState users expect to model reset, cancel, and retry without duplicating logic everywhere

#### 5. Composition Mapping

Show:

- once child flows exist, a demo where a parent flow coordinates child work

Why:

- this is the point where the project starts to compete with XState in larger applications

#### 6. Unsupported Or Planned Features

Show:

- a visible list of features not yet implemented, such as hierarchy, history, or parallel states
- the planned `logic-flow` direction for each one

Why:

- honest gaps improve credibility and help users judge fit

### Demo UX Requirements

- each example should display current state, context, last event, and pending effects
- each example should show the authored `logic-flow` code beside the live demo
- each example should include a short "XState concept -> logic-flow equivalent" note
- the page should separate "supported now", "supported differently", and "planned" examples
- the page should remain simple enough that the code is still readable

## Recommended Implementation Order

If the goal is to maximize product value rather than chase raw feature count, the implementation order should be:

1. Stabilize the current flat-flow API and docs.
2. Add exit and cancellation semantics.
3. Add child flow composition.
4. Upgrade the demo into a migration-focused showcase.
5. Add hierarchical, final, and history semantics.
6. Decide whether parallel states should be native or replaced by composition guidance.
7. Add testing helpers and richer inspection tooling.

## Definition Of Success

`logic-flow` can be considered a serious XState replacement candidate when all of the following are true:

- common XState workflows have a documented and ergonomic `logic-flow` equivalent
- async and delayed behavior are safe without manual defensive patterns
- larger workflows can be decomposed through child flows or equivalent composition primitives
- the docs and demo make migration decisions fast
- unsupported features are explicit, narrow, and strategically chosen

Until then, the right framing is:

- strong lightweight alternative for many workflow problems now
- promising but incomplete XState replacement path overall
