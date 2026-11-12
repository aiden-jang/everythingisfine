import { reportAnalytics } from "../../analytics/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { countForDay, dayRange, fetchArchive } from "../sources/archive";
import { fetchHistory, type History } from "../sources/history";
import { MAG_MIN } from "../globe/ramp";
import { DAY_LENGTH, isArchivableDay, isRealDay } from "./day";
import { SOURCE_NAMES } from "./format";
import { NOTABLE_DAYS } from "./notableDays";
import type { Feed, FeedSnapshot } from "./feed";

export function useArchive(
  feed: Feed,
  archive: FeedSnapshot["archive"],
  sharedDay: string | null | undefined,
  onLoaded: (returnedToLive?: boolean) => void,
) {
  const [archiveDay, setArchiveDay] = useState("");
  const [archiveHazards, setArchiveHazards] = useState<History | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(() => !!sharedDay && isArchivableDay(sharedDay, Date.now()));
  const [archiveNote, setArchiveNote] = useState<string | null>(null);
  const [dayCounts, setDayCounts] = useState<Record<string, number | null>>({});
  const countsAsked = useRef(false);
  const arrivedOnADay = useRef(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const loaded = useRef(onLoaded);
  loaded.current = onLoaded;

  const askCounts = useCallback(() => {
    if (countsAsked.current) return;
    countsAsked.current = true;
    void Promise.all(
      NOTABLE_DAYS.map(async (day) => {
        const n = await countForDay(day.day, MAG_MIN);
        if (mounted.current) setDayCounts((prev) => ({ ...prev, [day.day]: n }));
      }),
    );
  }, []);

  const loadArchive = useCallback(
    async (iso: string) => {
      const span = dayRange(iso);
      if (!span || !isArchivableDay(iso, Date.now())) return;
      setArchiveDay(iso);
      request.current?.abort();
      const current = new AbortController();
      request.current = current;
      setArchiveBusy(true);
      setArchiveNote(null);
      setArchiveHazards(null);
      try {
        const get = (url: RequestInfo | URL) =>
          fetch(url, { signal: AbortSignal.any([current.signal, AbortSignal.timeout(12_000)]) });
        const history = fetchHistory(span.from, span.to, get);
        const got = await fetchArchive(span.from, span.to, MAG_MIN, get);
        // A newer request, return to live, or unmount supersedes this answer.
        if (current.signal.aborted) return;
        feed.showArchive({ ...span, answered: got.answered }, got.readings);
        reportAnalytics({ name: "archive_opened" });
        const said = (["usgs", "emsc"] as const).map((id) => {
          const answer = got.answered[id];
          return answer
            ? `${SOURCE_NAMES[id]} · ${answer.count} reports${answer.truncated ? " · Incomplete set" : ""}`
            : `${SOURCE_NAMES[id]} · Couldn’t be reached`;
        });
        setArchiveNote(said.join(" / "));
        loaded.current();
        setArchiveBusy(false);
        const hazards = await history;
        if (current.signal.aborted) return;
        setArchiveHazards(hazards);
        const count =
          hazards.cyclones.length + hazards.fires.length + hazards.floods.length + hazards.volcanoes.length;
        setArchiveNote(
          [...said, hazards.answered ? `NASA · ${count} hazard reports` : "NASA · Couldn’t be reached"].join(
            " / ",
          ),
        );
      } catch {
        if (current === request.current) setArchiveNote("That day could not be loaded. Try again.");
      } finally {
        if (current === request.current) {
          request.current = null;
          setArchiveBusy(false);
        }
      }
    },
    [feed],
  );

  // Start the live sources before a shared archive stops them.
  useEffect(() => {
    mounted.current = true;
    feed.start();
    return () => {
      request.current?.abort();
      request.current = null;
      mounted.current = false;
      feed.stop();
    };
  }, [feed]);
  useEffect(() => {
    if (!sharedDay || arrivedOnADay.current) return;
    arrivedOnADay.current = true;
    void loadArchive(sharedDay);
  }, [loadArchive, sharedDay]);

  const stepDay = useCallback(
    (days: number) => {
      const current = feed.snapshot().archive;
      if (!current) return;
      const iso = new Date(current.from + days * 86_400_000).toISOString().slice(0, 10);
      void loadArchive(iso);
    },
    [feed, loadArchive],
  );
  const backToLive = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setArchiveBusy(false);
    setArchiveDay("");
    setArchiveNote(null);
    setArchiveHazards(null);
    loaded.current(true);
    feed.resumeLive();
  }, [feed]);
  const dayFault =
    archiveDay.length < DAY_LENGTH
      ? null
      : !isRealDay(archiveDay)
        ? `${archiveDay} is not a date.`
        : !isArchivableDay(archiveDay, Date.now())
          ? "That day has not finished yet. The archive draws whole UTC days, so today is the live view."
          : null;
  return {
    archiveDay,
    setArchiveDay,
    archiveHazards,
    archiveBusy,
    archiveNote,
    dayCounts,
    askCounts,
    loadArchive,
    stepDay,
    backToLive,
    dayFault,
    earlyDay: /^\d{4}/.test(archiveDay) && Number(archiveDay.slice(0, 4)) < 1970,
    loadedDay: archive ? new Date(archive.from).toISOString().slice(0, 10) : null,
    newestDay: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    neighbours: archive
      ? {
          prev: new Date(archive.from - 86_400_000).toISOString().slice(0, 10),
          next: new Date(archive.from + 86_400_000).toISOString().slice(0, 10),
        }
      : null,
  };
}
