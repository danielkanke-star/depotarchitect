import { signIn, signUp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_70%_10%,#16382d_0,transparent_35%)] px-4">
    <div className="w-full max-w-md rounded-3xl border border-border bg-panel/95 p-6 shadow-2xl sm:p-8">
      <div className="mb-7"><div className="text-xl font-semibold">Depot<span className="text-accent">Architect</span></div><h1 className="mt-5 text-3xl font-semibold tracking-tight">Anmelden</h1><p className="mt-2 text-sm text-muted">Private Depotdaten werden über Supabase Auth und RLS geschützt.</p></div>
      {params.error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{params.error}</div>}
      {params.message && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{params.message}</div>}
      <form className="space-y-4">
        <input type="hidden" name="origin" value={process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"} />
        <label>E-Mail<input name="email" type="email" required autoComplete="email" /></label>
        <label>Passwort<input name="password" type="password" required minLength={8} autoComplete="current-password" /></label>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button formAction={signIn} className="rounded-xl bg-accent px-4 py-3 font-medium text-[#062218]">Anmelden</button>
          <button formAction={signUp} className="rounded-xl border border-border px-4 py-3 text-sm">Registrieren</button>
        </div>
      </form>
      <p className="mt-5 text-xs leading-5 text-muted">Beim ersten Konto wird ein geschütztes Beispieldpot angelegt. Die Beispieldaten werden später durch Google-Sheets- oder Brokerdaten ersetzt.</p>
    </div>
  </main>;
}
