"""Pick and verify the base, mission stops and landmarks against the data.

Usage:  .venv/Scripts/python scripts/positions.py     (after process_data.py)

Every place is chosen from the data (a Curiosity waypoint, a feature found in the elevation
model, or a MOLA peak) and then checked: elevation, local slope, sand, CRISM hematite,
distance/bearing from base and whether it can really be seen from the base at eye height.
Writes public/data/<area>/positions.json and prints a report. Usage with an area:
  MARSWALK_AREA=gediz .venv/Scripts/python scripts/positions.py
"""
import json
import math

import numpy as np
import rasterio
from scipy import ndimage as ndi

from config import *

EYE = 1.7
PW, PS, PE, PN = PLAY_BOUNDS
FW, FS, FE, FN = FETCH_BOUNDS


class Grid:
    def __init__(self, path):
        with rasterio.open(path) as ds:
            self.z = ds.read(1).astype(np.float64)
            self.w, self.n, self.res = ds.bounds.left, ds.bounds.top, ds.transform.a
            if ds.nodata is not None:
                self.z[self.z == ds.nodata] = np.nan
            self.z[self.z < -30000] = np.nan

    def sample(self, e, n):
        c = (np.asarray(e) - self.w) / self.res - 0.5
        r = (self.n - np.asarray(n)) / self.res - 0.5
        return ndi.map_coordinates(self.z, [np.atleast_1d(r), np.atleast_1d(c)], order=1, mode="constant", cval=np.nan)


dem = Grid(DEM_WINDOW)
mid = Grid(RAW / "gale_mosaic" / f"gale_dem_{MID_DECIMATE}m_full.tif")
far = Grid(RAW / "mola" / "mola_463m_gale.tif")
slope = np.load(INTERIM / "slope.npy")          # play area, 2 m
sand = np.load(INTERIM / "sand.npy")            # play area, 2 m
hema = (np.load(INTERIM / "crism_hematite.npy") if HAS_CRISM   # play area, 6 m, 0..1 (NaN = no coverage)
        else np.full((round((PN - PS) / 6), round((PE - PW) / 6)), np.nan))
traverse = json.loads((PUBLIC_DATA / "traverse.json").read_text())["waypoints"]


def elev(e, n):
    """Elevation from the most detailed dataset covering the point."""
    out = dem.sample(e, n)
    for g in (mid, far):
        m = np.isnan(out)
        if m.any():
            out[m] = g.sample(np.atleast_1d(e)[m], np.atleast_1d(n)[m])
    return out


def play_px(e, n, cell):
    return int((PN - n) / cell), int((e - PW) / cell)


def disc(arr, e, n, radius, cell):
    r, c = play_px(e, n, cell)
    k = int(radius / cell)
    yy, xx = np.ogrid[-k:k + 1, -k:k + 1]
    sub = arr[max(r - k, 0):r + k + 1, max(c - k, 0):c + k + 1]
    m = (yy * yy + xx * xx <= k * k)[:sub.shape[0], :sub.shape[1]]
    return sub[m]


def visible(e0, n0, e1, n1, target_height=0.0):
    """Line of sight from eye height at (e0,n0) to target_height above the ground at (e1,n1),
    over the real terrain, including the curvature of Mars."""
    d = math.hypot(e1 - e0, n1 - n0)
    z0 = float(elev(e0, n0)[0]) + EYE
    z1 = float(elev(e1, n1)[0]) + target_height
    # dense near the observer (where small rises block the view), sparser far away
    t = np.unique(np.concatenate([np.arange(3, min(d, 3000), 2.0), np.arange(3000, d, 25.0)])) / d
    t = t[(t > 0) & (t < 1 - 15 / d)]
    es, ns = e0 + (e1 - e0) * t, n0 + (n1 - n0) * t
    ground = elev(es, ns)
    dist = t * d
    # height of the sight line above the reference sphere-tangent plane at the observer
    drop = lambda x: x * x / (2 * MARS_RADIUS_M)
    line = z0 + (z1 - drop(d) - z0) * t
    clear = line - (ground - drop(dist))
    i = int(np.nanargmin(clear))
    return bool(clear[i] > 0), float(clear[i]), float(dist[i])


def wp(sol):
    """First Curiosity waypoint of a sol."""
    return next(w for w in traverse if w[0] == sol)


