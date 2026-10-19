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
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveNote, setArchiveNote] = useState<string | null>(null);
  const [dayCounts, setDayCounts] = useState<Record<string, number | null>>({});
  const countsAsked = useRef(false);
  const arrivedOnADay = useRef(false);
  const request = useRef(0);
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
      const current = ++request.current;
      setArchiveBusy(true);
      setArchiveNote(null);
      setArchiveHazards(null);
      try {
        const [got, hazards] = await Promise.all([
          fetchArchive(span.from, span.to, MAG_MIN),
          fetchHistory(span.from, span.to),
        ]);
        // A newer request, return to live, or unmount supersedes this answer.
        if (current !== request.current) return;
        feed.showArchive(span, got.readings);
        reportAnalytics({ name: "archive_opened" });
        setArchiveHazards(hazards);
        const said = (["usgs", "emsc"] as const).map((id) => {
          const answer = got.answered[id];
          return answer
            ? `${SOURCE_NAMES[id]} ${answer.count}${answer.truncated ? " (truncated)" : ""}`
            : `${SOURCE_NAMES[id]} did not answer`;
        });
        const count =
          hazards.cyclones.length + hazards.fires.length + hazards.floods.length + hazards.volcanoes.length;
        said.push(hazards.answered ? `EONET ${count}` : "EONET did not answer");
        setArchiveNote(said.join(" · "));
        loaded.current();
      } catch {
        if (current === request.current) setArchiveNote("That day could not be loaded. Try again.");
      } finally {
        if (current === request.current) setArchiveBusy(false);
      }
    },
    [feed],
  );

  // Start the live sources before a shared archive stops them.
  useEffect(() => {
    mounted.current = true;
    feed.start();
    return () => {
      request.current += 1;
      mounted.current = false;
      feed.stop();
    };
  }, [feed]);
  useEffect(() => {
    if (!sharedDay || arrivedOnADay.current) return;
    arrivedOnADay.current = true;
    setArchiveDay(sharedDay);
    void loadArchive(sharedDay);
  }, [loadArchive, sharedDay]);

  const stepDay = useCallback(
    (days: number) => {
      const current = feed.snapshot().archive;
      if (!current) return;
      const iso = new Date(current.from + days * 86_400_000).toISOString().slice(0, 10);
      setArchiveDay(iso);
      void loadArchive(iso);
    },
    [feed, loadArchive],
  );
  const backToLive = useCallback(() => {
    request.current += 1;
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
