import type { lunarTraverses } from "./traverses";

type Traverse = (typeof lunarTraverses)[number];
type Station = Traverse["stations"][number];
type StationNote = { text: string; journal: string };

const journal = "https://apollojournals.org/alsj/a17/";

export const lunarStationNotes: Record<Station, StationNote> = {
  "Steno Crater": {
    text: "Cernan and Schmitt photographed a rim boulder before chipping off pieces to bring home.",
    journal: journal + "a17.sta1.html",
  },
  Nansen: {
    text: "Below South Massif, the crew sampled a pale boulder and scooped up soil that had collected against its base.",
    journal: journal + "a17.sta2.html",
  },
  Lara: {
    text: "At nearby Ballet Crater, the crew collected fragments from the pale landslide that spread across the valley floor.",
    journal: journal + "a17.trvsta4.html",
  },
  "Shorty Crater": {
    text: "Schmitt spotted orange soil by the rim. Its tiny beads of volcanic glass came from an eruption billions of years earlier.",
    journal: journal + "a17.sta4.html",
  },
  Camelot: {
    text: "The crew collected basalt from the rocky rim, bringing home a piece of the ancient lava beneath the valley floor.",
    journal: journal + "a17.sta5.html",
  },
  "Station 6": {
    text: "The crew sampled a giant fractured boulder that rolled down North Massif. Its track was still visible uphill.",
    journal: journal + "a17.sta6.html",
  },
  "Station 7": {
    text: "Schmitt collected a blue-gray breccia from a small boulder sitting in a crater of its own.",
    journal: journal + "a17.sta7.html",
  },
  "Station 8": {
    text: "A small boulder at the foot of the Sculptured Hills yielded sample 78235, a rock formed deep in the Moon’s crust.",
    journal: journal + "a17.sta8.html",
  },
  "Van Serg": {
    text: "Digging beside the crater, the crew exposed pale gray soil beneath a darker surface layer.",
    journal: journal + "a17.sta9.html",
  },
};
