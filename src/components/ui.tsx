export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-panel/90 p-4 shadow-[0_20px_50px_rgba(0,0,0,.12)] sm:p-5 ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "danger" }) {
  const tones = { neutral: "border-border text-muted", good: "border-emerald-500/30 text-emerald-300", warn: "border-amber-500/30 text-amber-300", danger: "border-red-500/30 text-red-300" };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${tones[tone]}`}>{children}</span>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>{eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[.18em] text-accent">{eyebrow}</div>}<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-3xl text-sm text-muted">{description}</p>}</div>{action}</div>;
}
