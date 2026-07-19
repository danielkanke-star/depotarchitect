export const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export const number = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2,
});

export function pct(value: number, digits = 1) {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(value)} %`;
}
