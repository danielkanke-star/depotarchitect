import https from "node:https";
import { IBKR_EXCHANGES, ibkrNumber, parseIbkrOccSymbol, splitIbkrQuery, validateIbkrQuote, type IbkrQuote } from "./core";

type Data = Record<string, unknown>;
const record = (v: unknown): Data => v && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function isAllowedGatewayRequest(method: string, path: string) {
  const url = new URL(path, "https://127.0.0.1");
  if (url.origin !== "https://127.0.0.1") return false;
  if (url.searchParams.has("regulatorySnapshot") || url.searchParams.has("snapshot")) return false;
  if (method === "POST") return ["/tickle", "/iserver/auth/status"].includes(url.pathname);
  if (method !== "GET") return false;
  return ["/portfolio/accounts", "/iserver/accounts", "/trsrv/stocks", "/iserver/marketdata/snapshot"].includes(url.pathname)
    || /^\/portfolio\/[A-Za-z0-9_-]+\/positions\/\d{1,3}$/.test(url.pathname)
    || /^\/iserver\/contract\/[1-9]\d{0,15}\/info$/.test(url.pathname);
}

/** Loopback-only client; there is deliberately no general request or order API. */
export class IbkrGateway {
  private base: URL;
  private infoCache = new Map<number, Data>();
  private exchangeCache = new Map<number, string>();
  private held = new Map<number, Data>();
  private sessionInitialised = false;

  constructor(base = "https://127.0.0.1:5055/v1/api") {
    this.base = new URL(base);
    if (this.base.protocol !== "https:" || !["127.0.0.1", "localhost"].includes(this.base.hostname)
      || this.base.username || this.base.password || this.base.search || this.base.hash || this.base.pathname !== "/v1/api") {
      throw new Error("Der IBKR-Gateway muss lokal über HTTPS erreichbar sein.");
    }
  }

