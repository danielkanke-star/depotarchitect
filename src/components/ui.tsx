import { InfoTip } from "./info-tip";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`surface ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "danger" }) {
  const tones = { neutral: "border-border text-muted", good: "border-emerald-500/30 text-emerald-300", warn: "border-amber-500/30 text-amber-300", danger: "border-red-500/30 text-red-300" };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${tones[tone]}`}>{children}</span>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow&&<div className="page-eyebrow">{eyebrow}</div>}<div className="flex items-center gap-2.5"><h1>{title}</h1>{description&&<InfoTip label={title}>{description}</InfoTip>}</div></div>{action&&<div className="page-actions">{action}</div>}</div>;
}

export function MetricCard({label,value,help,note,tone=""}:{label:string;value:React.ReactNode;help?:React.ReactNode;note?:React.ReactNode;tone?:string}) {
  return <div className="metric-card"><div className="metric-label"><span>{label}</span>{help&&<InfoTip label={label}>{help}</InfoTip>}</div><div className={`metric-value ${tone}`}>{value}</div>{note&&<div className="metric-secondary">{note}</div>}</div>;
}
