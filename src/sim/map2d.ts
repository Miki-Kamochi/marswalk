/** The 2D map of the route simulator (Leaflet, in metres). */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { dataUrl, type Bounds, type Meta, type Place, type Positions, type Traverse } from "../data/loader";
import type { NavGrid } from "../plan/grid";
import type { Profile, Route } from "../plan/planner";
import { ROUTE_COLORS, type SceneView, type ViewEvents } from "./scene";

const HOME_ICON =
  '<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="10.5" fill="#0d2a33" stroke="#7fe3ff" stroke-width="2"/><path d="M6.5 12.2 12 7l5.5 5.2M8.3 11.3V17h7.4v-5.7" fill="none" stroke="#7fe3ff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
const DEST_ICON =
  '<svg viewBox="0 0 24 32" width="26" height="34"><path d="M12 31C12 31 22 19.5 22 11.5A10 10 0 0 0 2 11.5C2 19.5 12 31 12 31Z" fill="#ffe14d" stroke="#3a2600" stroke-width="1.6"/><circle cx="12" cy="11.5" r="3.6" fill="#3a2600"/></svg>';

export class Map2D implements SceneView {
  private map: L.Map;
  private o: { easting: number; northing: number };
  private overlay: L.ImageOverlay;
  private limit: L.ImageOverlay;
  private routes = L.layerGroup();
  private ends = L.layerGroup();
  private places = L.layerGroup();
  private traverse: L.Polyline;
  private grid: NavGrid;
  private ev: ViewEvents;
  private playBox: L.LatLngBoundsExpression;
  private labelled: { place: Place; marker: L.CircleMarker }[] = [];
  private label: (p: Place) => string;

