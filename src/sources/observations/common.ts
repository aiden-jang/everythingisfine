export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export async function request(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(16_000)]) });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return response;
}

export function nearest<T>(samples: readonly T[], at: number, time: (item: T) => number) {
  let left = 0;
  let right = samples.length - 1;
  if (right < 0) return undefined;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (time(samples[middle]!) < at) left = middle + 1;
    else right = middle;
  }
  const current = samples[left]!;
  const prior = samples[left - 1];
  return prior && at - time(prior) <= time(current) - at ? prior : current;
}

export const sampleAt = (samples: readonly (readonly [number, number])[], at: number) =>
  nearest(samples, at, (sample) => sample[0]);

export const utc = (time: number) => new Date(time).toISOString();
