'use client';

export default function SlaIndicator({
  responseMet,
  resolutionMet,
}: {
  responseMet: boolean | null;
  resolutionMet: boolean | null;
}) {
  if (responseMet === null && resolutionMet === null) {
    return <span className="text-xs text-slate-500">-</span>;
  }
  const anyFailed = responseMet === false || resolutionMet === false;
  const allMet = (responseMet === null || responseMet) && (resolutionMet === null || resolutionMet);
  return (
    <span className={`text-xs ${anyFailed ? 'text-rose-400' : allMet ? 'text-emerald-400' : 'text-slate-400'}`}>
      {anyFailed ? 'Missed' : allMet ? 'Met' : '-'}
    </span>
  );
}
