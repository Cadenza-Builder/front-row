import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCourse } from "@/lib/lectures/courses";
import { frontRowOpen } from "@/lib/lectures/open";
import { getUser } from "@/lib/supabase/server";
import { Course } from "./Course";
import "./screen-fr-course.css";

export const metadata: Metadata = { title: "Front Row" };

/** One Front Row course: its lectures, newest first, and Record Lecture N. Someone else's course is not found. */
export default async function CoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { supabase, userId } = await getUser();
  if (!frontRowOpen(userId ?? undefined)) notFound();
  if (!userId) redirect("/sign-in?from=front-row");
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const course = await getCourse(supabase, userId, id);
  if (!course) notFound();
  return <Course course={course} saved={saved ?? null} />;
}