  constructor(
    el: HTMLElement,
    meta: Meta,
    grid: NavGrid,
    positions: Positions,
    traverse: Traverse,
    ev: ViewEvents,
    label: (p: Place) => string,
  ) {
    this.grid = grid;
    this.ev = ev;
    this.label = label;
    this.o = meta.frame.origin;
    const box = (b: Bounds): L.LatLngBoundsExpression => [this.ll(b.west, b.south), this.ll(b.east, b.north)];
    const map = (this.map = L.map(el, {
      crs: L.CRS.Simple,
      minZoom: -4,
      maxZoom: 2.5,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      maxBounds: L.latLngBounds(box(meta.frame.fetch) as L.LatLngBoundsLiteral).pad(0.15),
      attributionControl: true,
    }));
    map.attributionControl.setPrefix(false);
    this.playBox = box(meta.frame.play);
    map.fitBounds(this.playBox);
    L.imageOverlay(dataUrl(meta.images.surround.file), box(meta.images.surround.bounds), { opacity: 0.55 }).addTo(map);
    L.imageOverlay(dataUrl(meta.images.color.file), box(meta.images.color.bounds), {
      attribution: "NASA/JPL-Caltech/UArizona/USGS",
    }).addTo(map);
    const blank = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    this.overlay = L.imageOverlay(blank, box(meta.frame.play), { className: "cells" }).addTo(map);
    this.limit = L.imageOverlay(blank, box(meta.frame.play), { className: "cells" }).addTo(map);

    const f = meta.frame.fetch;
    const path = traverse.waypoints.filter((w) => w[1] > f.west && w[1] < f.east && w[2] > f.south && w[2] < f.north);
    this.traverse = L.polyline(
      path.map((w) => this.ll(w[1], w[2])),
      { color: "#ffffff", weight: 1.5, opacity: 0.75, dashArray: "2 5", interactive: false },
    );
    for (const p of positions.places) {
      if (p.kind === "backdrop" || p.kind === "base") continue;
      const stop = p.kind === "stop" || p.kind === "camp";
      const marker = L.circleMarker(this.ll(p.easting, p.northing), {
        radius: stop ? 6 : 3.5,
        color: stop ? "#ffe14d" : "#ffffff",
        weight: stop ? 2 : 1,
        opacity: stop ? 1 : 0.7,
        fillOpacity: stop ? 0.35 : 0.15,
      })
        .bindTooltip(label(p), { direction: "right", className: "place", permanent: stop, offset: [8, 0] })
        .addTo(this.places);
      this.labelled.push({ place: p, marker });
    }
    this.places.addTo(map);
    this.traverse.addTo(map);
    this.routes.addTo(map);
    this.ends.addTo(map);
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => ev.onPick(e.latlng.lng + this.o.easting, e.latlng.lat + this.o.northing));
    map.on("mousemove", (e: L.LeafletMouseEvent) => ev.onHover(e.latlng.lng + this.o.easting, e.latlng.lat + this.o.northing));
    map.on("mouseout", () => ev.onHover(null, null));
  }

  private ll(e: number, n: number): L.LatLngTuple {
    return [n - this.o.northing, e - this.o.easting];
  }

  private cellLL(i: number): L.LatLngTuple {
    return this.ll(this.grid.east(i), this.grid.northOf(i));
  }

  setOverlay(cv: HTMLCanvasElement | null): void {
    if (cv) this.overlay.setUrl(cv.toDataURL());
    this.overlay.setOpacity(cv ? 1 : 0);
  }

  setLimit(cv: HTMLCanvasElement | null): void {
    if (cv) this.limit.setUrl(cv.toDataURL());
    this.limit.setOpacity(cv ? 1 : 0);
  }

  setRoutes(routes: Route[], selected: Profile | null, back: number[]): void {
    this.routes.clearLayers();
    const sel = routes.find((r) => r.profile === selected);
    if (sel && back.length > 1) {
      L.polyline(back.map((c) => this.cellLL(c)), { color: "#ffffff", weight: 2, opacity: 0.8, dashArray: "5 7", interactive: false }).addTo(
        this.routes,
      );
    }
    const draw = (r: Route, on: boolean) => {
      const pts = r.cells.map((c) => this.cellLL(c));
      L.polyline(pts, { color: "#1a0f0a", weight: on ? 8 : 5.5, opacity: on ? 0.85 : 0.6, interactive: false }).addTo(this.routes);
      L.polyline(pts, { color: ROUTE_COLORS[r.profile], weight: on ? 4.5 : 2.5, opacity: on ? 1 : 0.85, bubblingMouseEvents: false })
        .on("click", () => this.ev.onSelect(r.profile))
        .addTo(this.routes);
    };
    for (const r of routes) if (r !== sel) draw(r, false);
    if (sel) {
      draw(sel, true);
      for (const i of sel.photos) {
        L.circleMarker(this.cellLL(sel.cells[i]), { radius: 4.5, color: "#1a0f0a", weight: 1.5, fillColor: "#ffffff", fillOpacity: 1, interactive: false }).addTo(
          this.routes,
        );
      }
    }
  }

  setEnds(home: number, dest: number): void {
    this.ends.clearLayers();
    const icon = (html: string, size: [number, number], anchor: [number, number]) =>
      L.divIcon({ html, className: "pin", iconSize: size, iconAnchor: anchor });
    if (home >= 0) L.marker(this.cellLL(home), { icon: icon(HOME_ICON, [26, 26], [13, 13]), interactive: false, keyboard: false }).addTo(this.ends);
    if (dest >= 0) L.marker(this.cellLL(dest), { icon: icon(DEST_ICON, [26, 34], [13, 33]), interactive: false, keyboard: false }).addTo(this.ends);
  }

  setExtras(places: boolean, traverse: boolean): void {
    if (places) this.places.addTo(this.map);
    else this.places.remove();
    if (traverse) this.traverse.addTo(this.map);
    else this.traverse.remove();
  }

  resize(): void {
    this.map.invalidateSize();
  }

  /** Show the whole play area again (after the map pane changes size). */
  fit(): void {
    this.map.invalidateSize();
    this.map.fitBounds(this.playBox, { padding: [8, 8] });
  }

  /** Rewrite the place names (after the language changes). */
  relabel(): void {
    for (const l of this.labelled) l.marker.setTooltipContent(this.label(l.place));
  }
}
