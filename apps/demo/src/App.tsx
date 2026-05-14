import { PublishingDemo, RenameDemo, SyncDemo } from './examples';

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <span className="eyebrow">logic-flow</span>
        <h1>Typed workflows written like normal code</h1>
        <p>
          This playground is intentionally narrow. It proves out a code-first API with Zod
          validation, reusable helpers, explicit named states, and normal branching.
        </p>
      </section>

      <section className="overview-grid" aria-label="logic-flow evaluation overview">
        <article className="overview-panel overview-panel-supported">
          <span className="overview-label">Supported now</span>
          <h2>Good fit for typed, explicit UI workflows</h2>
          <ul className="overview-list">
            <li>Flat named states with local event declarations</li>
            <li>Zod-validated context and event payloads</li>
            <li>
              Async request states through `enter(...)`, `effect(...)`, and `requestStep(...)`
            </li>
            <li>Delayed transitions, snapshot subscriptions, and inspectable state</li>
          </ul>
        </article>

        <article className="overview-panel overview-panel-runtime">
          <span className="overview-label">Runtime guarantees</span>
          <h2>Queueing and teardown semantics are now explicit</h2>
          <ul className="overview-list">
            <li>
              External `dispatch(...)` and `send(...)` calls queue in order while work is active
            </li>
            <li>Later queued external events still run after an earlier failure</li>
            <li>
              `destroy()` stops stale async completions and settles queued calls that never started
            </li>
            <li>
              Scheduled work is state-owned and cleared on transition, destroy, or self-reentry
            </li>
          </ul>
        </article>

        <article className="overview-panel overview-panel-planned">
          <span className="overview-label">Not yet</span>
          <h2>Still too narrow for full XState replacement</h2>
          <ul className="overview-list">
            <li>Child flows or actor-style composition</li>
            <li>Exit hooks and richer cancellation semantics</li>
            <li>Hierarchical, history, or parallel states</li>
            <li>Persistence, restore APIs, and dedicated devtools</li>
          </ul>
        </article>
      </section>

      <div className="demo-grid">
        <RenameDemo />
        <PublishingDemo />
        <SyncDemo />
      </div>
    </main>
  );
}
