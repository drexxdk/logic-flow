import { useEffect, useRef, useState } from 'react';
import { useFlow } from 'logic-flow/react';

import { CodeComparison } from '../../components/CodeComparison';
import { SnapshotBlock } from '../../components/SnapshotBlock';
import { syncComparison } from './comparison';
import { syncFlow } from './syncFlow';

type PromiseProbe = {
  label: string;
  status: 'idle' | 'pending' | 'resolved' | 'rejected';
  stateAtSettlement?: string;
  detail: string;
};

export function SyncDemo() {
  const { snapshot, send } = useFlow(syncFlow);
  const [probe, setProbe] = useState<PromiseProbe>({
    label: 'none',
    status: 'idle',
    detail:
      'Click Start sync or Retry sync to watch the send promise stay pending until the request finishes.',
  });
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const trackRequestSend = (label: string, action: () => Promise<void>) => {
    setProbe({
      label,
      status: 'pending',
      detail: `${label} is still pending because this requestStep waits for success or failure before settling the original send call.`,
    });

    void action()
      .then(() => {
        setProbe({
          label,
          status: 'resolved',
          stateAtSettlement: snapshotRef.current.state,
          detail:
            'Blocking requestStep keeps the caller waiting for the final request outcome, which is useful when later work depends on success or failure being complete.',
        });
      })
      .catch((error) => {
        setProbe({
          label,
          status: 'rejected',
          stateAtSettlement: snapshotRef.current.state,
          detail: error instanceof Error ? error.message : 'The request send rejected.',
        });
      });
  };

  return (
    <section className="card">
      <header>
        <span className="eyebrow">Demo 3</span>
        <h2>Sync flow</h2>
        <p>
          Shows the blocking `requestStep(...)` path: Start and Retry keep their original send
          promises pending until the sync request reaches a final success or failure outcome.
        </p>
        <p className="mapping-note">
          XState concept -&gt; logic-flow equivalent: a request state whose caller should await the
          final outcome -&gt; `requestStep(...)` without `cancel`, plus reusable result events
          shared across initial sync and retry.
        </p>
      </header>

      <div className="contract-callout contract-callout-blocking">
        <span className="contract-label">Blocking requestStep</span>
        <p>
          Use this form when the caller should be able to `await` the finished request outcome.
          There is no in-flight control event, so the original send promise stays pending until the
          request transitions to success or failure.
        </p>
        <p className="contract-status">
          Last tracked send: {probe.label} · {probe.status}
          {probe.stateAtSettlement ? ` · settled in state ${probe.stateAtSettlement}` : ''}
        </p>
        <p className="contract-detail">{probe.detail}</p>
      </div>

      <CodeComparison example={syncComparison} />

      <div className="controls">
        <button
          onClick={() => trackRequestSend('Start sync', () => send({ type: 'START' }))}
          disabled={snapshot.state !== 'idle'}
        >
          Start sync
        </button>
        <button
          onClick={() => trackRequestSend('Retry sync', () => send({ type: 'RETRY' }))}
          disabled={snapshot.state !== 'failed'}
        >
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
