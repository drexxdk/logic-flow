import { publishingFlow } from './publishingFlow';
import { renameFlow } from './renameFlow';
import { useFlow } from './useFlow';

function SnapshotBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="snapshot-block">
      <span>{title}</span>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function RenameDemo() {
  const { snapshot, send } = useFlow(renameFlow);

  return (
    <section className="card">
      <header>
        <span className="eyebrow">Demo 1</span>
        <h2>Rename flow</h2>
        <p>
          Shows validation, async effects, internal events, and delayed transitions without guard
          arrays.
        </p>
      </header>

      <div className="controls">
        <button onClick={() => send({ type: 'OPEN' })}>Open modal</button>
        <button onClick={() => send({ type: 'SAVE' })} disabled={snapshot.state !== 'editing'}>
          Save heading
        </button>
        <button onClick={() => send({ type: 'CLOSE' })} disabled={snapshot.state === 'closed'}>
          Close
        </button>
      </div>

      <label className="field">
        <span>Heading</span>
        <input
          value={snapshot.context.heading}
          disabled={snapshot.state !== 'editing'}
          onChange={(event) => send({ type: 'CHANGE', value: event.target.value })}
        />
      </label>

      <div className="status-row">
        <span className="badge">state: {snapshot.state}</span>
        <span className="badge">saved: {snapshot.context.savedHeading}</span>
      </div>

      {snapshot.context.error ? <p className="error">{snapshot.context.error}</p> : null}

      <div className="snapshot-grid">
        <SnapshotBlock title="context" value={snapshot.context} />
        <SnapshotBlock title="snapshot" value={snapshot} />
      </div>
    </section>
  );
}

function PublishingDemo() {
  const { snapshot, send } = useFlow(publishingFlow);

  return (
    <section className="card">
      <header>
        <span className="eyebrow">Demo 2</span>
        <h2>Publishing flow</h2>
        <p>
          Shows plain if/else branching where submit can route to review or publish without encoded
          guard arrays.
        </p>
      </header>

      <div className="controls">
        <button onClick={() => send({ type: 'SUBMIT' })} disabled={snapshot.state === 'publishing'}>
          Submit
        </button>
        <button onClick={() => send({ type: 'APPROVE' })} disabled={snapshot.state !== 'review'}>
          Approve review
        </button>
        <button
          onClick={() => send({ type: 'TOGGLE_LEGAL_REVIEW' })}
          disabled={snapshot.state !== 'draft'}
        >
          Toggle legal review
        </button>
      </div>

      <label className="field">
        <span>Title</span>
        <input
          value={snapshot.context.title}
          disabled={snapshot.state !== 'draft'}
          onChange={(event) => send({ type: 'CHANGE_TITLE', value: event.target.value })}
        />
      </label>

      <div className="status-row">
        <span className="badge">state: {snapshot.state}</span>
        <span className="badge">legal review: {String(snapshot.context.requiresLegalReview)}</span>
      </div>

      {snapshot.context.error ? <p className="error">{snapshot.context.error}</p> : null}

      <div className="snapshot-grid">
        <SnapshotBlock title="context" value={snapshot.context} />
        <SnapshotBlock title="snapshot" value={snapshot} />
      </div>
    </section>
  );
}

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
      </div>
    </main>
  );
}
