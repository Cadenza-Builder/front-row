import { NextResponse } from "next/server";
import { frontRowOpen } from "@/lib/lectures/open";
import { exportLecture } from "@/lib/lectures/store";
import { getUser } from "@/lib/supabase/server";

export async function GET(request: Request, ctx: RouteContext<"/api/lectures/[id]/export">) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const out = await exportLecture(supabase, userId, (await ctx.params).id, new URL(request.url).searchParams.get("format"));
  if ("code" in out) return NextResponse.json(out.body, { status: out.code });
  return new Response(out.bytes as BodyInit, {
    headers: { "Content-Type": out.type, "Content-Disposition": `attachment; filename="${out.filename}"`, "Cache-Control": "private, no-store" },
  });
}
