import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CTA_IMAGE,
  FALLS_PHOTOS,
  HERO_CLIPS_TALL,
  HERO_CLIPS_WIDE,
  RANGERS_CLIP,
  RIBBON_PHOTOS,
  WILD_TILES,
} from "../src/domain/landing.js";

const PARK = resolve(__dirname, "../public/park");
const files = (dir, ext) => readdirSync(`${PARK}/${dir}`).filter((f) => f.endsWith(ext)).map((f) => `/park/${dir}/${f}`);

describe("landing page media", () => {
  const used = new Set(
    [
      ...HERO_CLIPS_WIDE.map((c) => c.video),
      ...HERO_CLIPS_TALL.map((c) => c.video),
      ...WILD_TILES.map((t) => t.video || t.image),
      ...FALLS_PHOTOS.map((p) => p.image),
      ...RIBBON_PHOTOS,
      RANGERS_CLIP.video,
      CTA_IMAGE,
    ],
  );

  it("uses every clip and slide photo", () => {
    expect(files("clips", ".mp4").filter((f) => !used.has(f))).toEqual([]);
    expect(files("slides", ".jpg").filter((f) => !used.has(f))).toEqual([]);
  });

  it("only points at files that exist", () => {
    const all = new Set([...files("clips", ".mp4"), ...files("slides", ".jpg")]);
    expect([...used].filter((f) => !all.has(f))).toEqual([]);
  });

  it("gives every clip a poster that exists", () => {
    const posters = new Set(files("clips", ".jpg"));
    const clips = [...HERO_CLIPS_WIDE, ...HERO_CLIPS_TALL, ...WILD_TILES.filter((t) => t.video), RANGERS_CLIP];
    expect(clips.map((c) => c.poster).filter((p) => !posters.has(p))).toEqual([]);
  });
});
