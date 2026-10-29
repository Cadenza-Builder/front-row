import { NextResponse } from "next/server";
import { frontRowOpen } from "@/lib/lectures/open";
import { readJson } from "@/lib/lectures/readJson";
import { linkLecture } from "@/lib/lectures/store";
import { getUser } from "@/lib/supabase/server";

// Add to Cadenza: the notes become a file in one of the student's Cadenza weeks.
export async function POST(request: Request, ctx: RouteContext<"/api/lectures/[id]/link">) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const json = await readJson(request, 1024);
  if (json instanceof NextResponse) return json;
  const out = await linkLecture(supabase, userId, (await ctx.params).id, json.body);
  return NextResponse.json(out.body, { status: out.code });
}
