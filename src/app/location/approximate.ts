import { locationAttempt } from "./attempt";
import { coarsePosition, type CoarsePosition } from "./position";

export function requestApproximateLocation(
  apply: (point: CoarsePosition) => void,
  target: EventTarget = window,
  fetcher: typeof fetch = fetch,
) {
  const abort = new AbortController();
  const attempt = locationAttempt(target, () => abort.abort());
  const timeout = setTimeout(attempt.cancel, 3_000);
  void Promise.resolve()
    .then(() =>
      fetcher("/api/location", {
        signal: abort.signal,
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        redirect: "error",
      }),
    )
    .then(async (response) => {
      if (!response.ok) return;
      const body: unknown = await response.json();
      const point = coarsePosition((body as { location?: unknown } | null)?.location);
      if (point && attempt.finish()) apply(point);
    })
    .catch(() => {})
    .finally(() => {
      clearTimeout(timeout);
      attempt.finish();
    });
  return () => {
    clearTimeout(timeout);
    attempt.cancel();
  };
}
