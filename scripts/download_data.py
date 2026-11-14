"""Download the raw NASA datasets into data/raw/. Safe to re-run (skips existing files).

Usage:  .venv/Scripts/python scripts/download_data.py [step ...]

The two USGS Gale mosaics are huge (DEM several GB, orthophoto ~23 GB), so we never
download them whole: GDAL reads just our window over HTTP range requests.
"""
import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests

from config import *

os.environ.update(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
                  CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                  GDAL_HTTP_TIMEOUT="120", GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="2",
                  GTIFF_DIRECT_IO="YES")
import rasterio  # noqa: E402
from rasterio.transform import from_origin  # noqa: E402
from rasterio.windows import Window, from_bounds  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (marswalk-hackathon data fetch)"}
EQC = "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"


def have(dest):
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  have {dest.relative_to(ROOT)} ({dest.stat().st_size/1e6:.1f} MB)")
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    return False


def fetch(url, dest):
    if have(dest):
        return
    tmp = dest.with_suffix(dest.suffix + ".part")
    n = 0
    with requests.get(url, headers=UA, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
                n += len(chunk)
    tmp.replace(dest)
    print(f"  got  {dest.relative_to(ROOT)} ({n/1e6:.1f} MB)")


def save_tif(dest, arr, west, north, res, nodata=None):
    with rasterio.open(dest, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1],
                       count=1, dtype=arr.dtype, crs=EQC, nodata=nodata, compress="deflate",
                       predictor=2 if arr.dtype.kind in "iu" else 3, tiled=True,
                       transform=from_origin(west, north, res, res)) as ds:
        ds.write(arr, 1)
    print(f"  got  {dest.relative_to(ROOT)} {arr.shape} ({dest.stat().st_size/1e6:.1f} MB)")


def ortho_window(bounds, dest, pool=4):
    """Read a window of the 25 cm orthophoto mosaic and mean-pool it to 1 m."""
    if have(dest):
        return
    w, s, e, n = bounds
    t0 = time.time()
    with rasterio.open("/vsicurl/" + GALE_ORTHO_URL) as ds:
        win = from_bounds(w, s, e, n, ds.transform).round_offsets().round_lengths()
        H, W = int(win.height) // pool, int(win.width) // pool
        out = np.zeros((H, W), np.uint8)
        step = 250
        for r in range(0, H, step):
            rows = min(step, H - r)
            a = ds.read(1, window=Window(win.col_off, win.row_off + r * pool, W * pool, rows * pool))
            out[r:r + rows] = a.reshape(rows, pool, W, pool).mean(axis=(1, 3)).round()
            print(f"\r  ortho rows {r+rows}/{H} ({time.time()-t0:.0f}s)", end="", file=sys.stderr)
    print(file=sys.stderr)
    save_tif(dest, out, w, n, 0.25 * pool)


def gale_dem():
    print("Gale 1 m DEM window (MSL Gale merged DEM, USGS / MSL project)")
    dest = RAW / "gale_mosaic" / "gale_dem_1m_window.tif"
    if have(dest):
        return
    w, s, e, n = FETCH_BOUNDS
    with rasterio.open("/vsicurl/" + GALE_DEM_URL) as ds:
        win = from_bounds(w, s, e, n, ds.transform).round_offsets().round_lengths()
        a = ds.read(1, window=win)
    save_tif(dest, a, w, n, 1.0, nodata=-32767.0)


def gale_ortho():
    print("Gale orthophoto window, 25 cm pooled to 1 m (MRO HiRISE mosaic, USGS / MSL project)")
    ortho_window(FETCH_BOUNDS, RAW / "gale_mosaic" / "gale_ortho_1m_window.tif")
    ortho_window(COLOR_CAL_BOUNDS, RAW / "gale_mosaic" / "gale_ortho_1m_colorcal.tif")


def gale_mid():
    print(f"Whole Gale DEM mosaic sampled every {MID_DECIMATE} m (mid-distance backdrop)")
    dest = RAW / "gale_mosaic" / f"gale_dem_{MID_DECIMATE}m_full.tif"
    if have(dest):
        return
    with rasterio.open("/vsicurl/" + GALE_DEM_URL) as ds:
        W, H, tr = ds.width, ds.height, ds.transform
    rows = list(range(MID_DECIMATE // 2, H, MID_DECIMATE))
    out = np.zeros((len(rows), len(range(MID_DECIMATE // 2, W, MID_DECIMATE))), np.float32)
    done = [0]
    t0 = time.time()

    def work(chunk):
        with rasterio.open("/vsicurl/" + GALE_DEM_URL) as ds:  # one handle per thread
            for i in chunk:
                out[i] = ds.read(1, window=Window(0, rows[i], W, 1))[0, MID_DECIMATE // 2::MID_DECIMATE]
                done[0] += 1
                if done[0] % 50 == 0:
                    print(f"\r  rows {done[0]}/{len(rows)} ({time.time()-t0:.0f}s)", end="", file=sys.stderr)

    n_threads = 8
    with ThreadPoolExecutor(n_threads) as ex:
        list(ex.map(work, [range(k, len(rows), n_threads) for k in range(n_threads)]))
    print(file=sys.stderr)
    save_tif(dest, out, tr.c, tr.f, float(MID_DECIMATE), nodata=-32767.0)


def mola():
    print("MOLA 463 m DEM window over Gale crater (MGS / MOLA)")
    dest = RAW / "mola" / "mola_463m_gale.tif"
    if have(dest):
        return
    cx = math.radians(GALE_CENTER_LONLAT[0]) * MARS_RADIUS_M
    cy = math.radians(GALE_CENTER_LONLAT[1]) * MARS_RADIUS_M
    h = MOLA_HALF_WINDOW_M
    with rasterio.open("/vsicurl/" + MOLA_URL) as ds:
        win = from_bounds(cx - h, cy - h, cx + h, cy + h, ds.transform).round_offsets().round_lengths()
        a = ds.read(1, window=win)
        t = ds.window_transform(win)
    save_tif(dest, a, t.c, t.f, t.a, nodata=-32768)


def hirise_color():
    print("HiRISE colour orthoimage strip (MRO / HiRISE, Univ. of Arizona)")
    fetch(f"{HIRISE_BASE}/{HIRISE_ORTHO_IRB}", RAW / "hirise" / HIRISE_ORTHO_IRB)
    fetch(f"{HIRISE_BASE}/{HIRISE_ORTHO_IRB[:-4]}.LBL", RAW / "hirise" / f"{HIRISE_ORTHO_IRB[:-4]}.LBL")


def crism():
    print("CRISM MTRDR spectral summary parameters FRT0000B6F1 (MRO / CRISM, PDS Geosciences)")
    for ext in ("img", "hdr", "lbl"):
        fetch(f"{CRISM_BASE}/{CRISM_SR}.{ext}", RAW / "crism" / f"{CRISM_SR}.{ext}")


def msl_traverse():
    print("Curiosity traverse waypoints (MSL localization, JPL)")
    fetch(MSL_WAYPOINTS_URL, RAW / "msl_traverse" / "MSL_waypoints.json")


def rems():
    print("Curiosity REMS weather per sol (MSL / REMS, Centro de Astrobiologia + JPL)")
    fetch(REMS_URL, RAW / "rems" / "rems_weather.json")


STEPS = dict(msl_traverse=msl_traverse, rems=rems, crism=crism, hirise_color=hirise_color,
             mola=mola, gale_dem=gale_dem, gale_ortho=gale_ortho, gale_mid=gale_mid)

if __name__ == "__main__":
    for name in (sys.argv[1:] or STEPS):
        STEPS[name]()
    print("done")
