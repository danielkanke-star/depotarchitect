"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { eur, pct } from "@/lib/format";

export function RiskCalculator({ initialNetLiquidity, initialRiskPct, initialMargin, maxMargin }: { initialNetLiquidity: number | null; initialRiskPct: number; initialMargin: number | null; maxMargin: number }) {
  const [netLiq, setNetLiq] = useState<number | "">(initialNetLiquidity ?? "");
  const [riskPct, setRiskPct] = useState<number | "">(initialRiskPct);
  const [entry, setEntry] = useState<number | "">(100);
  const [stop, setStop] = useState<number | "">(92);
  const [margin, setMargin] = useState<number | "">(initialMargin ?? "");
  const calculation = useMemo(() => {
    if (netLiq === "" || riskPct === "" || entry === "" || stop === "" || margin === "") return null;
    const riskBudget = netLiq * riskPct / 100;
    const stopDistance = Math.max(Math.abs(entry - stop), 0.01);
    const quantity = Math.floor(riskBudget / stopDistance);
    return { riskBudget, stopDistance, quantity, marketValue: quantity * entry, marginBuffer: maxMargin - margin };
  }, [netLiq, riskPct, entry, stop, margin, maxMargin]);

  return <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
    <Card><h2 className="mb-4 font-medium">Eingaben</h2><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nettoliquidität" value={netLiq} onChange={setNetLiq} />
      <Field label="Risiko je Trade (%)" value={riskPct} onChange={setRiskPct} step="0.01" />
      <Field label="Einstiegskurs" value={entry} onChange={setEntry} />
      <Field label="Trading-Stop" value={stop} onChange={setStop} />
      <Field label="Aktuelle Margin (%)" value={margin} onChange={setMargin} step="0.1" />
      <label>Risikomodell<select defaultValue="risk_per_trade"><option value="risk_per_trade">Risiko je Trade</option><option>Gesamtverlustbudget</option><option>Feste Positionsgröße</option><option>Volatilitätsmodell</option></select></label>
    </div></Card>
    <Card><h2 className="mb-4 font-medium">Berechnung</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <Result label="Risikobetrag" value={calculation ? eur.format(calculation.riskBudget) : "nicht berechenbar"} />
      <Result label="Abstand zum Stop" value={calculation ? eur.format(calculation.stopDistance) : "nicht berechenbar"} />
      <Result label="Maximale Stückzahl" value={calculation ? String(calculation.quantity) : "nicht berechenbar"} />
      <Result label="Theoretischer Marktwert" value={calculation ? eur.format(calculation.marketValue) : "nicht berechenbar"} />
      <Result label="Margin-Puffer" value={calculation ? pct(calculation.marginBuffer) : "nicht berechenbar"} tone={calculation && calculation.marginBuffer < 5 ? "warn" : "normal"} />
    </div></Card>
  </div>;
}
function Field({ label, value, onChange, step = "0.01" }: { label: string; value: number | ""; onChange: (value: number | "") => void; step?: string }) { return <label>{label}<input type="number" step={step} value={value} placeholder="Daten fehlen" onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} /></label>; }
function Result({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" }) { return <div className="rounded-xl border border-border/70 bg-background/40 p-3"><div className="text-xs text-muted">{label}</div><div className={`mt-1 text-xl font-semibold ${tone === "warn" ? "text-amber-300" : ""}`}>{value}</div></div>; }
