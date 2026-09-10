/** Only explicit HTTPS references are links; all other content stays plain text. */
export function splitUpdateReferences(text: string): Array<{ text: string; href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  let start = 0;
  for (const match of text.matchAll(/\[([^\[\]\n]+)\]\((https:\/\/[^\s<>"()]+)\)/gu)) {
    let url: URL;
    try { url = new URL(match[2]); } catch { continue; }
    if (url.protocol !== "https:" || url.username || url.password) continue;
    if (match.index > start) parts.push({ text: text.slice(start, match.index) });
    parts.push({ text: match[1], href: url.href });
    start = match.index + match[0].length;
  }
  if (start < text.length) parts.push({ text: text.slice(start) });
  return parts;
}
