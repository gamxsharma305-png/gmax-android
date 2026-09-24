export function safeText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export function safeUrl(v: unknown): string {
  const s = safeText(v);
  if (!s) return "";
  try {
    const u = new URL(s.startsWith("//") ? `https:${s}` : s);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch {
    /* ignore */
  }
  return "";
}
