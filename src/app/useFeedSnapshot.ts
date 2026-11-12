import { useEffect, useState } from "react";
import type { Feed } from "./feed";

export function useFeedSnapshot(feed: Feed) {
  const [snapshot, setSnapshot] = useState(() => feed.snapshot());
  useEffect(() => feed.subscribe(setSnapshot), [feed]);
  return snapshot;
}