def wp_near(sol):
    """First waypoint of the logged sol nearest to `sol` (not every sol has a drive)."""
    return wp(min({w[0] for w in traverse}, key=lambda s: (abs(s - sol), s)))


def lonlat(e, n):
    return round(math.degrees(e / MARS_RADIUS_M), 5), round(math.degrees(n / MARS_RADIUS_M), 5)


places = []


def add(id, name, kind, e, n, how, note=None, top=0.0, **extra):
    z = float(elev(e, n)[0])
    lon, lat = lonlat(e, n)
    p = dict(id=id, name=name, kind=kind, easting=round(e, 1), northing=round(n, 1), elevation=round(z, 1),
             lon=lon, lat=lat, chosenFrom=how)
    if note:
        p["note"] = note
    p.update(extra)
    places.append(p)
    return p


# ================================================================== places of each area
if AREA == "buttes":
    # ------------------------------------------------------------------ base: flattest sand-free spot
    # near Curiosity's sol-1405 position, on the plain just north of the Murray Buttes
    ce, cn = wp(1405)[1:3]
    best = None
    for de in range(-120, 121, 10):
        for dn in range(-120, 121, 10):
            e, n = ce + de, cn + dn
            s = disc(slope, e, n, 30, 2)
            if disc(sand, e, n, 40, 2).mean() > 0:
                continue
            score = float(np.percentile(s, 95))
            if best is None or score < best[0]:
                best = (score, e, n, float(s.mean()))
    _, be, bn, bmean = best
    add("base", "Base Camp", "base", be, bn,
        "flattest sand-free 30 m pad within 120 m of Curiosity's sol 1405 position",
        note="Landing / habitat site on the plain just north of the Murray Buttes.")

    # ------------------------------------------------------------------ mission stops (on Curiosity's real path)
    e, n = wp(1454)[1:3]
    add("stop_murray_buttes", "Murray Buttes", "stop", e, n, "Curiosity waypoint, sol 1454",
        note="Curiosity drilled the 'Quela' sample here at the foot of the last butte (sols 1454-1466). "
             "Layered lake-bed mudstone (Murray formation) under wind-blown sandstone caps.", curiositySol=1454)

    # dune stop: the Curiosity waypoint (sols 1596-1662) closest to the sand but still on firm ground
    cands = []
    for w in traverse:
        if 1596 <= w[0] <= 1662:
            here = disc(sand, w[1], w[2], 6, 2).mean()
            near = disc(sand, w[1], w[2], 40, 2).mean()
            if here == 0:
                cands.append((near, w))
    near, w = max(cands, key=lambda c: c[0])
    add("stop_bagnold_dunes", "Bagnold Dunes edge", "stop", w[1], w[2],
        f"Curiosity waypoint, sol {w[0]} (firm ground with the most dark sand within 40 m)",
        note="Curiosity sampled the linear dunes here in 2017 ('Ogunquit Beach', sols 1602-1660). "
             "Active basalt sand: every dune looks alike and the sand is a hazard.", curiositySol=w[0],
        sandWithin40m=round(float(near), 2))

    # hematite stop: the Curiosity waypoint on Vera Rubin Ridge with the strongest CRISM hematite signal
    hs = ndi.uniform_filter(np.nan_to_num(hema), 5)  # ~30 m average
    cands = []
    for w in traverse:
        if 1809 <= w[0] <= 2300 and PW < w[1] < PE and PS < w[2] < PN:
            r, c = play_px(w[1], w[2], 6)
            cands.append((hs[r, c], w))
    hmax = max(c[0] for c in cands)
    strong = [c for c in cands if c[0] >= 0.75 * hmax]
    hv, w = min(strong, key=lambda c: math.hypot(c[1][1] - be, c[1][2] - bn))
    add("stop_vera_rubin_ridge", "Vera Rubin Ridge (hematite)", "stop", w[1], w[2],
        f"Curiosity waypoint on the ridge (sol {w[0]}) nearest to base among those with a strong CRISM "
        f"BD860_2 hematite signal (>= 75% of the strongest on Curiosity's ridge path)",
        note="Main goal. MRO CRISM saw hematite here from orbit (Fraeman et al. 2013); Curiosity confirmed it "
             "on the ground in 2017-2019 (drill samples Stoer, Highfield, Rock Hall).", curiositySol=w[0])

    e, n = wp(1700)[1:3]
    add("forward_camp", "Forward camp (option)", "camp", e, n, "Curiosity waypoint, sol 1700",
        note="Optional rover park between the dunes and the ridge, to shorten the walk to the hematite stop.",
        curiositySol=1700)

    # ------------------------------------------------------------------ landmarks from the elevation model
    with rasterio.open(DEM_WINDOW) as ds:
        z1 = ds.read(1).astype(np.float64)
    z2 = z1.reshape(z1.shape[0] // 2, 2, z1.shape[1] // 2, 2).mean(axis=(1, 3))
    EN2 = lambda r, c: (FW + (c + 0.5) * 2, FN - (r + 0.5) * 2)
    prom = z2 - ndi.grey_opening(z2, size=(61, 61))  # height above the local floor (120 m window)
    lab, cnt = ndi.label(prom > 7)
    buttes = []
    for i in range(1, cnt + 1):
        m = lab == i
        area = m.sum() * 4
        if not 400 <= area <= 40000:
            continue
        r, c = np.unravel_index(np.argmax(np.where(m, prom, -1)), prom.shape)
        e, n = EN2(r, c)
        if 8141150 < e < 8142150 and -278450 < n < -277750:   # the Murray Buttes cluster
            buttes.append((float(prom[r, c]), e, n, int(area)))
    buttes.sort(reverse=True)
    picked = []
    for p, e, n, area in buttes:
        if all(math.hypot(e - q[1], n - q[2]) > 150 for q in picked):
            picked.append((p, e, n, area))
        if len(picked) == 4:
            break
    picked.sort(key=lambda b: -b[2])  # north to south
    for i, (p, e, n, area) in enumerate(picked, 1):
        add(f"butte_{i}", f"Murray Butte {i}", "landmark", e, n,
            "summit of a mesa found in the HiRISE elevation model (height above local floor > 7 m)",
            heightAboveSurroundings=round(p, 1), footprintM2=area)

    # other distinct knobs and mesas across the play area (navigation landmarks near the route)
    others = []
    for i in range(1, cnt + 1):
        m = lab == i
        area = m.sum() * 4
        if not 300 <= area <= 60000:
            continue
        r, c = np.unravel_index(np.argmax(np.where(m, prom, -1)), prom.shape)
        e, n = EN2(r, c)
        if PW + 80 < e < PE - 80 and PS + 80 < n < PN - 80 and n < -278450 and prom[r, c] > 9:
            others.append((float(prom[r, c]), e, n, int(area)))
    others.sort(reverse=True)
    knobs = []
    for p, e, n, area in others:
        if all(math.hypot(e - q[1], n - q[2]) > 350 for q in knobs):
            knobs.append((p, e, n, area))
        if len(knobs) == 7:
            break
    knobs.sort(key=lambda b: (-b[2], b[1]))
    for i, (p, e, n, area) in enumerate(knobs, 1):
        add(f"knob_{i}", f"Knob {chr(64 + i)}", "landmark", e, n,
            "summit of a distinct knob or mesa found in the HiRISE elevation model (height above local floor > 9 m)",
            heightAboveSurroundings=round(p, 1), footprintM2=area)

    # small outcrops close to the EVA route: nearby landmarks give much sharper position fixes
    # (a bearing error of half a degree is 9 m at 1 km but under 3 m at 300 m)
    prom_s = z2 - ndi.grey_opening(z2, size=(31, 31))  # height above the local floor (60 m window)
    lab_s, cnt_s = ndi.label(prom_s > 3.5)
    fc_ = next(p for p in places if p["id"] == "forward_camp")
    hs_ = next(p for p in places if p["id"] == "stop_vera_rubin_ridge")
    ax, ay, bx, by = fc_["easting"], fc_["northing"], hs_["easting"], hs_["northing"]


    def dist_to_route(e, n):
        t = max(0.0, min(1.0, ((e - ax) * (bx - ax) + (n - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
        return math.hypot(e - (ax + t * (bx - ax)), n - (ay + t * (by - ay)))


    cands = []
    for i in range(1, cnt_s + 1):
        m = lab_s == i
        area = m.sum() * 4
        if not 40 <= area <= 6000:
            continue
        r, c = np.unravel_index(np.argmax(np.where(m, prom_s, -1)), prom_s.shape)
        e, n = EN2(r, c)
        d = dist_to_route(e, n)
        if 60 < d < 420 and all(math.hypot(e - q["easting"], n - q["northing"]) > 140 for q in places):
            cands.append((float(prom_s[r, c]), e, n, int(area)))
    cands.sort(reverse=True)
    outcrops = []
    for p, e, n, area in cands:
        if all(math.hypot(e - q[1], n - q[2]) > 170 for q in outcrops):
            outcrops.append((p, e, n, area))
        if len(outcrops) == 8:
            break
    outcrops.sort(key=lambda b: (b[1], -b[2]))
    for i, (p, e, n, area) in enumerate(outcrops, 1):
        add(f"outcrop_{i}", f"Outcrop {i}", "landmark", e, n,
            "top of a small rock outcrop near the EVA route, found in the HiRISE elevation model (stands > 3.5 m above its surroundings)",
            heightAboveSurroundings=round(p, 1), footprintM2=area)

    # Vera Rubin Ridge crest: highest ground within 250 m of the hematite stop
    hstop = next(p for p in places if p["id"] == "stop_vera_rubin_ridge")
    r0, c0 = int((FN - hstop["northing"]) / 2), int((hstop["easting"] - FW) / 2)
    k = 125
    win = z2[r0 - k:r0 + k, c0 - k:c0 + k]
    r, c = np.unravel_index(np.argmax(win), win.shape)
    e, n = EN2(r0 - k + r, c0 - k + c)
    add("vrr_crest", "Vera Rubin Ridge crest", "landmark", e, n,
        "highest ground within 250 m of the hematite stop (HiRISE elevation model)")

    # Bagnold dune field: centre of the largest dark-sand patch (a hazard, and a look-alike zone)
    lab, cnt = ndi.label(sand)
    sizes = ndi.sum(sand, lab, range(1, cnt + 1))
    big = lab == (1 + int(np.argmax(sizes)))
    dist_in = ndi.distance_transform_edt(big)
    r, c = np.unravel_index(np.argmax(dist_in), dist_in.shape)
    add("bagnold_dunes", "Bagnold Dunes (hazard)", "landmark", PW + (c + 0.5) * 2, PN - (r + 0.5) * 2,
        "point deepest inside the largest dark-sand patch of the orthophoto sand mask",
        areaM2=int(sizes.max() * 4), metresInsideSand=round(float(dist_in[r, c] * 2)))

    # small crater: spotted in the orthophoto (round, dark sand floor) south of the buttes, then
    # confirmed in the elevation model as a bowl (floor lower than the ring of ground around it).
    ce_, cn_ = 8141398.0, -278440.0
    angs = np.linspace(0, 2 * math.pi, 36, endpoint=False)
    rim = {rad: float(np.mean(dem.sample(ce_ + rad * np.cos(angs), cn_ + rad * np.sin(angs)))) for rad in range(20, 101, 10)}
    rim_r = max(rim, key=rim.get)
    depth = rim[rim_r] - float(dem.sample(ce_, cn_)[0])
    assert depth > 3, "crater pick is not a bowl in the elevation model"
    add("crater_south", "Sand-floored crater", "landmark", ce_, cn_,
        "round dark-floored feature in the HiRISE orthophoto, confirmed as a bowl in the elevation model",
        depthM=round(depth, 1), diameterM=2 * rim_r)

elif AREA == "gediz":
    # Mount Sharp foothills, sols ~3150-4550. Sols and names from NASA/JPL mission reports.
    # base: flattest sand-free 30 m pad within 150 m of Curiosity's sol 3154 position, at the low
    # (north) end of the area, below the Greenheugh pediment
    ce, cn = wp_near(3154)[1:3]
    best = None
    for de in range(-150, 151, 10):
        for dn in range(-150, 151, 10):
            e, n = ce + de, cn + dn
            if not (PW + 150 < e < PE - 150 and PS + 150 < n < PN - 150):
                continue
            if disc(sand, e, n, 40, 2).mean() > 0:
                continue
            sl = disc(slope, e, n, 30, 2)
            score = float(np.percentile(sl, 95))
            if best is None or score < best[0]:
                best = (score, e, n)
    _, be, bn = best
    add("base", "Base Camp", "base", be, bn,
        "flattest sand-free 30 m pad within 150 m of Curiosity's sol 3154 position",
        note="Habitat site at the foot of the Greenheugh pediment, on the clay-to-sulfate transition.")

    w = wp_near(3420); e, n = w[1:3]
    add("greenheugh_gatorback", "Greenheugh pediment (gator-back rocks)", "landmark", e, n,
        f"Curiosity waypoint, sol {w[0]}",
        note="Curiosity climbed the pediment in March 2022, met fields of knife-edged, wind-carved "
             "'gator-back' sandstone and turned around to protect its wheels.", curiositySol=w[0])

    w = wp_near(3684); e, n = w[1:3]
    add("stop_marker_band", "Marker Band valley", "stop", e, n, f"Curiosity waypoint, sol {w[0]}",
        note="Rippled rock in the marker band: the clearest evidence of waves in an ancient lake that "
             "Curiosity has found (Mastcam panorama, sol 3684, December 2022).", curiositySol=w[0])

    w = wp_near(3924); e, n = w[1:3]
    add("stop_gediz_ridge", "Gediz Vallis ridge", "stop", e, n, f"Curiosity waypoint, sol {w[0]}",
        note="Ridge of boulders swept down Mount Sharp by floods and debris flows. Curiosity reached it on "
             "its fourth try on sol 3923 (14 August 2023); steep slopes and gator-back rocks had blocked "
             "the earlier attempts.", curiositySol=w[0])

    w = wp_near(4200); e, n = w[1:3]
    add("stop_sulfur_field", "Gediz Vallis channel (sulfur stones)", "stop", e, n, f"Curiosity waypoint, sol {w[0]}",
        note="Main goal. Curiosity's wheel crushed a rock here on sol 4200 (30 May 2024) and revealed yellow "
             "crystals of pure sulfur, never seen on Mars before. Orbiters had missed the field of sulfur stones.",
        curiositySol=w[0])

    w = wp_near(3934); e, n = w[1:3]
    add("forward_camp", "Forward camp (option)", "camp", e, n, f"Curiosity waypoint, sol {w[0]}",
        note="Optional rover park below Gediz Vallis ridge, to shorten the walk to the sulfur stones.",
        curiositySol=w[0])

    # distinct knobs and mesas: navigation landmarks
    with rasterio.open(DEM_WINDOW) as ds:
        z1 = ds.read(1).astype(np.float64)
    z1[z1 < -30000] = np.nan
    z1 = np.where(np.isfinite(z1), z1, np.nanmedian(z1))
    z2 = z1.reshape(z1.shape[0] // 2, 2, z1.shape[1] // 2, 2).mean(axis=(1, 3))
    EN2 = lambda r, c: (FW + (c + 0.5) * 2, FN - (r + 0.5) * 2)
    prom = z2 - ndi.grey_opening(z2, size=(61, 61))
    lab, cnt = ndi.label(prom > 9)
    others = []
    for i in range(1, cnt + 1):
        m = lab == i
        area = m.sum() * 4
        if not 300 <= area <= 60000:
            continue
        r, c = np.unravel_index(np.argmax(np.where(m, prom, -1)), prom.shape)
        e, n = EN2(r, c)
        if PW + 80 < e < PE - 80 and PS + 80 < n < PN - 80:
            others.append((float(prom[r, c]), e, n, int(area)))
    others.sort(reverse=True)
    knobs = []
    for p_, e, n, area in others:
        if all(math.hypot(e - q[1], n - q[2]) > 350 for q in knobs) and                 all(math.hypot(e - q["easting"], n - q["northing"]) > 140 for q in places):
            knobs.append((p_, e, n, area))
        if len(knobs) == 8:
            break
    knobs.sort(key=lambda b: (-b[2], b[1]))
    for i, (p_, e, n, area) in enumerate(knobs, 1):
        add(f"knob_{i}", f"Knob {chr(64 + i)}", "landmark", e, n,
            "summit of a distinct knob or mesa found in the HiRISE elevation model (height above local floor > 9 m)",
            heightAboveSurroundings=round(p_, 1), footprintM2=area)

    # Gediz Vallis ridge crest: highest ground within 250 m of the ridge stop
    rs = next(p for p in places if p["id"] == "stop_gediz_ridge")
    r0, c0 = int((FN - rs["northing"]) / 2), int((rs["easting"] - FW) / 2)
    k = 125
    win = z2[r0 - k:r0 + k, c0 - k:c0 + k]
    r, c = np.unravel_index(np.argmax(win), win.shape)
    e, n = EN2(r0 - k + r, c0 - k + c)
    add("gediz_ridge_crest", "Gediz Vallis ridge crest", "landmark", e, n,
        "highest ground within 250 m of the ridge stop (HiRISE elevation model)")


# ------------------------------------------------------------------ backdrop from MOLA
fz = far.z
rows, cols = np.indices(fz.shape)
fe = far.w + (cols + 0.5) * far.res
fn = far.n - (rows + 0.5) * far.res
mound_e = math.radians(137.85) * MARS_RADIUS_M
mound_n = math.radians(-5.08) * MARS_RADIUS_M
m = np.hypot(fe - mound_e, fn - mound_n) < 30000
i = np.argmax(np.where(m, fz, -1e9))
add("mount_sharp_summit", "Mount Sharp (Aeolis Mons) summit", "backdrop", float(fe.flat[i]), float(fn.flat[i]),
    "highest MOLA point within 30 km of the centre of the mound")
# northern rim: highest MOLA point 20-70 km from base within 35 degrees of north
bear = np.degrees(np.arctan2(fe - be, fn - bn))
dist = np.hypot(fe - be, fn - bn)
ang = (fz - (dist ** 2) / (2 * MARS_RADIUS_M) - (float(elev(be, bn)[0]) + EYE)) / np.maximum(dist, 1)
m = ((np.abs(bear) < 60) & (dist > 20000) & (dist < 80000))
i = np.argmax(np.where(m, ang, -1e9))
add("crater_rim_north", "Gale crater rim (north)", "backdrop", float(fe.flat[i]), float(fn.flat[i]),
    "MOLA point on the northern rim with the highest elevation angle seen from the base",
    elevationAngleDeg=round(math.degrees(math.atan(float(ang.flat[i]))), 2))
# what the player actually sees of Mount Sharp from the base: the highest-looking point of the mound
m = (np.hypot(fe - mound_e, fn - mound_n) < 45000) & (dist > 3000)
i = np.argmax(np.where(m, ang, -1e9))
add("mount_sharp_skyline", "Mount Sharp skyline (as seen from base)", "backdrop", float(fe.flat[i]), float(fn.flat[i]),
    "MOLA point on the mound with the highest elevation angle seen from the base",
    elevationAngleDeg=round(math.degrees(math.atan(float(ang.flat[i]))), 2))

# ------------------------------------------------------------------ checks
base = places[0]
print(f"{'place':34s} {'E':>9s} {'N':>9s} {'elev':>7s} {'dist':>7s} {'brg':>4s} {'slope':>5s} {'sand':>4s} {'hem':>4s}  seen from base")
for p in places:
    e, n = p["easting"], p["northing"]
    d = math.hypot(e - base["easting"], n - base["northing"])
    chk = dict(distanceFromBaseM=round(d), bearingFromBaseDeg=round(math.degrees(math.atan2(e - base["easting"], n - base["northing"])) % 360))
    inplay = PW < e < PE and PS < n < PN
    if inplay:
        chk["slopeDegMean30m"] = round(float(disc(slope, e, n, 30, 2).mean()), 1)
        chk["sandFraction20m"] = round(float(disc(sand, e, n, 20, 2).mean()), 2)
        h = disc(hema, e, n, 30, 6)
        chk["crismHematiteIndex"] = None if np.isnan(h).all() else round(float(np.nanmean(h)), 2)
    if p["id"] != "base":
        th = {"stop": EYE, "camp": EYE, "landmark": 1.0}.get(p["kind"], 0.0)
        ok, clear, at = visible(base["easting"], base["northing"], e, n, th)
        chk["targetHeightM"] = th
        chk["visibleFromBase"] = ok
        chk["sightLineClearanceM"] = round(clear, 1)
        if not ok:
            chk["blockedAtM"] = round(at)
    p["checks"] = chk
    print(f"{p['id']:34s} {e:9.0f} {n:9.0f} {p['elevation']:7.0f} {chk['distanceFromBaseM']:7d} {chk['bearingFromBaseDeg']:4d} "
          f"{str(chk.get('slopeDegMean30m', '-')):>5s} {str(chk.get('sandFraction20m', '-')):>4s} {str(chk.get('crismHematiteIndex', '-')):>4s}  "
          f"{chk.get('visibleFromBase', '')} {chk.get('sightLineClearanceM', '')} {('blocked at %d m' % chk['blockedAtM']) if 'blockedAtM' in chk else ''}")

def path_between(sol_a, sol_b):
    return [(w[1], w[2]) for w in traverse if sol_a <= w[0] <= sol_b]


def length(pts):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))


def simplify(pts, tol=6.0):
    out = [pts[0]]
    for p in pts[1:]:
        if math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) >= tol:
            out.append(p)
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


# ------------------------------------------------------------------ EVA route
if AREA == "buttes":
    # follow Curiosity's own path
    stops = {p["id"]: p for p in places}
    s_h = stops["stop_vera_rubin_ridge"]["curiositySol"]
    # Curiosity wandered on the ridge; walk its path only up to where it first reached the ridge (sol 1814),
    # then go straight to the hematite stop.
    end = (stops["stop_vera_rubin_ridge"]["easting"], stops["stop_vera_rubin_ridge"]["northing"])
    full = [(base["easting"], base["northing"])] + path_between(1405, min(s_h, 1814)) + [end]
    full = simplify(full)
    prof = elev(np.array([p[0] for p in full]), np.array([p[1] for p in full]))
    climb = float(np.clip(np.diff(prof), 0, None).sum())
    straight = math.hypot(full[-1][0] - full[0][0], full[-1][1] - full[0][1])
    fc = stops["forward_camp"]
    short = simplify([(fc["easting"], fc["northing"])] + path_between(1700, min(s_h, 1814)) + [full[-1]])
    routes = [
        dict(id="eva1_from_base", description="Base Camp to the hematite stop along Curiosity's proven path",
             points=[[round(a, 1), round(b, 1)] for a, b in full], lengthM=round(length(full)),
             straightLineM=round(straight), totalClimbM=round(climb)),
        dict(id="eva1_from_forward_camp", description="Forward camp to the hematite stop (short option)",
             points=[[round(a, 1), round(b, 1)] for a, b in short], lengthM=round(length(short)),
             straightLineM=round(math.hypot(short[-1][0] - short[0][0], short[-1][1] - short[0][1]))),
    ]
elif AREA == "gediz":
    stops = {p["id"]: p for p in places}
    end = (stops["stop_sulfur_field"]["easting"], stops["stop_sulfur_field"]["northing"])
    full = simplify([(base["easting"], base["northing"])] + path_between(3154, 4200) + [end])
    prof = elev(np.array([p[0] for p in full]), np.array([p[1] for p in full]))
    climb = float(np.clip(np.diff(prof), 0, None).sum())
    fc = stops["forward_camp"]
    short = simplify([(fc["easting"], fc["northing"])] + path_between(3934, 4200) + [end])
    routes = [
        dict(id="eva1_from_base", description="Base Camp to the sulfur stones along Curiosity's proven path",
             points=[[round(a, 1), round(b, 1)] for a, b in full], lengthM=round(length(full)),
             straightLineM=round(math.hypot(end[0] - full[0][0], end[1] - full[0][1])), totalClimbM=round(climb)),
        dict(id="eva1_from_forward_camp", description="Forward camp to the sulfur stones (short option)",
             points=[[round(a, 1), round(b, 1)] for a, b in short], lengthM=round(length(short)),
             straightLineM=round(math.hypot(end[0] - short[0][0], end[1] - short[0][1]))),
    ]
    walk = dict(
        camp="forward_camp", stop="stop_sulfur_field", route="eva1_from_forward_camp",
        title="EVA-1: The Sulfur Stones",
        brief=f"Walk {round(routes[1]['lengthM'], -1):.0f} m from the rover up Gediz Vallis channel and collect a sample "
              "of the sulfur stones. Curiosity found pure sulfur here in 2024 by crushing a rock with its wheel; "
              "orbiters had missed it.",
        objective="EVA-1 · Collect sulfur in Gediz Vallis channel",
        secured="Sulfur sample secured: pure sulfur, never seen on Mars before Curiosity.")

for r in routes:
    print(f"route {r['id']}: {r['lengthM']} m along the path, {r['straightLineM']} m straight"
          + (f", {r['totalClimbM']} m of climbing" if "totalClimbM" in r else ""))

out = dict(frame="Mars equirectangular metres (see meta.json)", eyeHeightM=EYE, places=places, route=routes)
if AREA != "buttes":
    out["walk"] = walk
(PUBLIC_DATA / "positions.json").write_text(json.dumps(out, indent=1))
print(f"wrote public/data/{AREA}/positions.json")
