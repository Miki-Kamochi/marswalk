# Data sources

Every dataset used by Marswalk, the mission and instrument it comes from, and where we got it.
All are public NASA / USGS / PDS data. The download script is `scripts/download_data.py`; the
URLs below are the exact ones it uses and were all reachable on 2026-11-14.

Map frame for everything: Mars equirectangular, sphere radius 3 396 190 m, centre latitude 0,
centre longitude 0 (the frame of the USGS Gale mosaics and of Curiosity's waypoints).

| # | What we use it for | Dataset | Mission / instrument | Resolution | Source |
|---|---|---|---|---|---|
| 1 | Ground shape of the play area and its surroundings; slope layer; line-of-sight checks | MSL Gale Merged DEM, 1 m, v3 | Mars Reconnaissance Orbiter (MRO) / HiRISE stereo. Outside the HiRISE coverage the mosaic is filled with MRO CTX and Mars Express HRSC elevation. Assembled by the MSL project, hosted by USGS Astrogeology | 1 m (we ship 2 m, 8 m and 60 m) | `https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif` |
| 2 | Ground imagery; sand hazard mask | MSL Gale Orthophoto Mosaic, 25 cm, v3 | MRO / HiRISE. Assembled by the MSL project, hosted by USGS Astrogeology | 0.25 m (we ship 1 m, 2 m and 4 m) | `https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif` |
| 3 | Colour tint of the imagery | HiRISE colour orthoimage `PSP_009650_1755_IRB_C_01_ORTHO` (infrared, red and blue-green filters) | MRO / HiRISE, University of Arizona | 1 m | `https://www.uahirise.org/PDS/DTM/PSP/ORB_009600_009699/PSP_009650_1755_PSP_009716_1755/` |
| 4 | Far backdrop: the whole of Gale crater, its rim and Mount Sharp's summit | MOLA MEGDR global elevation mosaic, 463 m | Mars Global Surveyor (MGS) / MOLA laser altimeter, hosted by USGS Astrogeology | 463 m | `https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif` |
| 5 | Mineral layers: hematite (BD860_2), basalt sand (OLINDEX3), hydrated minerals (BD1900_2) | CRISM MTRDR targeted observation `FRT0000B6F1`, refined spectral summary parameters (`frt0000b6f1_07_sr165j_mtr3`) | MRO / CRISM imaging spectrometer, PDS Geosciences Node | 18 m | `https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/mtrdr/2008/2008_191/frt0000b6f1/` |
| 6 | Curiosity's real path; position of every mission stop | MSL localized waypoints | Mars Science Laboratory (Curiosity) rover, JPL localization team | one point per drive | `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` |
| 7 | Weather: air and ground temperature, pressure, sunrise and sunset, UV, per sol | REMS weather feed | MSL Curiosity / REMS (Rover Environmental Monitoring Station), Centro de Astrobiología (CSIC-INTA) and JPL | one record per sol, sols 1 to 4995 | `https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json` |
| 8 | The whole planet on the home screen (globe colours) | Viking MDIM 2.1 colourised global mosaic | Viking Orbiters 1 and 2, colourised by USGS Astrogeology | 232 m (we ship 1024 x 512, about 21 km per pixel; `scripts/globe.py`) | `https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif` |

## Map areas

Datasets 1 and 2 are read for two windows on Curiosity's route (bounds in `scripts/config.py`, data in
`public/data/<area>/`):

| Area | Window shipped | Curiosity sols inside | Ground |
|---|---|---|---|
| `buttes`: Murray Buttes, Bagnold Dunes, Vera Rubin Ridge | 3.0 × 3.6 km, 4.74–4.84° S | 1352–2804 | 404 m relief, 3 % steeper than 15° |
| `gediz`: Greenheugh pediment, Marker Band valley, Gediz Vallis ridge and channel | 3.0 × 3.6 km, just south of it | 3143–4552 | 667 m relief, 39 % steeper than 15° |

Dataset 5 (CRISM) covers only the `buttes` area, so `gediz` has no mineral layers. The `gediz` stops
are Curiosity's logged position on the sol NASA/JPL reported for each place: Marker Band valley
(panorama sol 3684, nearest logged sol 3687), Gediz Vallis ridge (reached sol 3923), the sulfur
stones (sol 4200).

## How each one is processed

- **1, 2**: these mosaics are far too large to download (the orthophoto is about 23 GB), so the
  script reads only our 4.0 × 4.5 km window over HTTP range requests. The whole DEM mosaic is also
  sampled every 20 m to build the mid-distance backdrop (lower Mount Sharp).
- **3**: registered to the mosaic by image correlation (offset found: 68 m west, 111 m south,
  correlation 0.92), then used to measure which colour goes with each brightness level. The shipped
  colour image is therefore *approximate natural colour*: brightness is real HiRISE data at every
  pixel, the hue is a per-brightness average from the HiRISE colour filters.
- **5**: the three parameters are resampled from 18 m to 6 m and stretched between the 70th and
  99.5th percentile of the play area. The observation covers the southern 70 % of the play area;
  the Murray Buttes in the north are outside it.
- **Derived layers** (not separate datasets): slope comes from dataset 1; the dark-sand mask comes
  from dataset 2 (dark, smooth patches larger than 2500 m²).
- **Route planner grid** (`public/data/nav/nav_6m.bin`, made by `scripts/nav_layers.py`): tilt,
  roughness and step come from dataset 1 at its full 1 m resolution (a plane fitted to every 6 m
  cell); the localizability score comes from dataset 2 at 1 m (each 32 m patch matched against its
  own surroundings); sand and hematite are datasets 2 and 5 resampled to the same 6 m cells.

## Notes for the submission

- The REMS feed (7) is published by Centro de Astrobiología for outreach; its own disclaimer says
  the calibrated science data live in the PDS Atmospheres Node. Fine for a hackathon demo, but say
  "REMS outreach feed" if a judge asks.
- Dataset 1 includes some non-NASA elevation (ESA Mars Express HRSC) as fill outside the HiRISE
  coverage. Our play area is entirely inside the HiRISE part.
- Credit line to show in the app: *NASA/JPL-Caltech/University of Arizona/USGS (HiRISE, CTX),
  NASA/JPL-Caltech/JHUAPL (CRISM), NASA/GSFC (MOLA), NASA/JPL-Caltech/CAB (CSIC-INTA) (REMS)*.

## Considered but not used

- **UArizona HiRISE DTM `DTEEC_009650_1755_009716_1755_U01`** (the one suggested in the vision).
  Checked first: its eastern edge stops about 100 to 400 m short of where Curiosity climbed Vera
  Rubin Ridge, so the hematite stop would have had no terrain. The MSL Gale mosaic (dataset 1) is
  built from the same kind of HiRISE stereo data and covers the whole route.
