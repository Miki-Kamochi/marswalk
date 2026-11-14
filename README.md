# Marswalk

NASA Space Apps Challenge 2026, "Interplanetary Survival Guide: Martian Map".

A browser game about finding your way home on Mars, where there is no GPS and no compass, built
on real NASA data of Gale Crater. The project vision is in [CLAUDE.md](CLAUDE.md).

**Status: Phase 1.** The game is not built yet. The data, the processing pipeline and three
check pages are ready.

## Run it

Needs Node 20 or newer.

```
npm install
npm run dev
```

Open http://localhost:5173. The processed data is committed in `public/data`, so nothing else
is needed.

| Page | What it checks |
|---|---|
| `/terrain-test.html` | The real terrain in 3D: play area, Mount Sharp, crater rim, places, Curiosity's path |
| `/map-test.html` | The 2D layered map: imagery, slope, minerals, sand, route |
| `/sensor-test.html` | Phone sensors: turn the phone to look around, step counter |

### Test on a phone before deploying

Phone motion sensors only work on secure (HTTPS) pages. This serves the site over HTTPS on your
Wi-Fi with a self-signed certificate:

```
npm run dev:phone
```

Open the `Network:` address it prints (for example `https://192.168.1.20:5173`) on a phone that
is on the same Wi-Fi. The browser warns about the certificate; choose "Advanced", then "Proceed".
On iPhone, tap "Enable motion sensors" and allow the prompt.

## Build and deploy

```
npm run build      # type-check, then build the static site into dist/
npm run preview    # serve dist/ locally
```

The output is a plain static site with no backend. To deploy to Vercel:

```
vercel             # preview deployment
vercel --prod      # production deployment
```

Vercel detects Vite automatically (build command `npm run build`, output `dist`).

## Rebuild the data

Only needed if you change the play area or the processing. Needs Python 3.12 or newer.

```
python -m venv .venv
.venv\Scripts\python -m pip install -r scripts/requirements.txt
npm run data:download     # about 190 MB into data/raw/ (not committed), takes about 10 minutes
npm run data:process      # writes public/data/ and re-checks all positions
```

- `scripts/config.py`: play-area bounds and dataset URLs.
- `scripts/download_data.py`: fetches the raw data. The two big USGS mosaics are never downloaded
  whole; only our window is read over HTTP.
- `scripts/process_data.py`: raw data to web-ready terrain, imagery and layers.
- `scripts/positions.py`: picks the base, stops and landmarks from the data and verifies each one
  (elevation, slope, sand, hematite signal, line of sight from the base).
- `scripts/preview.py`, `scripts/zoom.py`: small check images in `data/interim/`.

Datasets and credits are listed in [DATA_SOURCES.md](DATA_SOURCES.md).

## Layout

```
index.html, *-test.html   pages (Vite multi-page)
src/data/                 frame.ts (coordinates), loader.ts (typed loaders for public/data)
src/test/                 the Phase 1 check pages
public/data/              processed NASA data (see meta.json for a description of every file)
public/models/            3D models (Phase 2)
scripts/                  Python data pipeline
data/raw/                 downloaded source data (git-ignored)
```

## Coordinates

- **Map frame**: Mars equirectangular metres, sphere radius 3 396 190 m. `easting = R × longitude`,
  `northing = R × latitude` (radians). Same frame as the USGS Gale mosaics and Curiosity's waypoints.
- **World frame** (three.js): metres from the centre of the play area. x = east, y = up, z = south.
- Height grids are `uint16`, row 0 = north, `elevation = zMin + (value − 1) × zScale`, 0 = no data.

## Play area

3.0 × 3.6 km at the foot of Mount Sharp, centred on 4.709°S 137.364°E, covering Curiosity's route
from the Murray Buttes across the Bagnold Dunes to Vera Rubin Ridge (sols 1352 to 2804).
