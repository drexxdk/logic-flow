import { CodeComparison } from './CodeComparison';
import { renameComparison } from './comparisonExamples';
import { renameFlow } from './renameFlow';
import { SnapshotBlock } from './SnapshotBlock';
import { useFlow } from 'logic-flow/react';

export function RenameDemo() {
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
        <p className="mapping-note">
          XState concept -&gt; logic-flow equivalent: modal machine with `assign(...)`, `invoke`,
          and delayed success close -&gt; named steps with `update(...)`, `effect(...)`, internal
          `dispatch(...)`, and `schedule(...)`.
        </p>
      </header>

      <CodeComparison example={renameComparison} />

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
