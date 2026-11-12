import type { FeedRow, LayerAnswer } from "../feedStatus";

export type RadarFeedHealth = Pick<FeedRow, "state" | "lastCheck" | "message">;

export function radarFeedHealth({
  status,
  image,
  checkedAt,
  latestAt,
  lastSuccess,
}: {
  status: "loading" | "ready" | "empty" | "error";
  image: LayerAnswer;
  checkedAt: number;
  latestAt: number | undefined;
  lastSuccess: number | undefined;
}): RadarFeedHealth {
  const lastCheck = lastSuccess;
  if (status === "loading") return { state: "pending", lastCheck };
  if (status === "error") return { state: "failed", lastCheck };
  if (status === "empty") return { state: "ok", lastCheck, message: "Available · no recent scans" };
  if (image === "failed") return { state: "failed", lastCheck, message: "Latest radar image unavailable" };
  if (image === "pending") return { state: "pending", lastCheck, message: "Loading radar images" };
  return {
    state: "ok",
    lastCheck,
    message:
      latestAt !== undefined && checkedAt - latestAt > 20 * 60_000
        ? "Available · latest scan delayed"
        : undefined,
  };
}
