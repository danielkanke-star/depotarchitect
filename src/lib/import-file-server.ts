import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { importFileSizeError, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_REQUEST_BYTES } from "./import-file";

const unpack = promisify(gunzip);

export async function readImportPayload(form: FormData) {
  const payload = form.get("file_data");
  if (!payload || (typeof payload !== "string" && payload.size === 0)) throw new Error("Bitte eine Datei auswählen.");
  if (typeof payload === "string") {
    if (Buffer.byteLength(payload) > MAX_IMPORT_REQUEST_BYTES) throw new Error("Die Datei konnte nicht vollständig übertragen werden.");
    return payload;
  }
  if (payload.type !== "application/gzip" || payload.size > MAX_IMPORT_REQUEST_BYTES) {
    throw new Error("Die komprimierte Datei konnte nicht übertragen werden.");
  }
  try {
    const bytes = await unpack(Buffer.from(await payload.arrayBuffer()), { maxOutputLength: MAX_IMPORT_FILE_BYTES });
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ERR_BUFFER_TOO_LARGE") {
      throw new Error(importFileSizeError);
    }
    throw new Error("Die komprimierte Datei konnte nicht gelesen werden.");
  }
}
