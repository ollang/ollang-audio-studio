export function Waveform({
  values,
  start = 0,
  end = 1,
  dark = false,
}: {
  values: number[];
  start?: number;
  end?: number;
  dark?: boolean;
}) {
  const max = Math.max(0.02, ...values);
  return (
    <div className={`waveform ${dark ? 'dark-wave' : ''}`} aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={index}
          className={index / values.length < start || index / values.length > end ? 'outside' : ''}
          style={{ height: `${Math.max(5, Math.min(100, (value / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}
