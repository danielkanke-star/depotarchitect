import type { Position } from "@/lib/database.types";
import type { PositionCalculation } from "@/lib/calculations/calculation-types";
import { positionRiskTone, stopAge } from "@/lib/risk-rules";
import { formatMoney, formatPrice, formatRatio, RiskIndicator } from "./risk-indicator";

export function PositionRiskCell({position:p,result,baseCurrency,profile}:{position:Position;result?:PositionCalculation;baseCurrency:string;profile:string}) {
  const stop=p.stop_price_native??p.stop_price,currency=p.instrument_currency;
  const age=stopAge(p.stop_updated_at);
  const price=stop!==null&&currency?formatPrice(stop,currency):"Kein Stopp";
  return <div><div className="stop-price"><span>STOPP</span><strong>{price}</strong></div>
    <div className="risk-amount"><span>Risiko bis Stopp</span><RiskIndicator tone={positionRiskTone(result?.riskToNetLiquidity.value??null,profile)}>{result?.stopRiskInstrument.value!=null&&currency?formatMoney(result.stopRiskInstrument.value,currency):"Stopp prüfen"}</RiskIndicator></div>
    <div className="mt-1.5 flex items-center justify-between gap-2"><RiskIndicator tone={age.tone} title={p.stop_updated_at?"Letzte Änderung: "+new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(p.stop_updated_at)):"Kein Änderungsdatum in der Quelle"}>{age.label}</RiskIndicator><span className="text-right text-[10px] text-muted tabular-nums" title={result?.riskToNetLiquidity.value!=null?formatRatio(result.riskToNetLiquidity.value)+" der Nettoliquidität":undefined}>{currency!==baseCurrency&&result?.stopRisk.value!=null?formatMoney(result.stopRisk.value,baseCurrency):result?.riskToNetLiquidity.value!=null?formatRatio(result.riskToNetLiquidity.value)+" NetLiq":null}</span></div>
  </div>;
}
