import { NextResponse } from "next/server";
import { saveSegment } from "@/lib/lectures/store";
import { getUser } from "@/lib/supabase/server";

// Transcribing two minutes and reading its boards runs in this request.
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/lectures/[id]/segments/[n]">) {
  const { supabase, userId } = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // JSON only: a cross-site form can post text/plain without a preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Send JSON" }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 8192) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  const { id, n } = await ctx.params;
  const out = await saveSegment(supabase, userId, id, n, body);
  return NextResponse.json(out.body, { status: out.code });
}
