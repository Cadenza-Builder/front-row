import { NextResponse } from "next/server";
import { saveSegment } from "@/lib/lectures/store";
import { frontRowOpen } from "@/lib/lectures/open";
import { readJson } from "@/lib/lectures/readJson";
import { getUser } from "@/lib/supabase/server";

// Transcribing two minutes and reading its boards runs after the reply (after()), inside this limit.
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/lectures/[id]/segments/[n]">) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const json = await readJson(request, 8192);
  if (json instanceof NextResponse) return json;
  const { id, n } = await ctx.params;
  const out = await saveSegment(supabase, userId, id, n, json.body);
  return NextResponse.json(out.body, { status: out.code });
}
