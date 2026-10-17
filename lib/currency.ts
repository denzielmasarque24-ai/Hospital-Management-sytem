export function formatPhp(value: number): string {
  return `₱${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;
}
