export async function extractFlatexText(file: File) {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = getDocument({ data: await file.arrayBuffer(), stopAtErrors: true, enableXfa: false,
    useWasm: false, useSystemFonts: false, disableFontFace: true, isOffscreenCanvasSupported: false });
  try {
    const document = await pdf.promise;
    if (document.numPages > 5) throw new Error("Bitte einzelne Abrechnungen mit bis zu fünf Seiten auswählen.");
    const lines: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const content = await (await document.getPage(index)).getTextContent();
      let line = "";
      let lastY: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2 && line.trim()) {
          lines.push(line.trim());
          line = "";
        }
        line += (line && item.str ? " " : "") + item.str;
        lastY = y;
        if (item.hasEOL && line.trim()) {
          lines.push(line.trim());
          line = "";
        }
      }
      if (line.trim()) lines.push(line.trim());
    }
    // Extract only booking fields. Strip names, addresses, other identifiers and unrelated lines before sending.
    const fields = lines.flatMap(line => {
      if (/flatex/i.test(line)) return ["flatex"];
      if (/\b(?:Storno|Sammelabrechnung|Kapitalmaßnahme)\b/i.test(line)) return ["Sammelabrechnung"];
      const matches = [
        line.match(/Wertpapierabrechnung\s+(?:Kauf|Verkauf)\b/i),
        line.match(/\bNr\.\s*\d+\s*\/\s*\d+\s+(?:Kauf|Verkauf)\s+.{1,180}?\([A-Z]{2}[A-Z0-9]{9}\d\s*\//i),
        line.match(/Handelstag\s*:?\s*\d{2}\.\d{2}\.\d{4}/i),
        line.match(/Handelszeit\s*:?\s*\d\d:\d\d:\d\d/i),
        line.match(/Ausgeführt\s*:\s*[\d.,]+\s+(?:St\.|Stück\b|STK\b)/i),
        line.match(/\bKurs\s*:\s*[\d.,]+\s+[A-Z]{3}\b/),
        line.match(/Kurswert\s*:\s*[\d.,]+\s+[A-Z]{3}\b/),
        line.match(/Devisenkurs\s*:\s*[\d.,]+/i),
        line.match(/Verrechnung[^\n]*Konto Nr\.?\s*:\s*[\d ]+/i),
      ];
      return matches.flatMap(match => match ? [match[0]] : []);
    });
    if (!fields.length) throw new Error("Das PDF enthält keinen lesbaren Abrechnungstext.");
    return fields.join("\n");
  } finally {
    await pdf.destroy();
  }
}
