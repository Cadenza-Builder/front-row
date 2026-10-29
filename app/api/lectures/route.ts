import { NextResponse } from "next/server";
import { createLecture } from "@/lib/lectures/store";
import { frontRowOpen } from "@/lib/lectures/open";
import { readJson } from "@/lib/lectures/readJson";
import { getUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const json = await readJson(request, 2048);
  if (json instanceof NextResponse) return json;
  const out = await createLecture(supabase, userId, json.body);
  return NextResponse.json(out.body, { status: out.code });
}
