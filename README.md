# Marswalk

NASA Space Apps Challenge 2026, "Interplanetary Survival Guide: Martian Map".

A browser game about finding your way home on Mars, where there is no GPS and no compass, built
on real NASA data of Gale Crater. The project vision is in [CLAUDE.md](CLAUDE.md).

**Status: playable MVP.** One mission: collect the hematite sample, survive the storm, get home.
Data check pages are at `/dev.html`.

## How the game works

You have an orbital map of Gale Crater but no "you are here": Mars has no GPS and no global
magnetic field. **Wayfinder**, the suit's navigator, puts a dot on the map and always shows how
sure it is (the circle around the dot).

- **Always on:** it counts steps and turns (dead reckoning). Cheap, but it drifts, so the circle grows.
- **Horizon scan (E / Scan button):** the suit's camera reads the skyline all around and matches it
  with skylines computed from NASA's HiRISE elevation map. The dot snaps to the true position and
  the circle shrinks. Each scan costs suit power, and it only works if you can see far enough.
- **Sun compass:** automatic while the sun is visible; keeps the heading true.

The mission: walk 700 m from the rover to Vera Rubin Ridge and collect hematite. A forecast dust
front arrives on the way back: the rover link drops, the horizon disappears and scans fail.
Wayfinder brings you home along your recorded path; when the dust thins, a scan corrects the drift.
The end map compares your real path, Wayfinder's estimate and the path you would have walked
without it.

Wayfinder (`src/nav/`) is a particle filter that only receives simulated sensor readings, never the
true position. Horizon matching is in `src/nav/horizon.ts`. `npm test` checks drift, the sun compass,
horizon matching (position, heading, failure in dust) and the line-of-sight maths.

### What it is based on

- Apollo 14 (1971): with a map in hand, the crew stopped about 30 m short of Cone Crater's rim,
  unsure of their position.
- The Apollo Lunar Roving Vehicle navigated by directional gyro, odometer and a sun-shadow device:
  dead reckoning plus a sun compass.
- NASA Goddard is developing horizon-based positioning (skyline vs. orbital elevation maps) as backup
  navigation for explorers on the Moon.
- Souman et al. (Current Biology, 2009): people walk in circles when they cannot see the sun.
- The 2018 global dust storm ended Opportunity's mission; Curiosity recorded its thickest haze in Gale.
- Sun position: NASA GISS Mars24 algorithm (Allison & McEwen 2000), tested against its published example.

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
