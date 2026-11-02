import { NextResponse } from "next/server";
import { deleteCourse, renameCourse } from "@/lib/lectures/courses";
import { frontRowOpen } from "@/lib/lectures/open";
import { readJson } from "@/lib/lectures/readJson";
import { getUser } from "@/lib/supabase/server";

// Rename Course: a new name and/or icon for the caller's course.
export async function PATCH(request: Request, ctx: RouteContext<"/api/lecture-courses/[id]">) {
  const { userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const json = await readJson(request, 1024);
  if (json instanceof NextResponse) return json;
  const out = await renameCourse(userId, (await ctx.params).id, json.body);
  return NextResponse.json(out.body, { status: out.code });
}

// Delete Course: the course, every lecture in it and their files. No body.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/lecture-courses/[id]">) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const out = await deleteCourse(supabase, userId, (await ctx.params).id);
  return NextResponse.json(out.body, { status: out.code });
}
