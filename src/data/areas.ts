/**
 * The map areas. Each has its own folder of processed NASA data in public/data/<id>/
 * (scripts/config.py lists the same areas with their bounds). A page shows the area named by
 * ?area= in its address, or the first one.
 */
export type AreaId = "buttes" | "gediz";

export interface Area {
  id: AreaId;
  /** [English, Japanese] */
  name: [string, string];
  /** one line on what kind of ground it is */
  what: [string, string];
  /** the Curiosity sols spent in it */
  sols: string;
}

export const AREAS: Area[] = [
  {
    id: "buttes",
    name: ["Murray Buttes", "マレー・ビュート"],
    what: ["Gentle plain with mesas and dunes", "メサと砂丘のあるなだらかな平原"],
    sols: "1352–2804",
  },
  {
    id: "gediz",
    name: ["Gediz Vallis", "ゲディズ・ヴァリス"],
    what: ["Steep foothills of Mount Sharp", "シャープ山のけわしい山すそ"],
    sols: "3154–4628",
  },
];

const isArea = (v: string | null): v is AreaId => AREAS.some((a) => a.id === v);

export const areaOf = (v: string | null | undefined): AreaId => (isArea(v ?? null) ? (v as AreaId) : "buttes");

/** The area this page shows. */
export const AREA: AreaId = areaOf(typeof location === "undefined" ? null : new URLSearchParams(location.search).get("area"));
