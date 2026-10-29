import { NextResponse } from "next/server";
import { finish } from "@/lib/lectures/store";
import { frontRowOpen } from "@/lib/lectures/open";
import { getUser } from "@/lib/supabase/server";

// Any segment not yet done, then the notes, run in this request.
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/lectures/[id]/finish">) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // JSON only: a cross-site form can post text/plain without a preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Send JSON" }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 1024) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  const out = await finish(supabase, userId, (await ctx.params).id, body);
  return NextResponse.json(out.body, { status: out.code });
}
