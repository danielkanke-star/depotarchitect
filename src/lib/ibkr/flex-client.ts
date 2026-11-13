import "server-only";
import { get } from "node:https";
import { FlexReportError, flexResponse } from "./flex-report";

const baseUrl = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/";
const MAX_FLEX_RESPONSE_BYTES = 3_000_000;
export type FlexCredentials = { query: string; token: string };

export function validFlexCredentials({ query, token }: FlexCredentials) {
  return /^\d{3,32}$/.test(query) && /^\d{10,64}$/.test(token);
}

// Flex requires its token in the query string. Keep the request out of the
// Next.js fetch instrumentation, which attaches full URLs to tracing spans.
function requestFlex(url: URL) {
  return new Promise<string>((resolve, reject) => {
    const unavailable = () => reject(new FlexReportError("IBKR ist gerade nicht erreichbar.", "unavailable"));
    const request = get(url, {
      signal: AbortSignal.timeout(6500),
      headers: { "User-Agent": "DepotArchitect/1.0", "Accept-Encoding": "identity" },
    }, response => {
      if (response.statusCode !== 200) {
        response.destroy();
        unavailable();
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_FLEX_RESPONSE_BYTES) {
          reject(new FlexReportError("Der Flex-Bericht ist zu groß. Bitte den Zeitraum verkürzen."));
          response.destroy();
        } else chunks.push(chunk);
      });
      response.on("error", unavailable);
      response.on("aborted", unavailable);
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    request.on("error", unavailable);
  });
}

export async function fetchFlexReport(credentials: FlexCredentials, transport = requestFlex) {
  if (!validFlexCredentials(credentials)) throw new FlexReportError("IBKR-Abfrage-ID und Token prüfen.", "credentials");
  const request = (endpoint: "SendRequest" | "GetStatement", query: string) => {
    const url = new URL(endpoint, baseUrl);
    url.search = new URLSearchParams({ t: credentials.token, q: query, v: "3" }).toString();
    return transport(url);
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
