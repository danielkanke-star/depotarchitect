export const MAX_IMPORT_FILE_MB = 25;
export const MAX_IMPORT_FILE_BYTES = MAX_IMPORT_FILE_MB * 1_000_000;
export const MAX_IMPORT_REQUEST_BYTES = 3_000_000;
export const MAX_PDF_BATCH_MB = 100;
export const MAX_PDF_FILES = 50;

export const importFileSizeError = `Pro Datei sind höchstens ${MAX_IMPORT_FILE_MB} MB möglich.`;

export async function readImportText(file: Blob) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function prepareImportPayload(text: string): Promise<string | Blob> {
  const original = new Blob([text]);
  if (original.size > MAX_IMPORT_FILE_BYTES) throw new Error(importFileSizeError);
  if (original.size <= MAX_IMPORT_REQUEST_BYTES) return text;
  if (typeof CompressionStream === "undefined") {
    throw new Error("Für größere Textdateien ist ein Browser mit Komprimierung erforderlich.");
  }
  const compressed = await new Response(original.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  if (compressed.byteLength > MAX_IMPORT_REQUEST_BYTES) {
    throw new Error("Diese Datei ist auch komprimiert zu groß. Bitte einen kürzeren Zeitraum oder weniger Spalten exportieren.");
  }
  return new Blob([compressed], { type: "application/gzip" });
}
