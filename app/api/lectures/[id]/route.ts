import { NextResponse } from "next/server";
import { frontRowOpen } from "@/lib/lectures/open";
import { deleteLecture, renameLecture } from "@/lib/lectures/store";
import { getUser } from "@/lib/supabase/server";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/lectures/[id]">) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const out = await deleteLecture(supabase, userId, (await ctx.params).id);
  return NextResponse.json(out.body, { status: out.code });
}

// Rename: {title}.
export async function PATCH(request: Request, ctx: RouteContext<"/api/lectures/[id]">) {
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
  const out = await renameLecture(supabase, userId, (await ctx.params).id, body);
  return NextResponse.json(out.body, { status: out.code });
}
