import { NextResponse } from "next/server";
import { frontRowOpen } from "@/lib/lectures/open";
import { linkLecture } from "@/lib/lectures/store";
import { getUser } from "@/lib/supabase/server";

// Add to Cadenza: the notes become a file in one of the student's Cadenza weeks.
export async function POST(request: Request, ctx: RouteContext<"/api/lectures/[id]/link">) {
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
  const out = await linkLecture(supabase, userId, (await ctx.params).id, body);
  return NextResponse.json(out.body, { status: out.code });
}
