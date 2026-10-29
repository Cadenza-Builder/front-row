import { NextResponse } from "next/server";

/**
 * Front Row's request bodies: JSON of at most `max` characters, else the 415 or 413 reply. JSON only: a cross-site form
 * can post text/plain without a preflight. Unparseable JSON is a null body, which every schema refuses.
 */
export async function readJson(request: Request, max: number): Promise<{ body: unknown } | NextResponse> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Send JSON" }, { status: 415 });
  const raw = await request.text();
  if (raw.length > max) return NextResponse.json({ error: "Too large" }, { status: 413 });
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return { body: null };
  }
}
