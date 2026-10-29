import { notFound } from "next/navigation";
import { frontRowOpen } from "@/lib/lectures/open";
import { getUser } from "@/lib/supabase/server";

// Front Row is locked until launch (docs/handoff-front-row-screens.md): closed, every page under /front-row is a 404.
export default async function FrontRowLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) notFound();
  return children;
}
