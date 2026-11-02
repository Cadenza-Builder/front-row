"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Intro } from "../../opening/Intro";
import { Loading } from "../../opening/Loading";

// The opening sits outside home/loading.tsx, so it covers the screen from the first byte, before the skeleton shows.
export default function HomeOpening({ children }: { children: React.ReactNode }) {
  // Read once: Loading drops ?welcome from the URL while it plays.
  const [welcome] = useState(Boolean(useSearchParams().get("welcome")));
  return <>{welcome ? <Loading /> : <Intro />}{children}</>;
}
