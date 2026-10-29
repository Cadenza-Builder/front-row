import { NextResponse } from "next/server";
import { finish } from "@/lib/lectures/store";
import { frontRowOpen } from "@/lib/lectures/open";
import { readJson } from "@/lib/lectures/readJson";
import { getUser } from "@/lib/supabase/server";

// Any segment not yet done, then the notes, run in this request.
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/lectures/[id]/finish">) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const json = await readJson(request, 1024);
  if (json instanceof NextResponse) return json;
  const out = await finish(supabase, userId, (await ctx.params).id, json.body);
  return NextResponse.json(out.body, { status: out.code });
}
