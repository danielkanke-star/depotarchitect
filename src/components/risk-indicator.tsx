import type { RiskTone } from "@/lib/risk-rules";
const tones: Record<RiskTone, string> = {
  neutral: "border-border bg-background/40 text-muted", good: "border-emerald-600/30 bg-emerald-600/10 text-emerald-200",
  watch: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200", high: "border-orange-500/50 bg-orange-500/15 text-orange-200",
  danger: "border-red-500/60 bg-red-700/25 text-red-200",
};
export function RiskIndicator({ tone, children, title }: { tone: RiskTone; children: React.ReactNode; title?: string }) {
  const labels = { neutral:"Ohne Bewertung", good:"Innerhalb der Hinweisgrenze", watch:"Beobachten", high:"Erhöht", danger:"Dringend prüfen" };
  return <span title={title ?? labels[tone]} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${tones[tone]}`}><span aria-hidden="true">{tone === "danger" ? "!" : tone === "high" || tone === "watch" ? "△" : tone === "good" ? "●" : "—"}</span><span className="sr-only">{labels[tone]}: </span>{children}</span>;
}
export function formatMoney(value: number | null | undefined, currency = "EUR") {
  return value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}
export function formatPrice(value: number | null | undefined, currency: string | null) {
  return value == null || !Number.isFinite(value) || !currency ? "—" : new Intl.NumberFormat("de-DE", {
    style:"currency",currency,currencyDisplay:"code",minimumFractionDigits:2,maximumFractionDigits:Math.abs(value)<1?6:4,
  }).format(value);
}
export function formatRatio(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 2 }).format(value);
}
