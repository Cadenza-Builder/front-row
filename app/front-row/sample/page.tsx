import { LectureNotes } from "../lectures/[id]/LectureNotes";
import { SAMPLE } from "./lecture";
import "../../courses/[id]/weeks/[n]/learn/screen-learn.css";
import "../lectures/[id]/front-row.css";

export const metadata = { title: "Sample Lecture Notes" };

/** The landing page's See Sample Notes: the Read screen on a committed lecture, no account, nothing saved. */
export default async function SamplePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <LectureNotes lecture={SAMPLE} tab={tab === "transcript" ? "transcript" : "notes"} />;
}
