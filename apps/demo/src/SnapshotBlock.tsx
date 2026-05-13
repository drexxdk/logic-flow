export function SnapshotBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="snapshot-block">
      <span>{title}</span>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
