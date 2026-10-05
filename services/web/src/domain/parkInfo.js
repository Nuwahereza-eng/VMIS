// Tourist information content for Murchison Falls National Park (supervisor
// priority 6). Served behind login as an in-app reference so officers and
// management can answer visitor questions about the park: what to see, what to
// do, where to stay, how to get in, and the key locations and routes inside.
// Content is curated reference data (no PII), kept here so it ships with the
// app and works the same online or offline.

import { GATES, LODGES } from "./reference.js";

export const PARK_OVERVIEW = {
  name: "Murchison Falls National Park",
  tagline: "Uganda's largest national park, where the Nile explodes through a narrow gorge.",
  summary:
    "Murchison Falls National Park covers about 3,840 km² in north-western Uganda, bisected " +
    "by the Victoria Nile. At its heart the river is forced through a 7-metre gap in the rocks " +
    "before plunging 43 metres, creating the dramatic Murchison Falls. The park protects open " +
    "savannah, woodland, wetland and riverine forest, and forms part of the larger Murchison " +
    "Falls Conservation Area together with the Bugungu and Karuma wildlife reserves.",
  facts: [
    { label: "Area", value: "≈ 3,840 km²" },
    { label: "Established", value: "1952" },
    { label: "Main river", value: "Victoria Nile" },
    { label: "Falls drop", value: "43 metres" },
    { label: "Best time", value: "Dry seasons: Dec–Feb & Jun–Sep" },
  ],
};

export const ANIMALS = [
  { name: "African elephant", icon: "bi-tsunami", note: "Large herds on the northern savannah." },
  { name: "Lion", icon: "bi-emoji-neutral", note: "Commonly seen on the Buligi game tracks." },
  { name: "Rothschild's giraffe", icon: "bi-arrow-up", note: "A key stronghold for the species." },
  { name: "Cape buffalo", icon: "bi-shield", note: "Found throughout the grasslands." },
  { name: "Hippopotamus", icon: "bi-water", note: "Abundant along the Nile and delta." },
  { name: "Nile crocodile", icon: "bi-badge-wc", note: "Basking along the river banks." },
  { name: "Leopard", icon: "bi-moon-stars", note: "Elusive, often near riverine forest." },
  { name: "Uganda kob", icon: "bi-signpost", note: "The most numerous antelope here." },
  { name: "Hartebeest & oribi", icon: "bi-compass", note: "Typical of the open plains." },
  { name: "Chimpanzee", icon: "bi-tree", note: "Tracked in nearby Budongo Forest (Kaniyo Pabidi)." },
  { name: "Shoebill stork", icon: "bi-feather", note: "A birding highlight in the delta." },
  { name: "450+ bird species", icon: "bi-binoculars", note: "Including fish eagles and bee-eaters." },
];

export const ATTRACTIONS = [
  {
    name: "Murchison Falls (Top of the Falls)",
    icon: "bi-water",
    note: "The thunderous point where the Nile squeezes through the gorge; reachable by road or a short hike.",
  },
  {
    name: "Victoria Nile & the Delta",
    icon: "bi-tsunami",
    note: "Where the river meets Lake Albert — prime for boat cruises and shoebill sightings.",
  },
  {
    name: "Buligi game tracks",
    icon: "bi-signpost-split",
    note: "The classic northern savannah circuit between the Nile and Lake Albert.",
  },
  {
    name: "Karuma Falls",
    icon: "bi-water",
    note: "A series of rapids at the park's eastern edge.",
  },
  {
    name: "Budongo Forest (Kaniyo Pabidi)",
    icon: "bi-tree",
    note: "Mahogany forest for chimpanzee tracking and forest birding.",
  },
];

export const ACTIVITIES = [
  { name: "Game drives", icon: "bi-truck", note: "Morning, afternoon and night drives on the northern tracks." },
  { name: "Launch / boat cruise", icon: "bi-water", note: "Upstream to the base of the falls, or to the delta." },
  { name: "Top of the Falls hike", icon: "bi-signpost-2", note: "Walk to the viewpoint above the gorge." },
  { name: "Chimpanzee tracking", icon: "bi-tree", note: "In Budongo Forest at Kaniyo Pabidi." },
  { name: "Birdwatching", icon: "bi-binoculars", note: "Over 450 species, shoebill a top target." },
  { name: "Sport fishing", icon: "bi-bezier", note: "Catch-and-release for Nile perch (permit required)." },
  { name: "Cultural encounters", icon: "bi-people", note: "Community visits near the park gates." },
  { name: "Hot air balloon safari", icon: "bi-balloon", note: "Sunrise flights over the savannah." },
];

// Entry points (gates) with short orientation notes. Gate names come from the
// shared reference list so they match registration and the dashboard.
const GATE_NOTES = {
  "Kichumbanyobo Gate": "Southern gate from Masindi; main road approach near Budongo Forest.",
  "Tangi Gate": "Northern gate from Pakwach/Gulu side.",
  "Bugungu Gate": "South-western gate via Bugungu reserve, towards Lake Albert.",
  "Wankwar Gate": "North-eastern access from the Gulu direction.",
  "Chobe Gate": "Eastern gate near Karuma, by the Chobe area.",
  "Mubako Gate": "Western access used for some lodge and delta routes.",
};

export const ENTRY_POINTS = GATES.map((gate) => ({
  name: gate,
  note: GATE_NOTES[gate] || "Park entry point.",
}));

// Ferry crossing — important for routes between the north and south banks.
export const FERRY = {
  name: "Paraa Ferry",
  note:
    "A vehicle and passenger ferry crosses the Victoria Nile at Paraa, linking the southern " +
    "sector and the northern game-drive circuit. Crossing times are scheduled through the day; " +
    "confirm the current timetable at the gate or lodge before travelling.",
};

export const ACCOMMODATION = LODGES.filter((l) => l !== "Outside the park").map((lodge) => ({
  name: lodge,
}));

// Key locations and routes within the park, for orientation and simple maps.
export const KEY_LOCATIONS = [
  { name: "Paraa", icon: "bi-geo-alt-fill", note: "Central hub: ferry crossing, park HQ and several lodges." },
  { name: "Top of the Falls", icon: "bi-water", note: "Viewpoint above the gorge; car park and short trail." },
  { name: "Buligi Peninsula", icon: "bi-map", note: "Northern game-drive circuit between the Nile and Lake Albert." },
  { name: "Nile Delta", icon: "bi-tsunami", note: "Where the river enters Lake Albert; boat cruise destination." },
  { name: "Kaniyo Pabidi", icon: "bi-tree", note: "Budongo Forest site for chimpanzee tracking." },
  { name: "Karuma Falls", icon: "bi-water", note: "Rapids at the eastern boundary." },
];

export const ROUTES = [
  "Kichumbanyobo Gate → Paraa: main southern approach (via Budongo Forest).",
  "Paraa → Top of the Falls: short drive or hike to the gorge viewpoint.",
  "Paraa Ferry → Buligi tracks: cross to the north bank for the savannah game drives.",
  "Paraa → Nile Delta: boat cruise downstream towards Lake Albert.",
  "Tangi / Wankwar Gate → Paraa: northern approach for the game-drive sector.",
];

export const PLAN_TIPS = [
  "Carry a valid ticket/QR code; it is scanned at the gate, checkpoints and on exit.",
  "Ticket validity follows your paid length of stay — plan re-entry within that window.",
  "Dry seasons (Dec–Feb, Jun–Sep) give the best game viewing and road conditions.",
  "Book launch cruises and chimpanzee tracking ahead in peak season.",
  "Respect wildlife distances and follow ranger guidance at all times.",
];