  private async request(path: string, method = "GET"): Promise<unknown> {
    if (!isAllowedGatewayRequest(method, path)) throw new Error("Nicht lesender IBKR-Aufruf gesperrt.");
    const url = new URL(this.base.origin + this.base.pathname + path);
    return new Promise((resolve, reject) => {
      // The vendor gateway ships with a self-signed certificate. This exception
      // is confined to the constructor's explicit loopback hosts, never cloud requests.
      const req = https.request(url, { method, rejectUnauthorized: false,
        headers: { "Content-Type": "application/json", "User-Agent": "DepotArchitect-ReadOnly/1" } }, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new Error(`IBKR HTTP ${response.statusCode}`)); return; }
        const chunks: Buffer[] = []; let length = 0;
        response.on("data", (chunk: Buffer) => { length += chunk.length; if (length > 4_000_000) req.destroy(new Error("IBKR-Antwort zu groß.")); else chunks.push(chunk); });
        response.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("Ungültige IBKR-Antwort.")); } });
      });
      req.setTimeout(12_000, () => req.destroy(new Error("IBKR-Zeitüberschreitung.")));
      req.on("error", reject);
      req.end(method === "POST" ? "{}" : undefined);
    });
  }

  async status() {
    let state: Data;
    try { state = record(await this.request("/iserver/auth/status", "POST")); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "IBKR HTTP 401") throw error;
      this.sessionInitialised = false;
      return { authenticated: false, connected: false, competing: false };
    }
    if (!state.authenticated || !state.connected || state.competing) this.sessionInitialised = false;
    if (state.authenticated && state.connected && !state.competing && !this.sessionInitialised) {
      await this.request("/iserver/accounts");
      this.sessionInitialised = true;
    }
    return { authenticated: state.authenticated === true, connected: state.connected === true, competing: state.competing === true };
  }

  async keepAlive() { await this.request("/tickle", "POST"); }

  private async info(conid: number) {
    if (!this.infoCache.has(conid)) this.infoCache.set(conid, record(await this.request(`/iserver/contract/${conid}/info`)));
    return this.infoCache.get(conid)!;
  }

  private async stockContracts(symbol: string) {
    const response = record(await this.request(`/trsrv/stocks?symbols=${encodeURIComponent(symbol)}`));
    const rows = response[symbol];
    const contracts: { conid: number; exchange: string }[] = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const data = record(row);
      for (const raw of Array.isArray(data.contracts) ? data.contracts : []) {
        const c = record(raw); const conid = Number(c.conid);
        if (!Number.isSafeInteger(conid) || conid <= 0 || typeof c.exchange !== "string") continue;
        this.exchangeCache.set(conid, c.exchange);
        contracts.push({ conid, exchange: c.exchange });
      }
    }
    return contracts;
  }

  async portfolioQuotes() {
    const accounts = await this.request("/portfolio/accounts");
    if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error("account_selection_required");
    const account = record(accounts[0]).id;
    if (typeof account !== "string" || !/^[A-Za-z0-9_-]+$/.test(account)) throw new Error("broker_error");
    const positions: Data[] = [];
    for (let page = 0; page < 10; page++) {
      const data = await this.request(`/portfolio/${account}/positions/${page}`);
      if (!Array.isArray(data)) throw new Error("broker_error");
      positions.push(...data.map(record));
      if (data.length < 100) break;
      if (page === 9) throw new Error("broker_error");
    }
    this.held.clear();
    for (const p of positions) if (Number(p.position) !== 0 && ["STK", "OPT"].includes(String(p.assetClass))) this.held.set(Number(p.conid), p);
    const quotes: IbkrQuote[] = [];
    // Sequential bounded calls respect IBKR pacing. Account IDs and quantities
    // never leave this process; only normalized contract identities and prices do.
    for (const conid of this.held.keys()) {
      try {
        const info = await this.info(conid);
        if (info.instrument_type === "STK" && !this.exchangeCache.has(conid)) await this.stockContracts(String(info.symbol));
        const q = await this.quote(conid, true);
        if (q) quotes.push(q);
      } catch { /* One unresolvable instrument must not suppress the others. */ }
      await sleep(120);
    }
    return quotes;
  }

  async quote(conid: number, valuationFallback = false): Promise<IbkrQuote | null> {
    if (!Number.isSafeInteger(conid) || conid <= 0) return null;
    const info = await this.info(conid), held = this.held.get(conid) ?? {};
    const now = new Date().toISOString();
    const type = String(info.instrument_type ?? held.assetClass);
    if (type !== "STK" && type !== "OPT") return null;
    const option = type === "OPT" ? parseIbkrOccSymbol(info.local_symbol) : null;
    // Portfolio responses sometimes omit option metadata while contracts load.
    // Resolve from the broker's OCC identifier, never from display text or a zero strike.
    // Adjusted roots require explicit deliverable handling and are not auto-matched.
    if (type === "OPT" && (!option || option.root !== info.symbol)) return null;
    const expiry = String(held.expiry ?? info.expiry_full ?? info.maturity_date ?? "").replace(/[^0-9]/g, "").slice(0, 8);
    const base = {
      conid, symbol: String(info.symbol ?? "").toUpperCase(), name: String(info.company_name ?? info.symbol ?? "").slice(0, 200),
      currency: String(info.currency ?? held.currency ?? "").toUpperCase(),
      mic: IBKR_EXCHANGES[this.exchangeCache.get(conid) ?? String(info.exchange)] ?? null,
      assetClass: type, isin: null, multiplier: Number(info.multiplier ?? held.multiplier ?? 1),
      expiry: option?.expiry ?? (expiry.length === 8 ? `${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6)}` : null),
      strike: option?.strike ?? null,
      right: option?.right ?? null,
      fetchedAt: now, observedAt: now, bid: null as number | null, ask: null as number | null,
    };
    let snapshots: unknown;
    try {
      const path = `/iserver/marketdata/snapshot?conids=${conid}&fields=31,84,86,6509`;
      snapshots = await this.request(path);
      let snap = Array.isArray(snapshots) ? record(snapshots[0]) : {};
      if (!snap["6509"] || (ibkrNumber(snap["31"]) === null && (ibkrNumber(snap["84"]) === null || ibkrNumber(snap["86"]) === null))) {
        await sleep(1000); snapshots = await this.request(path); snap = Array.isArray(snapshots) ? record(snapshots[0]) : {};
      }
      const delivery = String(snap["6509"] ?? "").slice(0, 1);
      const bid = ibkrNumber(snap["84"]), ask = ibkrNumber(snap["86"]), last = ibkrNumber(snap["31"]);
      // No regulatorySnapshot flag: never trigger separately billable snapshots.
      const useMid = type === "OPT" && bid !== null && ask !== null && bid > 0 && ask >= bid && ["R", "D"].includes(delivery);
      const price = useMid ? (bid! + ask!) / 2 : last;
      if (price !== null && price > 0 && ["R", "D", "Z", "Y"].includes(delivery)) {
        const isClosing = (!useMid && /^[CH]/.test(String(snap["31"] ?? ""))) || ["Z", "Y"].includes(delivery);
        return validateIbkrQuote({ ...base, price, bid, ask, priceBasis: useMid ? "mid" : "last",
          quality: isClosing ? "end_of_day" : delivery === "R" ? "live" : "delayed" });
      }
    } catch { /* Portfolio valuation remains an explicitly labelled fallback. */ }
    const price = valuationFallback ? ibkrNumber(held.mktPrice) : null;
    return price === null ? null : validateIbkrQuote({ ...base, price, quality: "broker_valuation", priceBasis: "broker_valuation" });
  }

  async lookup(query: string, selectedConid: number | null = null) {
    if (typeof query !== "string" || query.length > 80 || !query.trim()) return { status: "not_found" };
    const parsed = splitIbkrQuery(query);
    if (!parsed.valid) return { status: "not_found" };
    let candidates = [...this.held.keys()].filter(id => {
      const info = this.infoCache.get(id);
      return info?.instrument_type === "STK" && info?.symbol === parsed.symbol
        && (!parsed.mic || IBKR_EXCHANGES[this.exchangeCache.get(id) ?? ""] === parsed.mic);
    });
    if (selectedConid !== null) {
      const info = await this.info(selectedConid);
      if (info.symbol !== parsed.symbol || info.instrument_type !== "STK") return { status: "not_found" };
      if (!this.exchangeCache.has(selectedConid)) await this.stockContracts(parsed.symbol);
      if (parsed.mic && IBKR_EXCHANGES[this.exchangeCache.get(selectedConid) ?? ""] !== parsed.mic) return { status: "not_found" };
      candidates = [selectedConid];
    } else if (candidates.length !== 1) {
      const stocks = await this.stockContracts(parsed.symbol);
      candidates = [];
      for (const c of stocks.slice(0, 12)) {
        if (parsed.mic && IBKR_EXCHANGES[c.exchange] !== parsed.mic) continue;
        const info = await this.info(c.conid);
        if (info.symbol === parsed.symbol && info.instrument_type === "STK" && IBKR_EXCHANGES[c.exchange]) candidates.push(c.conid);
      }
      // Bare US ticker convention only after exact symbol and USD identity checks.
      if (!parsed.mic && candidates.length > 1) {
        const us = candidates.filter(id => ["NASDAQ", "NYSE", "ARCA", "AMEX"].includes(this.exchangeCache.get(id) ?? "") && this.infoCache.get(id)?.currency === "USD");
        if (us.length === 1) candidates = us;
      }
    }
    if (candidates.length !== 1) return { status: candidates.length ? "ambiguous" : "not_found" };
    const quote = await this.quote(candidates[0], this.held.has(candidates[0]));
    return quote ? { status: "success", quote } : { status: "not_subscribed" };
  }
}
