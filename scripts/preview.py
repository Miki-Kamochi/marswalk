"""Small preview images in data/interim/ for checking the processed data by eye."""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
from config import *

Image.MAX_IMAGE_PIXELS = None
OUT = INTERIM
PW, PS, PE, PN = PLAY_BOUNDS


def px(e, n, scale):
    return ((e - PW) / scale, (PN - n) / scale)


def base(name, scale=3):
    im = Image.open(PUBLIC_DATA / name).convert("RGB")
    w = int((PE - PW) / scale)
    return im.resize((w, int((PN - PS) / scale)), Image.LANCZOS)


def annotate(im, scale, sols=True):
    d = ImageDraw.Draw(im)
    for e in range(int(PW), int(PE) + 1, 500):
        x = (e - PW) / scale
        d.line([(x, 0), (x, im.height)], fill=(255, 255, 255, 60), width=1)
        d.text((x + 2, 2), str(e), fill="white")
    for n in range(int(PS), int(PN) + 1, 500):
        y = (PN - n) / scale
        d.line([(0, y), (im.width, y)], fill=(255, 255, 255, 60), width=1)
        d.text((2, y + 2), str(n), fill="white")
    tr = json.loads((PUBLIC_DATA / "traverse.json").read_text())["waypoints"]
    pts = [px(w[1], w[2], scale) for w in tr if PW < w[1] < PE and PS < w[2] < PN]
    d.line(pts, fill=(0, 255, 255), width=1)
    if sols:
        last = -99
        for w in tr:
            if PW < w[1] < PE and PS < w[2] < PN and w[0] - last >= 60:
                x, y = px(w[1], w[2], scale)
                d.text((x + 3, y - 4), str(w[0]), fill=(0, 255, 255))
                last = w[0]
    pp = PUBLIC_DATA / "positions.json"
    if pp.exists():
        for p in json.loads(pp.read_text())["places"]:
            if PW < p["easting"] < PE and PS < p["northing"] < PN:
                x, y = px(p["easting"], p["northing"], scale)
                d.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 255, 0), width=2)
                d.text((x + 6, y - 5), p["id"], fill=(255, 255, 0))
    return im


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    which = sys.argv[1:] or ["color", "hematite", "sand", "slope"]
    for name in which:
        if name == "color":
            im = base("imagery/color_2m.jpg")
        else:
            im = base("imagery/ortho_1m.jpg").convert("RGBA")
            ov = Image.open(PUBLIC_DATA / f"layers/{name}.png").convert("RGBA").resize(im.size, Image.NEAREST)
            im = Image.alpha_composite(im, ov).convert("RGB")
        annotate(im, 3).save(OUT / f"preview_{name}.png")
        print("wrote", f"data/interim/preview_{name}.png", im.size)
