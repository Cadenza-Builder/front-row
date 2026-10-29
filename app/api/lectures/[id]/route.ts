import { NextResponse } from "next/server";
import { frontRowOpen } from "@/lib/lectures/open";
import { readJson } from "@/lib/lectures/readJson";
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
  const json = await readJson(request, 1024);
  if (json instanceof NextResponse) return json;
  const out = await renameLecture(supabase, userId, (await ctx.params).id, json.body);
  return NextResponse.json(out.body, { status: out.code });
}
