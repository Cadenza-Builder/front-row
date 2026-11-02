import { NextResponse } from "next/server";
import { findBoard } from "@/lib/lectures/store";
import { frontRowOpen } from "@/lib/lectures/open";
import { readJson } from "@/lib/lectures/readJson";
import { getUser } from "@/lib/supabase/server";

// Four SAM 3.1 calls in parallel, each a few seconds.
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/lectures/[id]/board">) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const json = await readJson(request, 400_100);
  if (json instanceof NextResponse) return json;
  const out = await findBoard(supabase, userId, (await ctx.params).id, json.body);
  return NextResponse.json(out.body, { status: out.code });
}
