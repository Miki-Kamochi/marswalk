"""Turn data/raw/ into small web-ready files in public/data/. Repeatable; overwrites outputs.

Usage:  .venv/Scripts/python scripts/process_data.py [step ...]

Outputs (all in the map frame described in config.py; grids are row 0 = north):
  meta.json                       frame, origin, description of every file below
  terrain/play_2m.u16             play-area elevation, 2 m posts, uint16 (0 = no data)
  terrain/surround_8m.u16         wider window around the play area, 8 m posts
  terrain/mid_60m.u16             whole MSL Gale DEM mosaic, 60 m posts (lower Mount Sharp)
  terrain/far_463m.u16            MOLA over all of Gale crater (rim + Mount Sharp summit)
  imagery/color_2m.jpg            colourised HiRISE orthophoto, same grid as play_2m
  imagery/ortho_1m.jpg            grey HiRISE orthophoto, 1 m (for the 2D map)
  imagery/surround_4m.jpg         colourised orthophoto of the wider window
  layers/slope.png  slope_raw.png slope overlay (RGBA) + raw slope (value = degrees * 2)
  layers/hematite.png  ..._raw.png  CRISM BD860_2 overlay + raw
  layers/mafic.png  hydration.png   CRISM olivine/pyroxene sand and hydrated-mineral overlays
  layers/sand.png  sand_raw.png   dark-sand hazard mask derived from the orthophoto
  traverse.json                   Curiosity's waypoints
  weather.json                    REMS per-sol weather
"""
import json
import math
import sys

import numpy as np
import rasterio
from PIL import Image
from scipy import ndimage as ndi
from scipy.signal import correlate

from config import *

Image.MAX_IMAGE_PIXELS = None
OUT = PUBLIC_DATA
META_PATH = OUT / "meta.json"

PW, PS, PE, PN = PLAY_BOUNDS
FW, FS, FE, FN = FETCH_BOUNDS
PLAY_CELL = 2


# ----------------------------------------------------------------------------- helpers
def load_meta():
    return json.loads(META_PATH.read_text()) if META_PATH.exists() else {}


def update_meta(section, key, value):
    meta = load_meta()
    meta.setdefault(section, {})[key] = value
    META_PATH.parent.mkdir(parents=True, exist_ok=True)
    META_PATH.write_text(json.dumps(meta, indent=1))


def out_path(rel):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def report(rel):
    print(f"  wrote public/data/{AREA}/{rel} ({(OUT / rel).stat().st_size/1e3:.0f} kB)")


def read_tif(path):
    with rasterio.open(path) as ds:
        a = ds.read(1)
        return a, ds.bounds, ds.nodata, ds.transform.a


