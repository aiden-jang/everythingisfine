import { useEffect } from "react";
import { useStoryNavigation } from "./StoryNavigation";

export function useStoryCompletion(complete: boolean) {
  const navigation = useStoryNavigation();
  const id = navigation?.active;
  const report = navigation?.completion;
  useEffect(() => {
    if (!id || !report) return;
    report(id, complete);
    return () => report(id, false);
  }, [id, complete, report]);
}
