import { PDFParse } from "pdf-parse";

export async function extractTextFromPdfBuffer(
  buf: Uint8Array,
): Promise<string> {
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}
