import { NextResponse } from "next/server";
import { deleteLecture } from "@/lib/lectures/store";
import { getUser } from "@/lib/supabase/server";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/lectures/[id]">) {
  const { supabase, userId } = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const out = await deleteLecture(supabase, userId, (await ctx.params).id);
  return NextResponse.json(out.body, { status: out.code });
}
