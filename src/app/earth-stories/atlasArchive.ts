const dataFiles = import.meta.glob<string>(
  ["../../sources/earth-atlas/*.json", "!../../sources/earth-atlas/*-sources.json"],
  { eager: true, query: "?url&no-inline", import: "default" },
);
const images = import.meta.glob<string>("../../sources/earth-atlas/assets/*.webp", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
const pending = new Map<string, Promise<unknown>>();

export function atlasArchive<T>(name: string): Promise<T> {
  let task = pending.get(name);
  if (!task) {
    const url = dataFiles[`../../sources/earth-atlas/${name}.json`];
    if (!url) return Promise.reject(new Error("Unknown observation archive"));
    task = fetch(url, { signal: AbortSignal.timeout(20000) })
      .then((response) => {
        if (!response.ok) throw new Error("Observation archive unavailable");
        return response.json();
      })
      .catch((error: unknown) => {
        pending.delete(name);
        throw error;
      });
    pending.set(name, task);
  }
  return task as Promise<T>;
}

export function atlasImage(name: string): string {
  const url = images[`../../sources/earth-atlas/assets/${name}`];
  if (!url) throw new Error("Unknown observation image");
  return url;
}
