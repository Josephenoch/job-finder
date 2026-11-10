import { extractText } from "unpdf";

export async function extractCv(data: ArrayBuffer): Promise<string> {
  const { text } = await extractText(new Uint8Array(data), { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : text;
  return joined.replace(/\s+/g, " ").trim();
}
