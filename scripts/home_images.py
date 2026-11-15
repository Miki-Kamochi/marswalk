"""The natural-colour picture of the play area used as the map swatch in the planner's layer menu.

Usage:  .venv/Scripts/python scripts/home_images.py

Reads files that are already processed for the buttes area (public/data/buttes, data/interim/buttes) and writes
public/img/home/surface.jpg.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "buttes"
INTERIM = ROOT / "data" / "interim" / "buttes"
OUT = ROOT / "public" / "img" / "home"

meta = json.loads((DATA / "meta.json").read_text())
PLAY = meta["frame"]["play"]

gray = np.asarray(Image.open(DATA / meta["images"]["ortho"]["file"]).convert("L"))   # 1 m, play area
lut = np.load(INTERIM / "color_lut.npy")                                             # grey -> natural colour


def save(name, rgb, size):
    OUT.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(np.clip(rgb, 0, 255).round().astype(np.uint8), "RGB").resize(size, Image.LANCZOS)
    path = OUT / name
    img.save(path, quality=84, optimize=True, progressive=True)
    print(f"  wrote public/img/home/{name} {img.size[0]}x{img.size[1]} ({path.stat().st_size / 1e3:.0f} kB)")


def main():
    save("surface.jpg", lut[gray].astype(np.float32), (1000, 1200))


if __name__ == "__main__":
    main()
