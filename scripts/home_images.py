"""Pictures for the home page, cut from the real HiRISE imagery with the planner's layers on top.

Usage:  node scripts/home_assets.ts  &&  .venv/Scripts/python scripts/home_images.py [--preview DIR]

Reads only files that are already processed (public/data, data/interim) and writes
public/img/home/*.jpg. Colours follow DESIGN.md: only what matters is coloured.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
INTERIM = ROOT / "data" / "interim"
OUT = ROOT / "public" / "img" / "home"

meta = json.loads((DATA / "meta.json").read_text())
nav = meta["nav"]["grid"]
W, H, CELL = nav["width"], nav["height"], nav["cell"]
PLAY = meta["frame"]["play"]

gray = np.asarray(Image.open(DATA / meta["images"]["ortho"]["file"]).convert("L"))   # 1 m, play area
lut = np.load(INTERIM / "color_lut.npy")                                             # grey -> natural colour
safety = np.fromfile(INTERIM / "safety_6m.bin", np.uint8).reshape(H, W)
fixable = np.fromfile(INTERIM / "fixable_6m.bin", np.uint8).reshape(H, W)
chan = [c["name"] for c in nav["channels"]]
navbytes = np.fromfile(DATA / nav["file"], np.uint8).reshape(len(chan), H, W)
hem = navbytes[chan.index("hematite")].astype(np.float32)
hem = np.where(hem == 0, np.nan, (hem - 1) / 254)

RED = np.array([255, 90, 90])
AMBER = np.array([255, 199, 90])
VIOLET = np.array([155, 123, 255])
PINK = np.array([255, 79, 216])


def window(west, north, size_e, size_n):
    """Pixel slice of the 1 m play-area image for a box given by its north-west corner."""
    c0 = int(round(west - PLAY["west"]))
    r0 = int(round(PLAY["north"] - north))
    return slice(r0, r0 + int(size_n)), slice(c0, c0 + int(size_e))


def cells_to_metres(a, rows, cols):
    """Upsample a 6 m grid to the 1 m image grid (cell centres sit 3 m in from the edge)."""
    big = np.repeat(np.repeat(a, CELL, 0), CELL, 1)
    return big[rows, cols]


def base_image(rows, cols, dim=0.82):
    rgb = lut[gray[rows, cols]].astype(np.float32) * dim
    return rgb


def blend(rgb, colour, alpha):
    a = np.clip(alpha, 0, 1)[..., None]
    return rgb * (1 - a) + colour * a


def soft(mask, sigma):
    return ndi.gaussian_filter(mask.astype(np.float32), sigma)


def safety_layer(rgb, rows, cols):
    s = cells_to_metres(safety, rows, cols)
    rgb = blend(rgb, AMBER, soft(s == 1, 1.5) * 0.42)
    nogo = soft(s == 2, 1.0)
    yy, xx = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]]
    hatch = ((xx + yy) % 7) < 3
    rgb = blend(rgb, RED, nogo * np.where(hatch, 0.85, 0.3))
    return rgb


def lost_layer(rgb, rows, cols, strength=0.4):
    f = cells_to_metres(fixable, rows, cols)
    return blend(rgb, VIOLET, soft(f == 0, 5.0) * strength)


def science_layer(rgb, rows, cols):
    h = cells_to_metres(hem, rows, cols)
    v = np.clip((np.nan_to_num(h, nan=0) - 0.3) / 0.7, 0, 1)
    rgb = blend(rgb, PINK, ndi.gaussian_filter(v, 4) * 0.8)
    unseen = soft(np.isnan(h), 2)
    return rgb * (1 - 0.45 * unseen[..., None])


def save(name, rgb, size=None):
    OUT.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(np.clip(rgb, 0, 255).round().astype(np.uint8), "RGB")
    if size:
        img = img.resize(size, Image.LANCZOS)
    path = OUT / name
    img.save(path, quality=84, optimize=True, progressive=True)
    print(f"  wrote public/img/home/{name} {img.size[0]}x{img.size[1]} ({path.stat().st_size / 1e3:.0f} kB)")
    return img


def main():
    preview = Path(sys.argv[sys.argv.index("--preview") + 1]) if "--preview" in sys.argv else None
    places = {p["id"]: p for p in json.loads((DATA / "positions.json").read_text())["places"]}

    # three layer cards, 640 m squares around the place that shows each layer best
    cards = [
        ("layer-safety.jpg", places["stop_murray_buttes"], safety_layer, (0, 120)),
        ("layer-lost.jpg", places["bagnold_dunes"], lost_layer, (0, 0)),
        ("layer-science.jpg", places["stop_vera_rubin_ridge"], science_layer, (-120, 60)),
    ]
    S = 640
    out = []
    for name, p, layer, (de, dn) in cards:
        rows, cols = window(p["easting"] - S / 2 + de, p["northing"] + S / 2 + dn, S, S)
        out.append(save(name, layer(base_image(rows, cols), rows, cols), (640, 640)))

    # the route picture: the box precomputed by home_assets.ts, at 2.5 m per pixel
    b = json.loads((DATA / "home" / "routes.json").read_text())["bounds"]
    rows, cols = window(b["west"], b["north"], b["east"] - b["west"], b["north"] - b["south"])
    rgb = lost_layer(base_image(rows, cols, dim=0.62), rows, cols, strength=0.3)
    w = round((b["east"] - b["west"]) / 2.5)
    h = round((b["north"] - b["south"]) / 2.5)
    out.append(save("routes.jpg", rgb, (w, h)))

    # hero texture for the planet: a wide, soft crop of the whole area
    rows, cols = window(PLAY["west"], PLAY["north"], PLAY["east"] - PLAY["west"], PLAY["north"] - PLAY["south"])
    save("surface.jpg", base_image(rows, cols, dim=1.0), (1000, 1200))

    if preview:
        preview.mkdir(parents=True, exist_ok=True)
        sheet = Image.new("RGB", (640 * 3 + 20, 640), (40, 40, 40))
        for k, im in enumerate(out[:3]):
            sheet.paste(im, (k * 650, 0))
        sheet.save(preview / "home_cards.jpg", quality=80)
        out[3].save(preview / "home_routes.jpg", quality=80)


if __name__ == "__main__":
    main()
