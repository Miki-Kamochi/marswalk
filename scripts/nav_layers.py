"""Planner grid for the route simulator: per-cell terrain measures on a 6 m grid.

Usage:  .venv/Scripts/python scripts/nav_layers.py [--preview DIR]

Writes public/data/nav/nav_6m.bin (uint8 channels, row 0 = north) and records it in meta.json.

Safety measures follow the structure of JPL's GESTALT rover hazard check (Goldberg, Maimone &
Matthies 2002): fit a plane to the elevation samples of each patch, then
  tilt      = slope of that plane,
  roughness = RMS distance of the samples from the plane,
  step      = largest height difference between neighbouring samples after removing the plane.
The thresholds that turn these into safe / caution / no-go for a walking astronaut live in the
browser code (src/plan/config.ts), so they are explained and changed in one place.

Localizability predicts whether matching a ground photo to the orbital image would work at a
cell (the principle of Perseverance's Mars Global Localization). The orbital image around the
cell is slid over its own surroundings. A place is easy to localize when
  - the patch has texture (contrast well above the assumed image noise), and
  - no other spot within the search radius looks like it.
"""
import sys
from pathlib import Path

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from PIL import Image
from scipy import ndimage as ndi
from scipy.signal import fftconvolve

from config import *
from process_data import INTERIM, block_mean, crop, out_path, read_tif, report, update_meta

PW, PS, PE, PN = PLAY_BOUNDS
FW, FS, FE, FN = FETCH_BOUNDS
CELL = 6            # planner cell, metres (the DEM and the image used here are 1 m)

# localizability
TEMPLATE = 32       # ground patch a suit camera could map around the astronaut, metres
SEARCH = 24         # how far away a false match is looked for, metres
EXCLUDE = 5         # matches closer than this to the true spot count as correct, metres
NOISE_DN = 6.0      # assumed difference between a ground photo and the orbital image, grey levels


def plane_measures(dem):
    """Per CELL x CELL block of a 1 m DEM: tilt (deg), roughness (m), step (m)."""
    h, w = dem.shape[0] // CELL, dem.shape[1] // CELL
    b = dem[:h * CELL, :w * CELL].reshape(h, CELL, w, CELL).transpose(0, 2, 1, 3)   # (h, w, CELL, CELL)
    c = np.arange(CELL) - (CELL - 1) / 2
    X, Y = np.meshgrid(c, c)                      # X east, Y south, metres
    mean = b.mean((2, 3), keepdims=True)
    a = (b * X).sum((2, 3), keepdims=True) / (X * X).sum()
    d = (b * Y).sum((2, 3), keepdims=True) / (Y * Y).sum()
    res = b - (mean + a * X + d * Y)
    tilt = np.degrees(np.arctan(np.hypot(a, d)))[..., 0, 0]
    rough = np.sqrt((res ** 2).mean((2, 3)))
    step = np.maximum(np.abs(np.diff(res, axis=2)).max((2, 3)), np.abs(np.diff(res, axis=3)).max((2, 3)))
    return tilt, rough, step


