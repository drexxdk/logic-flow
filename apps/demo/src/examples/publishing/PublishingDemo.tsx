import { useFlow } from 'logic-flow/react';

import { CodeComparison } from '../../components/CodeComparison';
import { SnapshotBlock } from '../../components/SnapshotBlock';
import { publishingComparison } from './comparison';
import { publishingFlow } from './publishingFlow';

export function PublishingDemo() {
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
        <p className="mapping-note">
          XState concept -&gt; logic-flow equivalent: guarded transitions from draft to review or
          publish -&gt; a single event handler with normal `if` / `else` branching and typed
          `goto(...)` targets.
        </p>
      </header>

      <CodeComparison example={publishingComparison} />

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