export function currency(n: number, opts: { cents?: boolean } = {}): string {
  const fractionDigits = opts.cents ? 2 : (Math.abs(n % 1) > 0.0001 ? 2 : 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2,
  }).format(isFinite(n) ? n : 0);
}

export function pct(n: number): string {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function num(n: number): string {
  return new Intl.NumberFormat("en-US").format(n || 0);
}
