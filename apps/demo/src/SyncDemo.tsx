import { CodeComparison } from './CodeComparison';
import { syncComparison } from './comparisonExamples';
import { SnapshotBlock } from './SnapshotBlock';
import { syncFlow } from './syncFlow';
import { useFlow } from './useFlow';

export function SyncDemo() {
  const { snapshot, send } = useFlow(syncFlow);

  return (
    <section className="card">
      <header>
        <span className="eyebrow">Demo 3</span>
        <h2>Sync flow</h2>
        <p>
          Shows the same SYNCED and FAILED event contracts reused across initial sync and retry
          states while still using step-local registration handles for internal dispatch.
        </p>
        <p className="mapping-note">
          XState concept -&gt; logic-flow equivalent: reusable service result events shared across
          retry states -&gt; `defineEvent(...)` contracts combined with step-local handlers and
          internal `dispatch(...)`.
        </p>
      </header>

      <CodeComparison example={syncComparison} />

      <div className="controls">
        <button onClick={() => send({ type: 'START' })} disabled={snapshot.state !== 'idle'}>
          Start sync
        </button>
        <button onClick={() => send({ type: 'RETRY' })} disabled={snapshot.state !== 'failed'}>
          Retry sync
        </button>
        <button
          onClick={() => send({ type: 'TOGGLE_FAILURE' })}
          disabled={snapshot.state === 'syncing' || snapshot.state === 'retrying'}
        >
          Toggle failure
        </button>
        <button
          onClick={() => send({ type: 'RESET' })}
          disabled={
            snapshot.state === 'idle' ||
            snapshot.state === 'syncing' ||
            snapshot.state === 'retrying'
          }
        >
          Reset
        </button>
      </div>

      <div className="status-row">
        <span className="badge">state: {snapshot.state}</span>
        <span className="badge">should fail: {String(snapshot.context.shouldFail)}</span>
        <span className="badge">items: {snapshot.context.syncedItems}</span>
        <span className="badge">last attempt: {snapshot.context.lastAttempt ?? 'none'}</span>
      </div>

      {snapshot.context.error ? <p className="error">{snapshot.context.error}</p> : null}

      <div className="snapshot-grid">
        <SnapshotBlock title="context" value={snapshot.context} />
        <SnapshotBlock title="snapshot" value={snapshot} />
      </div>
    </section>
  );
}
