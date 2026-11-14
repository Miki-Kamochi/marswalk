/**
 * Phase 1 data check: the 2D layered map. Every layer comes from a different NASA dataset
 * and should line up with the others.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toLonLat } from "../data/frame";
import { dataUrl, loadJson, loadMeta, type Bounds, type Positions, type Traverse } from "../data/loader";

async function main() {
  const meta = await loadMeta();
  const o = meta.frame.origin;
  // Leaflet "simple" coordinates: [northing, easting] in metres relative to the play-area centre
  const ll = (e: number, n: number): L.LatLngTuple => [n - o.northing, e - o.easting];
  const box = (b: Bounds): L.LatLngBoundsExpression => [ll(b.west, b.south), ll(b.east, b.north)];

  const map = L.map("map", { crs: L.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: 0.25, attributionControl: true });
  map.fitBounds(box(meta.frame.play));

  const surround = L.imageOverlay(dataUrl(meta.images.surround.file), box(meta.images.surround.bounds)).addTo(map);
  const base = {
    "Colour imagery (HiRISE)": L.imageOverlay(dataUrl(meta.images.color.file), box(meta.images.color.bounds), {
      attribution: "NASA/JPL-Caltech/UArizona/USGS",
    }).addTo(map),
    "Grey imagery 1 m (HiRISE)": L.imageOverlay(dataUrl(meta.images.ortho.file), box(meta.images.ortho.bounds)),
  };
  surround.bringToBack();

  const overlays: Record<string, L.Layer> = {};
  for (const [name, l] of Object.entries(meta.layers)) {
    overlays[`${name} — ${l.source.split(",")[0].split("(")[0]}`] = L.imageOverlay(dataUrl(l.file), box(l.bounds), {
      opacity: 0.75,
    });
  }

  const [traverse, positions] = await Promise.all([
    loadJson<Traverse>("traverse.json"),
    loadJson<Positions>("positions.json").catch(() => ({ places: [], route: [] }) as Positions),
  ]);
  const f = meta.frame.fetch;
  const path = traverse.waypoints.filter((w) => w[1] > f.west && w[1] < f.east && w[2] > f.south && w[2] < f.north);
  overlays["Curiosity's path (MSL)"] = L.polyline(
    path.map((w) => ll(w[1], w[2])),
    { color: "#ffffff", weight: 2 },
  ).addTo(map);

  const places = L.layerGroup();
  const colors: Record<string, string> = { base: "#7fe3ff", stop: "#ffe066", landmark: "#ffffff", backdrop: "#ffb38a" };
  for (const p of positions.places.filter((p) => p.kind !== "backdrop")) {
    L.circleMarker(ll(p.easting, p.northing), { radius: 6, color: colors[p.kind], weight: 2, fillOpacity: 0.4 })
      .bindTooltip(p.name, { permanent: true, direction: "right", className: "place" })
      .addTo(places);
  }
  for (const r of positions.route) {
    L.polyline(
      r.points.map(([e, n]) => ll(e, n)),
      { color: "#ffe066", weight: 2, dashArray: "6 6" },
    ).addTo(places);
  }
  overlays["Places + EVA route"] = places.addTo(map);

  L.control.layers(base, overlays, { collapsed: false }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map); // CRS.Simple units are metres here

  const readout = document.getElementById("readout")!;
  map.on("mousemove", (ev: L.LeafletMouseEvent) => {
    const e = ev.latlng.lng + o.easting;
    const n = ev.latlng.lat + o.northing;
    const g = toLonLat(e, n);
    readout.textContent = `E ${e.toFixed(0)}  N ${n.toFixed(0)}   ${(-g.lat).toFixed(4)}°S ${g.lon.toFixed(4)}°E`;
  });
}

main().catch((err) => {
  console.error(err);
  document.getElementById("readout")!.textContent = `ERROR: ${err.message}`;
});
