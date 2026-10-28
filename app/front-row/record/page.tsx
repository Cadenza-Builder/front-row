import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Recorder } from "./Recorder";
import "./screen-record.css";

export const metadata = { title: "Record" };

export default async function RecordPage({ searchParams }: { searchParams: Promise<{ course?: string | string[]; sample?: string | string[] }> }) {
  const sp = await searchParams;
  // ?sample plays the sample classroom photo for the demo video: no camera, nothing created or uploaded.
  const sample = sp.sample !== undefined;
  const course = typeof sp.course === "string" ? sp.course : null;
  if (sample) return <Recorder course={null} userId={null} sample />;
  const { userId } = await getUser();
  if (!userId) redirect("/sign-in");
  if (!course) redirect("/front-row/home");
  return <Recorder course={course} userId={userId} sample={false} />;
}
