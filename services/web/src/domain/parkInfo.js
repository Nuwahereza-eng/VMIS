// Tourist information content for Murchison Falls National Park (supervisor
// priority 6). Served behind login as an in-app reference so officers and
// management can answer visitor questions about the park: what to see, what to
// do, where to stay, how to get in, and the key locations and routes inside.
// Content is curated reference data (no PII), kept here so it ships with the
// app and works the same online or offline.

import { GATES, LODGES } from "./reference.js";

// Real photos of the park, served from the app itself (public/park/) so they
// ship with the PWA and show offline. Only places and animals we actually have
// a photo of get one; every other card shows its icon and text instead of a
// stock photo from somewhere else.
const PHOTOS = "/park/";

function photo(file) {
  return PHOTOS + file;
}

// Landing hero and the overview banner on the in-app park-info page.
export const HERO_IMAGE = photo("murchison-falls.jpg");

export const PARK_OVERVIEW = {
  name: "Murchison Falls National Park",
  tagline: "Uganda's largest national park, where the Nile explodes through a narrow gorge.",
  image: photo("top-of-the-falls.jpg"),
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
  { name: "Hippopotamus", icon: "bi-water", image: photo("nile-hippos-buffalo.jpg"), note: "Abundant along the Nile and delta." },
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
    image: photo("murchison-falls.jpg"),
   
    note: "The thunderous point where the Nile squeezes through the gorge; reachable by road or a short hike.",
  },
  {
    name: "Victoria Nile & the Delta",
    icon: "bi-tsunami",
    image: photo("nile-hippos-buffalo.jpg"),
   
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
  { name: "Launch / boat cruise", icon: "bi-water", image: photo("launch-cruise.jpg"), note: "Upstream to the base of the falls, or to the delta." },
  { name: "Top of the Falls hike", icon: "bi-signpost-2", image: photo("top-of-the-falls.jpg"), note: "Walk to the viewpoint above the gorge." },
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

// Photos from lodges in the park. They are not tied to a named lodge, so they
// sit above the lodge list as a general impression rather than on its cards.
export const LODGE_PHOTOS = [
  { src: photo("riverside-lodge-aerial.jpg"), caption: "A riverside lodge above the Nile" },
  { src: photo("lodge-dining-hall.jpg"), caption: "Lodge dining hall" },
  { src: photo("lodge-terrace.jpg"), caption: "Terrace dining" },
];

export const ACCOMMODATION = LODGES.filter((l) => l !== "Outside the park").map((lodge) => ({
  name: lodge,
  icon: "bi-house-door",
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

// Shown on the live "My visit" screen while a tour is in progress.
export const SAFETY_TIPS = [
  { icon: "bi-car-front", text: "Stay inside your vehicle on game drives unless at a marked stop or with a ranger." },
  { icon: "bi-rulers", text: "Keep at least 25 m from elephants, buffalo and hippos; never block an animal's path." },
  { icon: "bi-water", text: "Keep well back from riverbanks and the falls edge — crocodiles and hippos are common." },
  { icon: "bi-moon", text: "No driving on park roads after 7pm without a ranger escort." },
  { icon: "bi-trash3", text: "Do not feed animals or leave litter; carry all rubbish out of the park." },
  { icon: "bi-telephone", text: "Network is patchy: your ticket and QR stay on this device, even offline." },
];
