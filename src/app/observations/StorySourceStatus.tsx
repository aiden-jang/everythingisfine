import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import type { ObservationId } from "./catalogue";

interface StorySource {
  id: ObservationId;
  state: "loading" | "ready" | "empty" | "failed";
  retry: () => void;
}

const Current = createContext<StorySource | null>(null);
const Publish = createContext<((result: StorySource | null) => void) | null>(null);

export function StorySourceProvider({ children }: { children: ReactNode }) {
  const [current, publish] = useState<StorySource | null>(null);
  return (
    <Publish.Provider value={publish}>
      <Current.Provider value={current}>{children}</Current.Provider>
    </Publish.Provider>
  );
}

export function useStorySource(active: string | null) {
  const result = useContext(Current);
  return result && result.id === active ? result : null;
}

export function useReportStorySource(id: ObservationId, state: StorySource["state"], retry: () => void) {
  const publish = useContext(Publish);
  useLayoutEffect(() => {
    publish?.({ id, state, retry });
    return () => publish?.(null);
  }, [publish, id, state, retry]);
}
