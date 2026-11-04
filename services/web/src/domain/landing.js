// Media and the few words on the public landing page. The detail lives in the
// park guide (TouristInfoPage); this page is pictures first.

const slide = (file) => `/park/slides/${file}.jpg`;
const clip = (file) => ({ video: `/park/clips/${file}.mp4`, poster: `/park/clips/${file}.jpg` });

// Hero reel, one clip at a time. Wide clips fill a desktop screen; tall ones
// stay sharp on a phone, where the wide falls clip is framed on the water.
export const HERO_CLIPS_WIDE = ["falls", "hyenas-bush", "lioness", "bird", "shoebill"].map(clip);
export const HERO_CLIPS_TALL = [
  clip("giraffes"),
  { ...clip("falls"), focus: "30% center" },
  clip("lioness-snarl"),
  clip("giraffes-close"),
  clip("lion-digging"),
];

export const STATS = [
  { value: "3,840 km²", label: "Uganda's largest park" },
  { value: "43 m", label: "The falls" },
  { value: "450+", label: "Bird species" },
  { value: "Dec–Feb · Jun–Sep", label: "Best time to visit" },
];

// "Meet the wild" wall on a 4-column grid. Each group below fills a whole block
// (tall, wide, tall, wide stacks into two rows), so the wall has no holes; the
// order matters.
export const WILD_TILES = [
  { ...clip("giraffes-close"), label: "Giraffes", size: "tall" },
  { image: slide("lion-pride"), label: "Lions", size: "wide" },
  { image: slide("leopard"), label: "Leopard", size: "tall", focus: "center 12%" },
  { ...clip("shoebill"), label: "Shoebill", size: "wide" },

  { ...clip("lioness-snarl"), label: "Lioness", size: "tall" },
  { image: slide("chimpanzees"), label: "Chimpanzees", size: "wide" },
  { ...clip("lion-digging"), label: "The hunt", size: "tall" },
  { ...clip("hyenas"), label: "Spotted hyena", size: "wide" },

  { ...clip("lion-hunt"), label: "The catch", size: "tall" },
  { ...clip("bird"), label: "Francolin", size: "wide" },
  { ...clip("giraffes"), label: "Before the rain", size: "tall" },
  { image: slide("rhinos"), label: "Rhinos · Ziwa", size: "wide" },

  { ...clip("hyenas-bush"), label: "On the prowl", size: "wide" },
  { ...clip("lioness"), label: "In the trees", size: "wide" },
  { image: slide("tree-lions"), label: "Tree lions", size: "wide" },
  { image: slide("kob-male"), label: "Uganda kob", size: "square" },
  { image: slide("giraffe-calves"), label: "Calves", size: "square" },
];

// Everything else, in the moving photo ribbon.
export const RIBBON_PHOTOS = [
  "giraffes-herd",
  "lioness",
  "chimpanzee",
  "giraffes-pair",
  "lion-roadside",
  "kob-female",
  "giraffes-tall",
  "lioness-feeding",
  "lions-resting",
  "giraffes-savanna",
  "lion-tongue",
].map(slide);

export const FALLS_PHOTOS = [
  { image: slide("falls-gorge"), alt: "Murchison Falls through the gorge" },
  { image: slide("falls-panorama"), alt: "The Nile above the gorge" },
  { image: slide("falls-aerial"), alt: "The falls from above" },
  { image: slide("falls-viewpoint"), alt: "The falls from the viewpoint" },
];

export const RANGERS_CLIP = clip("rangers");

export const CTA_IMAGE = slide("giraffes-herd");

export const STEPS = [
  { icon: "bi-calendar-check", title: "Book online" },
  { icon: "bi-credit-card", title: "Pay" },
  { icon: "bi-qr-code-scan", title: "Show your QR at the gate" },
];
