"""Zoomed check image: orthophoto + elevation contours + Curiosity sols.
Usage: zoom.py name west south east north [px_per_m]"""
import json, sys
import numpy as np, rasterio
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from config import *

name = sys.argv[1]
w, s, e, n = map(float, sys.argv[2:6])
k = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
FW, FS, FE, FN = FETCH_BOUNDS
with rasterio.open(RAW / "gale_mosaic" / "gale_ortho_1m_window.tif") as ds:
    g = ds.read(1)
with rasterio.open(RAW / "gale_mosaic" / "gale_dem_1m_window.tif") as ds:
    z = ds.read(1)
r0, r1, c0, c1 = int(FN - n), int(FN - s), int(w - FW), int(e - FW)
g, z = g[r0:r1, c0:c1], z[r0:r1, c0:c1]
im = Image.fromarray(g).convert("RGB")
zs = ndi.gaussian_filter(z.astype(float), 2)
a = np.array(im)
for step, col in ((5, (255, 200, 0)),):
    lv = np.floor(zs / step)
    edge = (lv != np.roll(lv, 1, 0)) | (lv != np.roll(lv, 1, 1))
    a[edge] = (0.5 * a[edge] + 0.5 * np.array(col)).astype(np.uint8)
im = Image.fromarray(a).resize((int(a.shape[1] * k), int(a.shape[0] * k)), Image.LANCZOS)
d = ImageDraw.Draw(im)
P = lambda E, N: ((E - w) * k, (n - N) * k)
tick = 100 if (e - w) <= 1500 else 500
for E in range(int(w // tick * tick), int(e) + 1, tick):
    d.line([P(E, n), P(E, s)], fill=(255, 255, 255), width=1); d.text((P(E, n)[0] + 2, 2), str(E), fill="white")
for N in range(int(s // tick * tick), int(n) + 1, tick):
    d.line([P(w, N), P(e, N)], fill=(255, 255, 255), width=1); d.text((2, P(w, N)[1] + 2), str(N), fill="white")
tr = json.loads((PUBLIC_DATA / "traverse.json").read_text())["waypoints"]
ins = [t for t in tr if w < t[1] < e and s < t[2] < n]
d.line([P(t[1], t[2]) for t in ins], fill=(0, 255, 255), width=2)
last = -99
for t in ins:
    if t[0] - last >= 8:
        x, y = P(t[1], t[2]); d.ellipse([x-2, y-2, x+2, y+2], fill=(0, 255, 255)); d.text((x + 4, y - 4), str(t[0]), fill=(0, 255, 255)); last = t[0]
pp = PUBLIC_DATA / "positions.json"
if pp.exists():
    for p in json.loads(pp.read_text())["places"]:
        if w < p["easting"] < e and s < p["northing"] < n:
            x, y = P(p["easting"], p["northing"]); d.ellipse([x-5, y-5, x+5, y+5], outline=(255, 0, 255), width=2); d.text((x + 7, y - 5), p["id"], fill=(255, 0, 255))
out = ROOT / "data" / "interim" / f"zoom_{name}.png"
im.save(out)
print("wrote", out.name, im.size, "elev %.0f..%.0f" % (z.min(), z.max()), "contours every 5 m")
