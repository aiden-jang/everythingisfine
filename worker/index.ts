import { handleAnalytics, type AnalyticsBindings } from "../analytics/worker";
interface Env extends AnalyticsBindings {
  ASSETS: { fetch(request: Request): Promise<Response> };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/api/analytics") return handleAnalytics(request, env);
    return env.ASSETS.fetch(request);
  },
};
