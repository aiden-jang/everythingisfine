import { handleAnalytics, type AnalyticsBindings } from "../analytics/worker";
import { relayObservation } from "./observations";
interface Env extends AnalyticsBindings {
  ASSETS: { fetch(request: Request): Promise<Response> };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/api/analytics") return handleAnalytics(request, env);
    if (new URL(request.url).pathname.startsWith("/api/observations/"))
      return relayObservation(request, (caches as CacheStorage & { default: Cache }).default);
    return env.ASSETS.fetch(request);
  },
};
