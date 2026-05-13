import { PublishingDemo } from './PublishingDemo';
import { RenameDemo } from './RenameDemo';
import { SyncDemo } from './SyncDemo';

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

      <div className="demo-grid">
        <RenameDemo />
        <PublishingDemo />
        <SyncDemo />
      </div>
    </main>
  );
}
