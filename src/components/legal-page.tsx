import { LEGAL_REVIEW_NOTICE } from "@/lib/config/legal-versions";
import { PublicPage } from "@/components/public-shell";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <PublicPage>
      <main className="mx-auto min-h-[70vh] max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="rounded-3xl border border-border bg-panel/90 p-6 shadow-2xl sm:p-10">
          <div className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Rechtlicher Arbeitsstand</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 leading-7 text-muted">{intro}</p>
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
            {LEGAL_REVIEW_NOTICE}
          </div>
          <div className="legal-copy mt-8 space-y-8 text-sm leading-7 text-foreground/90">{children}</div>
        </div>
      </main>
    </PublicPage>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xl font-semibold">{title}</h2>
      <div className="space-y-3 text-muted">{children}</div>
    </section>
  );
}
