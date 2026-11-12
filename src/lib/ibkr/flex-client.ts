import "server-only";
import { FlexReportError, flexResponse } from "./flex-report";
import { MAX_REPORT_BYTES } from "@/lib/trade-import";

const baseUrl = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/";
export type FlexCredentials = { query: string; token: string };

export function validFlexCredentials({ query, token }: FlexCredentials) {
  return /^\d{3,32}$/.test(query) && /^\d{10,64}$/.test(token);
}

export async function fetchFlexReport(credentials: FlexCredentials, fetcher: typeof fetch = fetch) {
  if (!validFlexCredentials(credentials)) throw new FlexReportError("IBKR-Abfrage-ID und Token prüfen.", "credentials");
  const request = async (endpoint: "SendRequest" | "GetStatement", query: string) => {
    const url = new URL(endpoint, baseUrl);
    url.search = new URLSearchParams({ t: credentials.token, q: query, v: "3" }).toString();
    let response: Response;
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(6500), cache: "no-store", redirect: "error", headers: { "User-Agent": "DepotArchitect/1.0" } });
    } catch {
      throw new FlexReportError("IBKR ist gerade nicht erreichbar.", "unavailable");
    }
    if (!response.ok || !response.body) throw new FlexReportError("IBKR ist gerade nicht erreichbar.", "unavailable");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let result = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return result + decoder.decode();
        total += value.byteLength;
        if (total > MAX_REPORT_BYTES) {
          await reader.cancel();
          throw new FlexReportError("Der Flex-Bericht ist zu groß. Bitte den Zeitraum verkürzen.");
        }
        result += decoder.decode(value, { stream: true });
      }
    } catch (error) {
      if (error instanceof FlexReportError) throw error;
      throw new FlexReportError("Der IBKR-Bericht wurde nicht vollständig übertragen.", "unavailable");
    } finally {
      reader.releaseLock();
    }
  };
  const reference = flexResponse(await request("SendRequest", credentials.query));
  if (reference.report) throw new FlexReportError("IBKR hat keine Berichtsnummer zurückgegeben.");
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1100 + attempt * 350));
    try {
      const xml = await request("GetStatement", reference.reference);
      if (flexResponse(xml).report) return xml;
    } catch (error) {
      if (!(error instanceof FlexReportError) || error.status !== "pending" || attempt === 3) throw error;
    }
  }
  throw new FlexReportError("Der IBKR-Bericht ist noch in Vorbereitung.", "pending");
}
