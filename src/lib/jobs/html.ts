function codePoint(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

function decodeEntities(value: string): string {
  let text = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let pass = 0; pass < 2; pass++) {
    text = text
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec: string) => codePoint(Number.parseInt(dec, 10)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }
  return text;
}

export function plainText(value: string, keepLines = false): string {
  const decoded = decodeEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  if (!keepLines) return decoded.replace(/\s+/g, " ").trim();
  return decoded
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
