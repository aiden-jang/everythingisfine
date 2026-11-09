import type { Plugin, ViteDevServer } from "vite";
import { relayObservation } from "./observations";

/** The same fixed routes in local Vite, without Cloudflare bindings or a remote development relay. */
export function observationDevelopment(): Plugin {
  const stored = new Map<string, { response: Response; expires: number }>();
  const key = (request: RequestInfo | URL) => (request instanceof Request ? request.url : String(request));
  const cache = {
    async match(request: RequestInfo | URL) {
      const hit = stored.get(key(request));
      return hit && hit.expires > Date.now() ? hit.response.clone() : undefined;
    },
    async put(request: RequestInfo | URL, response: Response) {
      for (const [id, entry] of stored) if (entry.expires <= Date.now()) stored.delete(id);
      if (stored.size >= 6) stored.delete(stored.keys().next().value!);
      const seconds = Number(/max-age=(\d+)/.exec(response.headers.get("Cache-Control") ?? "")?.[1] ?? 0);
      stored.set(key(request), { response, expires: Date.now() + seconds * 1000 });
    },
  };
  const install = (server: Pick<ViteDevServer, "middlewares">) => {
    server.middlewares.use((request, response, next) => {
      const { url, method } = request as { url?: string; method?: string };
      if (!url?.startsWith("/api/observations/")) return next();
      const input = new Request(`http://localhost${url}`, { method: method ?? "GET" });
      void relayObservation(input, cache)
        .then(async (result) => {
          response.writeHead(result.status, Object.fromEntries(result.headers));
          response.end(new Uint8Array(await result.arrayBuffer()));
        })
        .catch(next);
    });
  };
  return { name: "observations", configureServer: install, configurePreviewServer: install };
}