def block_mean(a, f, nodata=None):
    """Mean-pool by integer factor f (crops the remainder). NaN where a block is all nodata."""
    h, w = (a.shape[0] // f) * f, (a.shape[1] // f) * f
    b = a[:h, :w].astype(np.float64)
    if nodata is not None:
        b[b == nodata] = np.nan
    b = b.reshape(h // f, f, w // f, f)
    with np.errstate(invalid="ignore"):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return np.nanmean(b, axis=(1, 3))


def write_grid(rel, z, west, north, cell, source):
    """z: float array (NaN = nodata). (west, north) is the position of sample [0][0]."""
    valid = np.isfinite(z)
    zmin, zmax = float(z[valid].min()), float(z[valid].max())
    scale = (zmax - zmin) / 65534.0
    q = np.zeros(z.shape, np.uint16)
    q[valid] = np.round((z[valid] - zmin) / scale).astype(np.uint16) + 1
    q.astype("<u2").tofile(out_path(rel))
    name = rel.split("/")[-1].split("_")[0]
    update_meta("grids", name, dict(
        file=rel, width=int(z.shape[1]), height=int(z.shape[0]), cell=cell,
        west=west, north=north, zMin=zmin, zScale=scale, nodata=0, source=source,
        encoding="uint16 little-endian, row 0 = north; elevation = zMin + (v - 1) * zScale"))
    report(rel)
    print(f"    {z.shape[1]}x{z.shape[0]} @ {cell} m, elevation {zmin:.1f} .. {zmax:.1f} m, "
          f"valid {valid.mean()*100:.1f}%")


def crop(a, bounds, res, sub):
    """Crop array with (w,s,e,n)=bounds at res m/px to sub bounds."""
    w, s, e, n = bounds
    sw, ss, se, sn = sub
    r0, r1 = int(round((n - sn) / res)), int(round((n - ss) / res))
    c0, c1 = int(round((sw - w) / res)), int(round((se - w) / res))
    return a[r0:r1, c0:c1]


def ramp(v, stops):
    """Map v in 0..1 to RGB through colour stops [(t, (r,g,b)), ...]."""
    ts = np.array([s[0] for s in stops])
    cols = np.array([s[1] for s in stops], float)
    return np.stack([np.interp(v, ts, cols[:, k]) for k in range(3)], -1)


def save_overlay(rel, value01, alpha01, stops, layer, info):
    rgb = ramp(np.clip(value01, 0, 1), stops)
    rgba = np.dstack([rgb, np.clip(alpha01, 0, 1) * 255]).round().astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(out_path(rel), optimize=True)
    report(rel)
    update_meta("layers", layer, dict(file=rel, bounds=dict(west=PW, south=PS, east=PE, north=PN), **info))


# ----------------------------------------------------------------------------- terrain
def load_play_dem():
    dem, b, nd, res = read_tif(DEM_WINDOW)
    return crop(dem, FETCH_BOUNDS, 1.0, PLAY_BOUNDS).astype(np.float64)


def terrain():
    print("terrain")
    src = "MSL Gale Merged DEM 1 m v3 (USGS; MRO HiRISE stereo)"
    dem, b, nd, res = read_tif(DEM_WINDOW)
    play = block_mean(crop(dem, FETCH_BOUNDS, 1.0, PLAY_BOUNDS), PLAY_CELL, nd)
    write_grid("terrain/play_2m.u16", play, PW + PLAY_CELL / 2, PN - PLAY_CELL / 2, PLAY_CELL, src)
    sur = block_mean(dem, 8, nd)
    write_grid("terrain/surround_8m.u16", sur, FW + 4, FN - 4, 8, src)

    mid, mb, mnd, mres = read_tif(RAW / "gale_mosaic" / f"gale_dem_{MID_DECIMATE}m_full.tif")
    mid[mid < -30000] = mnd
    m60 = block_mean(mid, 3, mnd)
    write_grid("terrain/mid_60m.u16", m60, mb.left + 1.5 * mres, mb.top - 1.5 * mres, 3 * mres,
               "MSL Gale Merged DEM 1 m v3 (USGS; MRO HiRISE/CTX + MEX HRSC), decimated")

    far, fb, fnd, fres = read_tif(RAW / "mola" / "mola_463m_gale.tif")
    write_grid("terrain/far_463m.u16", far.astype(np.float64), fb.left + fres / 2, fb.top - fres / 2, fres,
               "MGS MOLA MEGDR 463 m global DEM (USGS mosaic)")

    cz = float(np.nanmedian(play))
    update_meta("frame", "projection", "Mars equirectangular, sphere R=3396190 m, lat_0=0, lon_0=0 (IAU 2000)")
    update_meta("frame", "radius", MARS_RADIUS_M)
    update_meta("frame", "play", dict(west=PW, south=PS, east=PE, north=PN))
    update_meta("frame", "fetch", dict(west=FW, south=FS, east=FE, north=FN))
    update_meta("frame", "origin", dict(easting=(PW + PE) / 2, northing=(PS + PN) / 2, elevation=round(cz, 1),
                                        note="suggested local origin: x = E - easting, z = -(N - northing), y = elev - elevation"))


# ----------------------------------------------------------------------------- imagery
def hirise_irb_window(bounds, pad=300):
    """HiRISE colour strip resampled (nearest) onto a 1 m grid covering bounds (+pad)."""
    w, s, e, n = bounds
    w, s, e, n = w - pad, s - pad, e + pad, n + pad
    H = HIRISE
    x0 = math.radians(H["center_lon"]) * MARS_RADIUS_M
    es = np.arange(w + 0.5, e, 1.0)
    ns = np.arange(n - 0.5, s, -1.0)
    cols = np.floor((es - x0) / H["scale"] + H["sample_offset"]).astype(int)
    rows = np.floor(H["line_offset"] * -1 * 0 + (-ns / H["scale"]) + H["line_offset"]).astype(int)
    with rasterio.open(RAW / "hirise" / HIRISE_ORTHO_IRB) as ds:
        win = rasterio.windows.Window(cols.min(), rows.min(), cols.max() - cols.min() + 1, rows.max() - rows.min() + 1)
        a = ds.read(window=win)  # (3, h, w): IR, RED, BG
    return a[:, rows - rows.min()][:, :, cols - cols.min()], pad


def color_lut():
    """256-entry grey -> RGB table: the real HiRISE colour (red and blue-green filters) that
    goes with each brightness of the grey mosaic, measured where the two overlap."""
    gray, b, nd, res = read_tif(RAW / "gale_mosaic" / "gale_ortho_1m_colorcal.tif")
    irb, pad = hirise_irb_window(COLOR_CAL_BOUNDS)
    red = irb[1].astype(np.float64)
    h, w = gray.shape

    def best_shift(big, small):
        """Offset (row, col) of `small` inside `big` that maximises zero-mean correlation."""
        cc = correlate(big - big.mean(), small - small.mean(), mode="valid", method="fft")
        return np.unravel_index(np.argmax(cc), cc.shape)

    # register the HiRISE red band to the mosaic: coarse at 4 m, then refine at 1 m
    f = 4
    cy, cx = best_shift(block_mean(red, f), block_mean(gray.astype(np.float64), f))
    cy, cx = cy * f, cx * f
    m = 8  # refine within +-8 m using a central 500 m patch
    y0, x0 = h // 2 - 250, w // 2 - 250
    patch = gray[y0:y0 + 500, x0:x0 + 500].astype(np.float64)
    big = red[cy + y0 - m:cy + y0 + 500 + m, cx + x0 - m:cx + x0 + 500 + m]
    ry, rx = best_shift(big, patch)
    dy, dx = int(cy + ry - m), int(cx + rx - m)
    print(f"    HiRISE colour strip vs mosaic offset: {dx-pad:+d} m east, {pad-dy:+d} m north")
    sub = irb[:, dy:dy + h, dx:dx + w].astype(np.float64)
    valid = (sub.min(axis=0) > 0)
    print(f"    colour calibration pixels: {int(valid.sum())} ({valid.mean()*100:.0f}% of window)")
    gv = gray[valid]
    corr = np.corrcoef(gv, sub[1][valid])[0, 1]
    print(f"    grey vs HiRISE red correlation after registration: {corr:.3f}")
    lut = np.zeros((256, 3))
    cnt = np.bincount(gv, minlength=256).astype(np.float64)
    for k, band in enumerate((1, 2)):  # RED, BG
        lut[:, k] = np.bincount(gv, weights=sub[band][valid], minlength=256) / np.maximum(cnt, 1)
    have = cnt > 200
    idx = np.arange(256)
    for k in range(2):
        lut[:, k] = np.interp(idx, idx[have], lut[have, k])
        lut[:, k] = ndi.gaussian_filter1d(lut[:, k], 4, mode="nearest")
    red_l, bg_l = lut[:, 0].copy(), lut[:, 1].copy()
    # blue-green / red ratio is the real colour signal (dark basalt sand is bluer than dust)
    ratio = bg_l / np.maximum(red_l, 1)
    ratio = ratio / np.median(ratio[have])
    lum = idx / 255.0
    # approximate natural colour: Mars dust tint, shifted toward grey-blue where BG/RED is high
    dust = np.array([1.00, 0.70, 0.47])
    basalt = np.array([0.62, 0.60, 0.62])
    t = np.clip((ratio - 0.95) / 0.35, 0, 1)[:, None]
    tint = dust * (1 - t) + basalt * t
    stretch = np.clip((lum - 0.04) / 0.72, 0, 1) ** 0.85
    out = np.clip(stretch[:, None] * tint * 1.25, 0, 1)
    return (out * 255).round().astype(np.uint8), dict(dx=int(dx - pad), dy=int(pad - dy), corr=float(corr))


def imagery():
    print("imagery")
    gray, b, nd, res = read_tif(ORTHO_WINDOW)
    lut, cal = color_lut()
    np.save(INTERIM / "color_lut.npy", lut) if INTERIM.exists() else None
    play = crop(gray, FETCH_BOUNDS, 1.0, PLAY_BOUNDS)
    bounds = dict(west=PW, south=PS, east=PE, north=PN)
    src = "MSL Gale Orthophoto Mosaic 25 cm v3 (USGS; MRO HiRISE)"

    Image.fromarray(play, "L").save(out_path("imagery/ortho_1m.jpg"), quality=82, optimize=True)
    report("imagery/ortho_1m.jpg")
    update_meta("images", "ortho", dict(file="imagery/ortho_1m.jpg", bounds=bounds, metersPerPixel=1, source=src))

    p2 = block_mean(play, 2).round().astype(np.uint8)
    Image.fromarray(lut[p2], "RGB").save(out_path("imagery/color_2m.jpg"), quality=85, optimize=True)
    report("imagery/color_2m.jpg")
    update_meta("images", "color", dict(
        file="imagery/color_2m.jpg", bounds=bounds, metersPerPixel=2, source=src,
        colour="brightness from the HiRISE mosaic; hue from the HiRISE blue-green/red filter ratio "
               "(PSP_009650_1755 colour strip) per brightness level - approximate natural colour",
        calibration=cal))

    s4 = block_mean(gray, 4).round().astype(np.uint8)
    Image.fromarray(lut[s4], "RGB").save(out_path("imagery/surround_4m.jpg"), quality=80, optimize=True)
    report("imagery/surround_4m.jpg")
    update_meta("images", "surround", dict(file="imagery/surround_4m.jpg", metersPerPixel=4, source=src,
                                           bounds=dict(west=FW, south=FS, east=FE, north=FN)))


# ----------------------------------------------------------------------------- layers
CRISM_BANDS = ["R770", "RBR", "BD530_2", "SH600_2", "SH770", "BD640_2", "BD860_2", "BD920_2", "RPEAK1",
               "BDI1000VIS", "R440", "IRR1", "BDI1000IR", "OLINDEX3", "R1330", "BD1300", "LCPINDEX2",
               "HCPINDEX2", "VAR", "ISLOPE1", "BD1400", "BD1435", "BD1500_2", "ICER1_2", "BD1750_2",
               "BD1900_2", "BD1900R2", "BDI2000", "BD2100_2", "BD2165", "BD2190", "MIN2200", "BD2210_2",
               "D2200", "BD2230", "BD2250", "MIN2250", "BD2265", "BD2290", "D2300"]
CRISM_GEO = dict(samples=775, lines=714, bands=60, scale=18.0,
                 line_offset=-15454.8311111, sample_offset=-452137.2)


def crism_band(name, cell=6):
    """One CRISM summary parameter, bilinearly resampled onto the play area at `cell` m."""
    G = CRISM_GEO
    mm = np.memmap(RAW / "crism" / f"{CRISM_SR}.img", dtype="<f4", mode="r",
                   shape=(G["bands"], G["lines"], G["samples"]))
    a = np.array(mm[CRISM_BANDS.index(name)], dtype=np.float64)
    a[a > 60000] = np.nan
    # drop the outer 3 pixels of the observation: the swath edge is noisy
    a[~ndi.binary_erosion(np.isfinite(a), iterations=3)] = np.nan
    es = np.arange(PW + cell / 2, PE, cell)
    ns = np.arange(PN - cell / 2, PS, -cell)
    cx = es / G["scale"] + G["sample_offset"] - 0.5
    cy = -ns / G["scale"] + G["line_offset"] - 0.5
    X, Y = np.meshgrid(cx, cy)
    filled = np.where(np.isfinite(a), a, 0.0)
    wgt = np.isfinite(a).astype(np.float64)
    num = ndi.map_coordinates(filled, [Y, X], order=1, mode="constant", cval=0.0)
    den = ndi.map_coordinates(wgt, [Y, X], order=1, mode="constant", cval=0.0)
    return np.where(den > 0.99, num / np.maximum(den, 1e-9), np.nan)


def layers():
    print("layers")
    dem = block_mean(load_play_dem(), PLAY_CELL)
    # slope over a ~6 m baseline (roughly a few strides), in degrees
    sm = ndi.gaussian_filter(dem, 1.0)
    gy, gx = np.gradient(sm, PLAY_CELL)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    np.save(INTERIM / "slope.npy", slope.astype(np.float32))
    Image.fromarray(np.clip(slope * 2, 0, 255).round().astype(np.uint8), "L").save(out_path("layers/slope_raw.png"), optimize=True)
    report("layers/slope_raw.png")
    stops = [(0, (40, 160, 90)), (10 / 45, (170, 200, 60)), (15 / 45, (245, 210, 50)),
             (25 / 45, (240, 120, 30)), (35 / 45, (210, 30, 30)), (1, (120, 0, 60))]
    s4 = np.round(block_mean(slope, 2))
    save_overlay("layers/slope.png", s4 / 45, np.full(s4.shape, 0.85), stops, "slope", dict(
        raw="layers/slope_raw.png", rawEncoding="value = slope degrees * 2", legend=[0, 10, 15, 25, 35, 45],
        legendUnit="deg", source="derived from MSL Gale Merged DEM 1 m (MRO HiRISE), 2 m posts, ~6 m baseline"))
    pct = np.percentile(slope, [50, 90, 99])
    print(f"    slope median {pct[0]:.1f}, p90 {pct[1]:.1f}, p99 {pct[2]:.1f} deg; "
          f">25 deg: {(slope > 25).mean()*100:.1f}% of area")

    crism_src = "MRO CRISM MTRDR FRT0000B6F1 refined summary parameters, 18 m/px (PDS Geosciences Node)"
    specs = [
        ("hematite", "BD860_2", "0.86 um band depth - crystalline ferric oxide (hematite)",
         [(0, (255, 235, 150)), (0.5, (235, 90, 40)), (1, (150, 0, 30))]),
        ("mafic", "OLINDEX3", "olivine index - dark basaltic sand (Bagnold Dunes)",
         [(0, (190, 230, 160)), (0.5, (60, 170, 110)), (1, (0, 90, 90))]),
        ("hydration", "BD1900_2", "1.9 um band depth - water-bearing minerals",
         [(0, (190, 220, 255)), (0.5, (70, 130, 235)), (1, (30, 30, 150))]),
    ]
    if not HAS_CRISM:
        print("    no CRISM observation over this area: mineral layers skipped")
    for layer, band, desc, stops in (specs if HAS_CRISM else []):
        v = crism_band(band)
        fin = np.isfinite(v)
        vs = ndi.median_filter(np.where(fin, v, 0), 3)
        lo, hi = np.percentile(v[fin], [70, 99.5])
        t = np.clip((vs - lo) / (hi - lo), 0, 1)
        t[~fin] = 0
        raw = np.where(fin, np.clip(t * 254, 0, 254) + 1, 0).round().astype(np.uint8)
        Image.fromarray(raw, "L").save(out_path(f"layers/{layer}_raw.png"), optimize=True)
        save_overlay(f"layers/{layer}.png", t, np.where(fin, np.clip(t * 1.6, 0, 0.9), 0), stops, layer, dict(
            raw=f"layers/{layer}_raw.png", parameter=band, description=desc, source=crism_src,
            rawEncoding=f"0 = no CRISM coverage; 1..255 = linear {lo:.4f} .. {hi:.4f}",
            valueRange=[float(lo), float(hi)], coverage=float(fin.mean())))
        np.save(INTERIM / f"crism_{layer}.npy", np.where(fin, t, np.nan).astype(np.float32))
        print(f"    {band}: coverage {fin.mean()*100:.0f}% of play area, p70 {lo:.4f}, p99.5 {hi:.4f}")

    # dark sand hazard: low albedo + smooth, from the orthophoto
    gray, b, nd, res = read_tif(ORTHO_WINDOW)
    g = block_mean(crop(gray, FETCH_BOUNDS, 1.0, PLAY_BOUNDS), 2)
    gs = ndi.gaussian_filter(g, 3)
    thr = float(np.percentile(gs, 50)) * 0.72
    sand = ndi.binary_opening(gs < thr, iterations=3)
    sand = ndi.binary_closing(sand, iterations=4)
    lab, n = ndi.label(sand)
    sizes = ndi.sum(sand, lab, range(1, n + 1))
    sand = np.isin(lab, 1 + np.flatnonzero(sizes * PLAY_CELL ** 2 > 2500))  # keep patches > 2500 m2
    np.save(INTERIM / "sand.npy", sand)
    Image.fromarray((sand * 255).astype(np.uint8), "L").save(out_path("layers/sand_raw.png"), optimize=True)
    save_overlay("layers/sand.png", sand.astype(float), sand * 0.6, [(0, (0, 0, 0)), (1, (70, 60, 160))], "sand", dict(
        raw="layers/sand_raw.png", rawEncoding="255 = dark sand", description="dark sand / dune hazard mask",
        source="derived from HiRISE orthophoto brightness (dark, smooth patches > 2500 m2)"))
    print(f"    sand mask: {sand.mean()*100:.1f}% of play area, brightness threshold {thr:.0f}")


# ----------------------------------------------------------------------------- vectors
def traverse():
    print("traverse")
    d = json.loads((RAW / "msl_traverse" / "MSL_waypoints.json").read_text(encoding="utf8"))
    pts = []
    for f in d["features"]:
        p = f["properties"]
        pts.append([int(p["sol"]), round(p["easting"], 1), round(p["northing"], 1), round(p["elev_geoid"], 1),
                    round(p["dist_total_m"])])
    pts.sort(key=lambda r: (r[0], r[4]))
    inside = [r for r in pts if PW <= r[1] <= PE and PS <= r[2] <= PN]
    out = dict(source="MSL Curiosity localized waypoints (JPL / mars.nasa.gov MMGIS)",
               fields=["sol", "easting", "northing", "elevation", "odometry_m"],
               playAreaSols=[inside[0][0], inside[-1][0]], waypoints=pts)
    out_path("traverse.json").write_text(json.dumps(out, separators=(",", ":")))
    report("traverse.json")
    print(f"    {len(pts)} waypoints, sols {pts[0][0]}-{pts[-1][0]}; {len(inside)} inside play area "
          f"(sols {inside[0][0]}-{inside[-1][0]})")


def weather():
    print("weather")
    d = json.loads((RAW / "rems" / "rems_weather.json").read_text(encoding="utf8"))

    def num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    rows = []
    for s in d["soles"]:
        rows.append([int(s["sol"]), s["terrestrial_date"], num(s["ls"]), num(s["min_temp"]), num(s["max_temp"]),
                     num(s["min_gts_temp"]), num(s["max_gts_temp"]), num(s["pressure"]),
                     s["sunrise"], s["sunset"], s["local_uv_irradiance_index"], s["atmo_opacity"]])
    rows.sort(key=lambda r: r[0])
    tr = json.loads((OUT / "traverse.json").read_text())["playAreaSols"]
    sel = [r for r in rows if tr[0] <= r[0] <= tr[1]]

    def stat(i):
        v = [r[i] for r in sel if r[i] is not None]
        return dict(min=min(v), max=max(v), mean=round(sum(v) / len(v), 1)) if v else None

    out = dict(source="MSL REMS (Centro de Astrobiologia CSIC-INTA / NASA JPL), mars.nasa.gov weather feed",
               fields=["sol", "earth_date", "ls", "air_min_c", "air_max_c", "ground_min_c", "ground_max_c",
                       "pressure_pa", "sunrise", "sunset", "uv_index", "opacity"],
               playAreaSummary=dict(sols=tr, airMin=stat(3), airMax=stat(4), groundMin=stat(5),
                                    groundMax=stat(6), pressure=stat(7)),
               sols=rows)
    out_path("weather.json").write_text(json.dumps(out, separators=(",", ":")))
    report("weather.json")
    print(f"    {len(rows)} sols ({rows[0][0]}-{rows[-1][0]}); while Curiosity was in the play area "
          f"(sols {tr[0]}-{tr[1]}): air {stat(3)['mean']} .. {stat(4)['mean']} C mean min/max, "
          f"pressure {stat(7)['mean']} Pa")


STEPS = dict(terrain=terrain, imagery=imagery, layers=layers, traverse=traverse, weather=weather)

if __name__ == "__main__":
    INTERIM.mkdir(parents=True, exist_ok=True)
    for name in (sys.argv[1:] or STEPS):
        STEPS[name]()
    print("done")