def localizability(img):
    """Texture and uniqueness of the orbital image around every planner cell.

    img: 1 m grey image of the whole fetch window (the play area plus a margin).
    Returns (score, texture, sidelobe), each one value per planner cell.
    """
    img = img.astype(np.float32)
    rows, cols = int((PN - PS) / CELL), int((PE - PW) / CELL)
    R = TEMPLATE + 2 * SEARCH                      # search region side
    K = 2 * SEARCH + 1                             # number of offsets per axis
    regions = sliding_window_view(img, (R, R))
    # sum of squared deviations of every TEMPLATE-sized window, from integral images
    ii = np.pad(img.astype(np.float64), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    i2 = np.pad(img.astype(np.float64) ** 2, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    T = TEMPLATE

    def box(a):
        return a[T:, T:] - a[:-T, T:] - a[T:, :-T] + a[:-T, :-T]

    wss = (box(i2) - box(ii) ** 2 / (T * T)).astype(np.float32)
    wins = sliding_window_view(wss, (K, K))
    oy, ox = np.mgrid[-SEARCH:SEARCH + 1, -SEARCH:SEARCH + 1]
    outside = np.hypot(oy, ox) > EXCLUDE
    # top-left pixel of each cell's search region inside the fetch-window image
    c0 = int(PW - FW) + np.arange(cols) * CELL + CELL // 2 - R // 2
    r0 = int(FN - PN) + np.arange(rows) * CELL + CELL // 2 - R // 2
    score = np.zeros((rows, cols), np.float32)
    tex = np.zeros_like(score)
    side = np.zeros_like(score)
    for i in range(rows):
        reg = regions[r0[i], c0]                   # (cols, R, R)
        t = reg[:, SEARCH:SEARCH + T, SEARCH:SEARCH + T]
        t0 = t - t.mean((1, 2), keepdims=True)
        tss = (t0 ** 2).sum((1, 2))
        num = fftconvolve(reg, t0[:, ::-1, ::-1], mode="valid", axes=(1, 2))       # (cols, K, K)
        ncc = num / np.sqrt(np.maximum(tss[:, None, None] * wins[r0[i], c0], 1e-6))
        side[i] = np.clip(np.where(outside, ncc, -1).max((1, 2)), 0, 1)
        var = tss / (T * T)
        tex[i] = np.sqrt(var / (var + NOISE_DN ** 2))
        if i % 100 == 0:
            print(f"    row {i}/{rows}")
    score = tex * (1 - side)
    return score, tex, side


def pct(name, a, mask=None):
    v = a[mask] if mask is not None else a.ravel()
    p = np.percentile(v, [5, 25, 50, 75, 95, 99])
    print(f"    {name:26s} p5 {p[0]:.3f}  p25 {p[1]:.3f}  p50 {p[2]:.3f}  p75 {p[3]:.3f}  p95 {p[4]:.3f}  p99 {p[5]:.3f}")


def main():
    preview = Path(sys.argv[sys.argv.index("--preview") + 1]) if "--preview" in sys.argv else None
    print("nav grid")
    dem, b, nd, res = read_tif(DEM_WINDOW)
    dem = crop(dem, FETCH_BOUNDS, 1.0, PLAY_BOUNDS).astype(np.float64)
    bad = ~np.isfinite(dem) | (dem == nd) if nd is not None else ~np.isfinite(dem)
    print(f"    DEM {dem.shape[1]}x{dem.shape[0]}, no-data {bad.mean()*100:.2f}%")
    if bad.any():   # fill small holes with the nearest valid value so the plane fit is defined
        idx = ndi.distance_transform_edt(bad, return_distances=False, return_indices=True)
        dem = dem[tuple(idx)]
    tilt, rough, step = plane_measures(dem)
    rows, cols = tilt.shape

    sand = block_mean(np.load(INTERIM / "sand.npy").astype(np.float64), CELL // 2)
    hem_file = INTERIM / "crism_hematite.npy"
    hem = np.load(hem_file) if HAS_CRISM else np.full(tilt.shape, np.nan, np.float32)  # NaN = no CRISM coverage
    assert sand.shape == tilt.shape == hem.shape, (sand.shape, tilt.shape, hem.shape)

    gray, gb, gnd, gres = read_tif(ORTHO_WINDOW)
    print(f"    image {gray.shape[1]}x{gray.shape[0]} at {gres:.2f} m, zero pixels {(gray == 0).mean()*100:.2f}%")
    loc, tex, side = localizability(gray)

    is_sand = sand > 0.5
    pct("tilt deg", tilt)
    pct("roughness m", rough)
    pct("step m", step)
    print(f"    tilt >15: {(tilt > 15).mean()*100:.1f}%  >25: {(tilt > 25).mean()*100:.1f}%   "
          f"sand cells: {is_sand.mean()*100:.1f}%   hematite coverage: {np.isfinite(hem).mean()*100:.0f}%")
    pct("texture (all)", tex)
    pct("texture (sand)", tex, is_sand)
    pct("sidelobe (all)", side)
    pct("sidelobe (sand)", side, is_sand)
    pct("localizability (all)", loc)
    pct("localizability (sand)", loc, is_sand)
    pct("localizability (not sand)", loc, ~is_sand)

    def q(a, scale):
        return np.clip(np.round(a * scale), 0, 255).astype(np.uint8)

    channels = [
        ("tilt", q(tilt, 4), "degrees * 4", "slope of the plane fitted to each 6 m patch"),
        ("rough", q(rough, 250), "metres * 250", "RMS distance of the 1 m elevation samples from that plane"),
        ("step", q(step, 100), "metres * 100", "largest height difference between neighbouring 1 m samples, plane removed"),
        ("sand", q(sand, 255), "fraction * 255", "share of the cell covered by dark sand"),
        ("loc", q(loc, 255), "score * 255", "predicted success of matching a ground photo to the orbital image"),
        ("hematite", np.where(np.isfinite(hem), np.clip(np.round(hem * 254), 0, 254) + 1, 0).astype(np.uint8),
         "0 = no CRISM coverage; 1..255 = relative band depth", "CRISM BD860_2, 0.86 um band depth (hematite)"),
    ]
    rel = f"nav/nav_{CELL}m.bin"
    np.stack([c[1] for c in channels]).tofile(out_path(rel))
    report(rel)
    update_meta("nav", "grid", dict(
        file=rel, width=cols, height=rows, cell=CELL, west=PW + CELL / 2, north=PN - CELL / 2,
        encoding="uint8, one full grid per channel in the order listed, row 0 = north",
        channels=[dict(name=c[0], encoding=c[2], description=c[3]) for c in channels],
        localizability=dict(templateM=TEMPLATE, searchM=SEARCH, excludeM=EXCLUDE, noiseDN=NOISE_DN,
                            imageMetersPerPixel=1,
                            formula="sqrt(var / (var + noise^2)) * (1 - highest correlation with another spot)"),
        source="MSL Gale Merged DEM 1 m v3 and Orthophoto Mosaic v3 resampled to 1 m (USGS; MRO HiRISE)"
               + ("; MRO CRISM FRT0000B6F1" if HAS_CRISM else "")))

    if preview:
        preview.mkdir(parents=True, exist_ok=True)
        for name, a, hi in [("tilt", tilt, 35), ("rough", rough, 0.6), ("step", step, 1.2), ("sand", sand, 1),
                            ("loc", loc, 1), ("tex", tex, 1), ("side", side, 1)]:
            Image.fromarray(q(a / hi, 255), "L").save(preview / f"nav_{name}.png")
        print(f"    previews in {preview}")


if __name__ == "__main__":
    main()
    print("done")
