"""Whole-Mars colour texture for the home-screen globe.

Reads the USGS Viking MDIM 2.1 colour mosaic (232 m/px, 92160 x 46080, stripped, no overviews)
remotely, one row out of every 90, averages blocks of 90 columns and writes a 1024 x 512
equirectangular JPEG to public/img/home/mars.jpg. About 140 MB is transferred.

Run: .venv/Scripts/python scripts/globe.py
"""
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import Window

URL = "https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif"
W, H = 1024, 512
OUT = Path(__file__).resolve().parent.parent / "public" / "img" / "home" / "mars.jpg"


def main() -> None:
    with rasterio.open("/vsicurl/" + URL) as ds:
        sw, sh = ds.width, ds.height
    step_y = sh // H
    step_x = sw // W
    img = np.zeros((H, W, 3), np.uint8)
    t0 = time.time()

    def work(rows):
        with rasterio.open("/vsicurl/" + URL) as ds:  # one handle per thread
            for r in rows:
                y = r * step_y + step_y // 2
                line = ds.read(window=Window(0, y, sw, 1))[:, 0, : W * step_x]  # (3, sw)
                img[r] = line.reshape(3, W, step_x).mean(axis=2).T.astype(np.uint8)

    chunks = [range(i, H, 16) for i in range(16)]
    with ThreadPoolExecutor(16) as ex:
        for i, _ in enumerate(ex.map(work, chunks)):
            print(f"  chunk {i + 1}/16 ({time.time() - t0:.0f}s)", flush=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img).save(OUT, quality=88)
    print(f"wrote {OUT} {W}x{H} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
