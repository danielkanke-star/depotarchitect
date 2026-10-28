// Legacy sheets encode option contracts in a free-text ticker instead of
// providing the contract fields required by the journal importer.
export function looksLikeOptionContract(ticker: string) {
  return /\b(?:[A-Z]{3}\d{1,2}|\d{1,2}[A-Z]{3})['’]?\d{2,4}\s+\d+(?:[.,]\d+)?\s+(?:CALL|PUT)\b/i.test(ticker);
}
