import { useEffect, useRef, useState } from 'react';
import { useFlow } from 'logic-flow/react';

import { CodeComparison } from '../../components/CodeComparison';
import { SnapshotBlock } from '../../components/SnapshotBlock';
import { publishingComparison } from './comparison';
import { publishingFlow, publishRequestMs } from './publishingFlow';

type PromiseProbe = {
  label: string;
  status: 'idle' | 'pending' | 'resolved' | 'rejected';
  stateAtSettlement?: string;
  detail: string;
};

export function PublishingDemo() {
  const { snapshot, send } = useFlow(publishingFlow);
  const [probe, setProbe] = useState<PromiseProbe>({
    label: 'none',
    status: 'idle',
    detail: 'Click Approve review or Submit without legal review to watch the send promise settle.',
  });
  const snapshotRef = useRef(snapshot);
  const publishStartedAtRef = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (snapshot.state !== 'publishing') {
      publishStartedAtRef.current = null;
      return;
    }

    if (publishStartedAtRef.current === null) {
      publishStartedAtRef.current = Date.now();
    }

    setNow(Date.now());

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => {
      window.clearInterval(timer);
    };
  }, [snapshot.state]);

  const cancelWindowRemainingMs =
    snapshot.state === 'publishing' && publishStartedAtRef.current !== null
      ? Math.max(0, publishRequestMs - (now - publishStartedAtRef.current))
      : null;
  const cancelWindowProgress =
    cancelWindowRemainingMs === null
      ? null
      : Math.max(0, cancelWindowRemainingMs / publishRequestMs);
  const cancelWindowRemainingLabel =
    cancelWindowRemainingMs === null
      ? null
      : `${(cancelWindowRemainingMs / 1000).toFixed(1)}s left`;

  const trackRequestSend = (label: string, action: () => Promise<void>) => {
    setProbe({
      label,
      status: 'pending',
      detail: `${label} is pending while the request state starts running.`,
    });

    void action()
      .then(() => {
        setProbe({
          label,
          status: 'resolved',
          stateAtSettlement: snapshotRef.current.state,
          detail:
            'Cancel-enabled requestStep settles the original send promise once the request state is active, so callers regain control before success, failure, or cancel finishes.',
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
        <span className="eyebrow">Demo 2</span>
        <h2>Publishing flow</h2>
        <p>
          Shows the interruptible `requestStep(...)` path: the publish request can be cancelled
          while it is running, and the original send promise settles as soon as the request state is
          active.
        </p>
        <p className="mapping-note">
          XState concept -&gt; logic-flow equivalent: guarded transitions from draft to review or
          publish -&gt; a single event handler with normal `if` / `else` branching, then a
          `requestStep(...)` helper that keeps the async success, failure, and cancel paths local to
          the publishing state.
        </p>
      </header>

      <div className="contract-callout contract-callout-interruptible">
        <span className="contract-label">Interruptible requestStep</span>
        <p>
          Use this form when the UI needs an in-flight control event such as cancel. The tradeoff is
          that `send(...)` only means “the request state started”, not “the request finished”.
        </p>
        <p className="contract-detail">
          Cancel stays available for about {(publishRequestMs / 1000).toFixed(1)}s after the
          publishing state begins.
        </p>
        {cancelWindowProgress !== null ? (
          <div className="contract-progress" aria-label="cancel window remaining">
            <div
              className="contract-progress-bar"
              style={{ transform: `scaleX(${cancelWindowProgress})` }}
            />
          </div>
        ) : null}
        <p className="contract-status">
          Last tracked send: {probe.label} · {probe.status}
          {probe.stateAtSettlement ? ` · settled in state ${probe.stateAtSettlement}` : ''}
        </p>
        <p className="contract-detail">{probe.detail}</p>
      </div>

      <CodeComparison example={publishingComparison} />

      <div className="controls">
        <button
          onClick={() => {
            if (!snapshot.context.requiresLegalReview) {
              trackRequestSend('Submit', () => send({ type: 'SUBMIT' }));
              return;
            }

            void send({ type: 'SUBMIT' });
          }}
          disabled={snapshot.state === 'publishing'}
        >
          Submit
        </button>
        <button
          onClick={() => trackRequestSend('Approve review', () => send({ type: 'APPROVE' }))}
          disabled={snapshot.state !== 'review'}
        >
          Approve review
        </button>
        <button onClick={() => send({ type: 'CANCEL' })} disabled={snapshot.state !== 'publishing'}>
          Cancel publish
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
        {cancelWindowRemainingLabel ? (
          <span className="badge badge-live">cancel window: {cancelWindowRemainingLabel}</span>
        ) : null}
      </div>

      {snapshot.context.error ? <p className="error">{snapshot.context.error}</p> : null}
      {snapshot.context.notice ? <p className="notice">{snapshot.context.notice}</p> : null}

      <div className="snapshot-grid">
        <SnapshotBlock title="context" value={snapshot.context} />
        <SnapshotBlock title="snapshot" value={snapshot} />
      </div>
    </section>
  );
}
