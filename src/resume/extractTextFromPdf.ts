import pdfParse from "pdf-parse";

export async function extractTextFromPdfBuffer(
  buf: Uint8Array,
): Promise<string> {
  const data = await pdfParse(Buffer.from(buf));
  return data.text.trim();
}
