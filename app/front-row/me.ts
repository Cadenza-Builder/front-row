import { redirect } from "next/navigation";
import { cache } from "react";
import { getUser } from "@/lib/supabase/server";

/** The signed-in student's name for Front Row's pages; signed out goes to Front Row's sign-in. Once per request: page and frame both ask. */
export const me = cache(async () => {
  const { supabase, userId } = await getUser();
  if (!userId) redirect("/sign-in?from=front-row");
  const { data } = await supabase.from("profiles").select("first_name, last_name").eq("user_id", userId).maybeSingle().throwOnError();
  return { first: data?.first_name?.trim() ?? "", last: data?.last_name?.trim() ?? "" };
});
