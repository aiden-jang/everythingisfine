const cache = new Map<string, { blob: Blob; expires: number }>();
const requests: number[] = [];
const MINUTE = 60_000;
const MAX_BYTES = 16 * 1024 * 1024;
let bytes = 0;

export function forgetRainviewer(url: string) {
  const saved = cache.get(url);
  if (saved) bytes -= saved.blob.size;
  cache.delete(url);
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export async function rainviewerFetch(url: string, signal: AbortSignal, ttl = 10 * MINUTE): Promise<Blob> {
  signal.throwIfAborted();
  const saved = cache.get(url);
  if (saved && saved.expires > Date.now()) return saved.blob;
  // Leave headroom below RainViewer's shared-IP limit, including rapid retries and re-entry.
  while (true) {
    const now = Date.now();
    while (requests[0] !== undefined && requests[0] <= now - MINUTE) requests.shift();
    if (requests.length < 80) break;
    await wait(Math.max(1, requests[0]! + MINUTE - now), signal);
  }
  signal.throwIfAborted();
  requests.push(Date.now());
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(14_000)]) });
  if (!response.ok) throw new Error("RainViewer unavailable");
  const blob = await response.blob();
  signal.throwIfAborted();
  if (!blob.type.startsWith("image/") && !blob.type.includes("json"))
    throw new Error("Unexpected radar data");
  if (blob.size > MAX_BYTES) throw new Error("Radar response too large");
  if (saved) bytes -= saved.blob.size;
  cache.delete(url);
  cache.set(url, { blob, expires: Date.now() + ttl });
  bytes += blob.size;
  for (const [key, value] of cache) {
    if (bytes <= MAX_BYTES && cache.size <= 80) break;
    bytes -= value.blob.size;
    cache.delete(key);
  }
  return blob;
}
