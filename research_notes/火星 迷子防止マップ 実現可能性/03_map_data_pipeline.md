# Map Data Pipeline: Building a Gale Crater EVA Safety / Don't-Get-Lost Hazard Map from Public NASA Data

Scope: Curiosity route Murray Buttes to Vera Rubin Ridge (~3 km), Gale Crater. The team already uses the USGS MSL Gale merged DEM 1 m, the 25 cm orthophoto mosaic, MOLA 463 m, CRISM MTRDR FRT0000B6F1, Curiosity waypoints JSON (MMGIS), and the REMS feed. Research date: 2026-11-14. Notes are in English for the report writer. Items marked "(unverified)" come from the researcher's background knowledge and were NOT confirmed by a source in this session. They are listed in the Gaps sections, not in Cited Findings.

---

## 1. Datasets and where to get them (resolution, coverage, format, URL, license)

### Takeaway
For a 3 km area at Gale, the team's two USGS MSL Gale products (1 m DEM, 25 cm ortho) are already the best base layers. The most useful additions are:
- HiRISE DTMs as analysis-ready COGs via the USGS STAC catalog, for slope at 1–2 m post spacing and a per-pixel figure-of-merit (FOM) error layer.
- The Murray Lab global CTX mosaic (5 m) for regional context.
- THEMIS quantitative thermal inertia (100 m), for loose-sand vs bedrock.
- The Robbins & Hynek crater catalog (only craters ≥1 km, so mostly context at this scale).
- The Mars Climate Database for environment (seasonal and daily weather).
- AI4Mars, if the team wants to train a terrain classifier.

### Cited Findings

**USGS MSL Gale products (already in use; confirmed details)**
- The MSL Gale Merged Orthophoto Mosaic 25 cm is version 3, a GeoTIFF of about 23 GB. It was built from HiRISE, CTX and HRSC imagery. Authors are Fred J. Calef III and Timothy Parker, and the recommended citation is Calef III & Parker (2016). — [USGS Astrogeology: MSL Gale Merged Orthophoto Mosaic 25cm](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm)
- The MSL Gale Merged DEM 1 m is version 3, about 3.6 GB. It merges HRSC, CTX and HiRISE DEMs, all tied to MOLA, and was first made for Curiosity's entry, descent and landing (EDL) assessment.
  - Where HiRISE stereo coverage is missing, it falls back to CTX, then HRSC, then the MOLA 128 ppd DEM. So the effective resolution varies by place, even though the grid is 1 m.
  - Elevations range from about −4626 m to −323 m. Status is "In Work".
  - Source: [USGS Astrogeology: MSL Gale Merged DEM 1m](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m)

**HiRISE DTMs and orthoimages**
- The USGS Astrogeology STAC catalog holds all the HiRISE DTMs delivered to PDS (last updated July 2023). Each DTM covers the overlap of two HiRISE images at 1–2 m post spacing.
  - Assets per DTM: the DTM, orthorectified images, hillshades, figure-of-merit (FOM) images, and provenance information.
  - Source: [USGS STAC docs: HiRISE DTMs and Orthoimages](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/)
- The HiRISE uncontrolled observations collection is converted to losslessly compressed Cloud Optimized GeoTIFFs (COGs), derived from the RDRs as of March 2023. One example query matched 155,277 items. — [USGS STAC: HiRISE Uncontrolled Observations](https://stac.astrogeology.usgs.gov/docs/data/mars/uncontrolled_hirise/); [STAC API collection](https://stac.astrogeology.usgs.gov/api/collections/mro_hirise_uncontrolled_observations/)
- USGS reports more than 4,800 DTMs and more than 155,000 ultra-high-resolution images. The data are hosted free on the Amazon (AWS) Open Data Registry. — [USGS news: easier than ever to view Mars landscapes](https://www.usgs.gov/news/featured-story/it-easier-ever-view-mars-landscapes-high-resolution)
- STAC API root: `https://stac.astrogeology.usgs.gov/api/`. The tutorials show searching with pystac-client or stac-client and loading the results into QGIS. — [STAC tutorial: find data and load in QGIS](https://stac.astrogeology.usgs.gov/docs/tutorials/find_data_and_qgis_load)
- In PDS ODE, HiRISE DTM product IDs (with their orthoimages) follow the pattern `DTDPS_XXXXXX_XXXX_YYYYYY_YYYY_INN`, as shown on the ODE help page. The PDS data set ID is MRO-M-HIRISE-5-DTM-V1.0. — [ODE: MRO HiRISE DTM help page](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Mars%20Reconnaissance%20Orbiter/HiRISE/HiRISE%20DTM.htm)
- JMARS has a HiRISE DTM stamp layer. Search needs only the image ID and lat/lon, because there are few DTM products. — [JMARS: HiRISE DTM stamp layer](https://jmars.asu.edu/high-resolution-imaging-science-experiment-hirise-dtm-stamp-layer)

**CTX global mosaic (Murray Lab)**
- The V01 mosaic is 5.7 terapixels at 5.0 m/px and covers 99.5% of Mars, from 88°S to 88°N. All data come from the MRO Context Camera. It can be streamed or downloaded as tiles. — [Murray Lab: Global CTX Mosaic](https://murray-lab.caltech.edu/CTX/); [Caltech news](https://www.gps.caltech.edu/news-and-events/news/scientists-unveil-a-57-terapixel-global-image-of-mars)
- License: the Murray Lab/Caltech grants free use of V01 for all purposes. Suggested credit: "NASA/JPL/MSSS/The Murray Lab".
  - Tiles are at `murray-lab.caltech.edu/CTX/V01/tiles/`. USGS asks users to download one tile at a time.
  - The whole mosaic would take about 13 days to download at 5 Mb/s.
  - Sources: [Murray Lab CTX](https://murray-lab.caltech.edu/CTX/); [USGS catalog entry](https://astrogeology.usgs.gov/search/map/mars-mro-ctx-global-mosaic-murray-lab-v1)
- Also available inside JMARS: Instrument → CTX → Global Mosaic. — [JMARS node](https://jmars.asu.edu/node/2844)

**HRSC**
- ODE distributes HRSC DTMRDR (Digital Terrain Model Reduced Data Records) from Mars Express. — [ODE: MEX HRSC DTMRDR](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/MEX/HRSC/DTMRDR.htm)

**MOLA**
- ODE provides a MOLA PEDR query page for the individual laser shot points, which are absolute elevation control. — [ODE MOLA PEDR Query Page](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Web_Interface/Tools_Tab/MOLA_PEDR_Query_Page.htm)

**THEMIS thermal inertia (loose sand vs rock)**
- The THEMIS quantitative thermal inertia mosaic is about 100 m/pixel, credited to Robin Fergason, published 2014. Absolute accuracy is about 20%. There is no mosaic above 60° latitude.
  - Tiles are named by their corner (e.g., 30S060E). Gale (about 5°S, 137.4°E) probably falls in a 30S120E-type tile, not the 30S060E tile linked below. The exact tile was not confirmed.
  - Source: [USGS: THEMIS Thermal Inertia Mosaic Quantitative 30S060E 100mpp](https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30s060e_100mpp)
- Method: thermal inertia is derived from single THEMIS nighttime IR images, following Fergason et al. (2006). — [same USGS page](https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30s060e_100mpp)
- At Gale, most of the landing-site region has moderate thermal inertia (250–410 J m⁻² K⁻¹ s⁻¹ᐟ²), interpreted as an indurated surface. — [Fergason et al. 2012, Space Sci. Rev., via USGS pubs](https://pubs.usgs.gov/publication/70038495); [THEMIS support for MSL](https://themis.asu.edu/landingsites)
- A 2021 study using overlapping THEMIS observations found the Gale results consistent with rover observations, indicating indurated or clast-covered sands. — [Stony Brook: thermophysical properties of landing sites](https://researchconnect.stonybrook.edu/en/publications/thermophysical-properties-and-surface-heterogeneity-of-landing-si/)

**Crater database**
- Robbins & Hynek (2012), JGR-Planets, DOI 10.1029/2011JE003966: 384,343 craters, statistically complete for diameters ≥1 km.
  - Built from THEMIS Daytime IR and Viking MDIM 2.1 mosaics. Each rim was traced with 5 points.
  - Fields include rim heights and crater depths.
  - Sources: [B2FIND record](https://b2find.dkrz.de/dataset/8f2ff1a2-ef58-5985-bcd8-6fa1ac2c97fc); [CU Boulder news](https://www.colorado.edu/today/2012/06/11/cu-boulder-researchers-catalog-more-635000-martian-craters)
- Note: the CU news release says "more than 635,000 craters". That count includes craters smaller than 1 km; the ≥1 km complete set is 384,343. — [CU Boulder](https://www.colorado.edu/today/2012/06/11/cu-boulder-researchers-catalog-more-635000-martian-craters)

**Rock abundance (HiRISE rock counting)**
- At about 30 cm/pixel, HiRISE lets researchers count rocks >1.5 m in diameter from orbit. Those counts fall on the same exponential size-frequency curve as rocks counted on the surface, which is the basis for landing-site rock hazard models. — [Golombek et al. 2021, InSight rock SFD (Caltech)](https://resolver.caltech.edu/CaltechAUTHORS:20210823-183722868)
- Rocks below about 1.5 m are past HiRISE's resolution limit ("resolution roll-off"), so smaller rocks must be extrapolated from the model curve. — [Golombek, Rocks talk, 4th MSL Landing Site Workshop](https://marsoweb.nas.nasa.gov/landingsites/msl/workshops/4th_workshop/talks/Golombek_Rocks_4th_Wkshp.pdf)

**Rover image data for training and point-of-view**
- AI4Mars (JPL): crowdsourced terrain labels, about 10 labelers per image.
  - First release (2021): ~326K labels on 35K images from Curiosity, Opportunity and Spirit.
  - Version 0.6 (Zenodo): ~50K images that now include Perseverance.
  - About 1.5K validation labels were made by MSL and MER rover planners and scientists.
  - A DeepLabv3 baseline model got >96% overall accuracy on the test set.
  - Sources: [Swan et al., CVPRW 2021](https://openaccess.thecvf.com/content/CVPR2021W/AI4Space/papers/Swan_AI4MARS_A_Dataset_for_Terrain-Aware_Autonomous_Driving_on_Mars_CVPRW_2021_paper.pdf); [Zenodo v0.6](https://zenodo.org/records/15995036); [data.nasa.gov](https://data.nasa.gov/dataset/ai4mars-a-dataset-for-terrain-aware-autonomous-driving-on-mars)
- The Hugging Face mirror is an older Curiosity-only version. — [HF dataset](https://huggingface.co/datasets/hassanjbara/AI4MARS)

**Weather / environment**
- The Mars Climate Database (MCD) v6.1 web interface is at `www-mars.lmd.jussieu.fr/mcd_python/`. Users pick variables and set location, solar longitude (Ls) and local time. The web interface is for "moderate use only".
  - The full database (NetCDF files plus access software) is free on request through an online form.
  - A Python interface is on GitHub (aymeric-spiga/mcd-python).
  - Sources: [MCD access page](https://www-mars.lmd.jussieu.fr/mars/access.html); [MCD v6.1 web interface](https://www-mars.lmd.jussieu.fr/mcd_python/); [EPSC2024 MCD abstract](https://meetingorganizer.copernicus.org/EPSC2024/EPSC2024-516.html); [mcd-python GitHub](https://github.com/aymeric-spiga/mcd-python)

### Inferences
- For a 3 km EVA area, the 1 m merged DEM and 25 cm ortho are the right core. HiRISE DTMs from STAC add the FOM layer, which the merged DEM page does not mention. The FOM layer can drive the uncertainty overlay.
- THEMIS thermal inertia at 100 m gives only about 30×30 pixels over 3 km. Use it as a coarse "soft sand likelihood" prior, not as a precise boundary.
- The Robbins catalog stops at 1 km diameter. Inside a 3 km EVA box it adds almost nothing. Small craters must be found in the DEM or ortho itself.

### Gaps
- Not verified this session (prior knowledge, needs checking):
  - MOLA MEGDR (463 m at 128 ppd) download at PDS Geosciences.
  - The TES rock abundance map (Christensen / Nowicki & Christensen 2007).
  - THEMIS day/night IR global mosaics (100 m).
  - The dust cover index (Ruff & Christensen 2002).
  - USGS geologic maps: Tanaka et al. 2014 global map SIM 3292, and the Gale-specific 1:… map.
  - MARCI daily global weather maps (MSSS weekly weather reports).
  - The MEDA weather data in PDS Atmospheres.
  - RAD data in PDS PPI.
  - A current official mars.nasa.gov raw-image JSON endpoint (patterns such as `mars.nasa.gov/api/v1/raw_image_items/?mission=msl` and `mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json` are commonly used but were not confirmed).
- I did not find a direct download URL for the Robbins & Hynek CSV in this session. It is usually distributed via the USGS/PDS Annex or the author's site; verify.
- License: most NASA/USGS data are public domain (US government work). This is a general rule, not verified per dataset here, except Murray Lab CTX (free use, credit NASA/JPL/MSSS/The Murray Lab).

---

## 2. APIs and tools

### Takeaway
The most practical machine-readable entry points are:
- USGS STAC API: search for COGs, with HTTP range reads (no full download needed).
- PDS ODE REST API: product search.
- Mars Trek WMTS: ready-made web tiles.

The api.nasa.gov Mars Rover Photos API has been archived. Do not build on it without testing; use the mars.nasa.gov raw-image pages or community mirrors instead.

### Cited Findings
- **Mars Trek WMTS**: Trek layers use the OGC RESTful WMTS protocol. URL template: `https://{endpoint}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png`.
  - Some layers return .jpg instead. Read the `ResourceURL` in each layer's GetCapabilities XML.
  - A missing tile means there is no data coverage there.
  - At zoom level 1, a global product is 2 columns × 1 row.
  - Source: [Trek API doc (Mars)](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars)
- Example capabilities URL pattern (secondary source): `trek.nasa.gov/tiles/Mars/EQ/Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml`. — [community WMTS write-up via search result: nasa-open trek page](https://nasa-open.vercel.app/trek)
- api.nasa.gov also lists a Trek WMTS gateway that needs an API key (DEMO_KEY in examples) and has rate limits. — [api.nasa.gov mars-wmts catalog](https://api.nasa.gov/mars-wmts/catalog)
- **ODE REST API**: served at `oderest.rsl.wustl.edu`. The manual is a PDF (v2.1.6). It has a query endpoint for product search. — [ODE REST API help](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Additional_Resources/ODE_REST_API.htm)
- **USGS pygeoapi (OGC API – Features)**: serves HiRISE observation footprints (from PDS ODE) that can be queried by bbox. — [USGS pygeoapi HiRISE footprints](https://astrogeology.usgs.gov/pygeoapi/collections/mars/hirise-observation-footprints-equatorial)
- **USGS STAC API**: `https://stac.astrogeology.usgs.gov/api/`. Works with pystac-client and stac-client, and loads into QGIS. The CLI tutorial is marked as an in-progress draft. — [STAC tutorials](https://stac.astrogeology.usgs.gov/docs/tutorials/cli)
- **NASA Mars Rover Photos API**: api.nasa.gov says "The Mars Rover API has also been archived."
  - The underlying open-source project (corincerami/mars-photo-api) was archived on 8 Oct 2025.
  - Community alternatives exist, such as mars-vista-api (not official).
  - Sources: [api.nasa.gov header notice](https://api.nasa.gov/assets/html/header.html); [GitHub corincerami/mars-photo-api](https://github.blesdmm.dns-dynamic.net/corincerami/mars-photo-api)
- **JMARS** (ASU): desktop GIS with HiRISE DTM stamps and the CTX mosaic. — [JMARS](https://jmars.asu.edu/node/2844)

### Inferences
- Suggested stack for students:
  1. Python with pystac-client and rasterio/GDAL to clip COGs to the 3 km bounding box.
  2. numpy/scipy (or `gdaldem slope`) for slope and roughness.
  3. `gdal2tiles.py` or rio-tiler to make XYZ tiles.
  4. Leaflet or OpenLayers with a custom Mars CRS (or Cesium with a Mars ellipsoid) to display them.

  ISIS3 and Ames Stereo Pipeline are needed only to make NEW DTMs from raw stereo pairs. That is unnecessary here, because the area is already covered by the MSL merged DEM and HiRISE DTMs.

### Gaps
- Not verified this session (prior knowledge):
  - MMGIS is open-source on GitHub (NASA-AMMOS/MMGIS).
  - The Ames Stereo Pipeline (NASA, open-source) and ISIS3 (USGS) install via conda.
- Full Trek layer list for Gale: the API doc page does not list layer names. They must be read from GetCapabilities or the Trek layer browser.

---

## 3. How to derive hazards from the data

### Takeaway
Most hazards can be computed from the 1 m DEM and the 25 cm ortho with standard methods:
- **Slope** from the DEM with a 3×3 kernel, at multiple baselines (1 m, 2 m, ~5–10 m).
- **Roughness** as the standard deviation of detrended elevation, or terrain ruggedness.
- **Drop-offs** where local relief exceeds a threshold over a short distance.
- **Rocks** from HiRISE shadows (≥1.5 m only) or from a classifier trained on AI4Mars (rover-scale).
- **Sand** from thermal inertia plus ortho texture/albedo.

### Cited Findings
- HiRISE rock detection works only for rocks larger than about 1.5 m. Smaller rocks are estimated by extrapolating an exponential size-frequency model. — [Golombek et al. 2021](https://authors.library.caltech.edu/records/d1t32-akr32/files/Earth_and_Space_Science_-_2021_-_Golombek_-_Rock_Size_u2010Frequency_Distributions_at_the_InSight_Landing_Site_Mars.pdf?download=1); [Golombek MSL workshop talk](https://marsoweb.nas.nasa.gov/landingsites/msl/workshops/4th_workshop/talks/Golombek_Rocks_4th_Wkshp.pdf)
- SPOC (Soil Property and Object Classification) is an ML terrain classifier by Rothrock et al. It is deployed in Curiosity's ground operations. AI4Mars was built to improve SPOC with more and better labels. — [AI4Mars paper](https://openaccess.thecvf.com/content/CVPR2021W/AI4Space/papers/Swan_AI4MARS_A_Dataset_for_Terrain-Aware_Autonomous_Driving_on_Mars_CVPRW_2021_paper.pdf)
- AI4Mars classes are encoded as pixel values 0–3; soil and bedrock are among them. — [Zenodo](https://zenodo.org/records/15995036); [HF](https://huggingface.co/datasets/hassanjbara/AI4MARS)
- Orbital images cannot show exactly how steep a slope is or whether boulders are present. Curiosity planners use MRO images for a rough sense of the terrain and refine it with rover images. — [JPL: Curiosity rover adjusts route](https://www.jpl.nasa.gov/news/nasas-curiosity-rover-adjusts-route-up-martian-mountain)
- Perseverance's ENav builds a height map from navcam stereo disparity. It scores each cell on slope, roughness and traverse time, then checks candidate paths with the ACE (Approximate Clearance Evaluation) algorithm. — [macmyths explainer (secondary)](https://macmyths.com/how-engineers-plan-a-safe-route-for-a-mars-rover/); [MLNav arXiv 2203.04563](https://arxiv.org/pdf/2203.04563)
- Slope perception is unreliable for people: Apollo 16 astronauts estimated a crater slope at 60° when it was under 30°. This argues for computed slope maps. — [NASA NTRS 20090032975](https://ntrs.nasa.gov/api/citations/20090032975/downloads/20090032975.pdf) (via search summary)
- Sand dunes and loose sand: Gale moderate thermal inertia (250–410) means an indurated surface. Lower values suggest loose fines. — [Fergason et al. 2012](https://pubs.usgs.gov/publication/70038495)

### Inferences
- **Slope baseline matters.** Slope computed over 1 m cells catches step-like ledges. Slope over 5–10 m shows how hard walking uphill is. Make two layers.
- **Roughness:** fit a plane to a 5×5 m window, then take the RMS of the residuals. This needs only numpy.
- **Cliff/drop detection:** flag cells where maximum minus minimum elevation within 2 m is greater than 0.5–1 m (a student-chosen threshold, not a NASA standard). Also flag slope > 30–35° as "cliff".
- **Rock hazard from the 25 cm ortho:** with the sun angle in the label, dark shadow blobs give rock height ≈ shadow length × tan(sun elevation). This is the classic shadow-based method; it can be done in OpenCV.
- **Sand:** combine low thermal inertia, dark smooth texture in the ortho (low local variance), and CRISM where available. The Bagnold dunes are just north of the route.

### Gaps
- I did not retrieve the SPOC paper (Rothrock et al. 2016, AIAA SPACE) or exact SPOC class definitions this session.
- No source confirmed the rock-shadow equations or HiRISE rock-detection code (Golombek et al. 2012 automated rock detection). Treat these as prior knowledge.

---

## 4. Thresholds (rover, landing-site, human EVA)

### Takeaway
Hard numbers that are sourced:
- **Perseverance:** treats a wheel drop >35 cm (14 in) as a hazard.
- **InSight landing site:** required slopes <15° at 84 m and 2 m baselines, and rock abundance <10%.
- **Curiosity:** has climbed a 23° slope with sand and wheel-size rocks, at the edge of its comfort zone.
- **Human EVA:** Apollo crews mostly walked on slopes under about 15°. Apollo 15 reached about 17°. Recent lunar planning studies suggest keeping traverses under 20°.

No formal NASA "suited-walking slope limit" was found.

### Cited Findings
- Perseverance AutoNav marks a "wheel drop" hazard where a wheel could drop more than 14 inches (35 cm). It detected and went around a 35 cm rock on 15 July 2023. — [NASA PIA26073: Perseverance AutoNav avoids a boulder](https://science.nasa.gov/photojournal/perseverance-autonav-avoids-a-boulder/)
- ACE takes about 12 ms per check on the RAD750 processor. — [arXiv 2011.06022 (via search summary)](https://arxiv.org/abs/2011.06022)
- InSight landing-site constraints: slopes <15° at 84 m and 2 m length scales, and low rock abundance (<10%). — [Golombek et al. InSight rock SFD (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7507760)
- Curiosity faced "a sharp 23-degree incline, slippery sand, and wheel-size rocks" on the climb toward Jau, and needed a detour. Planners command Curiosity to stop if it meets surprises. — [NASA: Curiosity faces its toughest climb yet](https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-rover-faces-its-toughest-climb-yet-on-mars/)
- Curiosity drives stop as "faults" when wheel slip exceeds the per-drive limit or a wheel is raised too high by a rock. In May 2015, 3 of 4 drives exceeded the slip limit. — [JPL: Curiosity adjusts route](https://www.jpl.nasa.gov/news/nasas-curiosity-rover-adjusts-route-up-martian-mountain)
- Curiosity wheel damage sped up from October 2013. Sharp, embedded rocks can puncture the aluminum wheel skin. JPL added traction-control flight software in response. — [JPL Robotics, traction control paper (2018 IEEE Aerospace)](https://www-robotics.jpl.nasa.gov/media/documents/2018-ieee-aerospace-trctl.pdf)
- Apollo astronauts climbed up to 150 m and walked on slopes <15°. — [EPSC2024-196](https://meetingorganizer.copernicus.org/EPSC2024/EPSC2024-196.html)
- Apollo 15 traversed slopes of about 17°. — [NASA NTRS 20090032975](https://ntrs.nasa.gov/api/citations/20090032975/downloads/20090032975.pdf)
- Lunar south-pole study: traverses should stay on slopes <20°, within about 2 km of the lander. — [Universe Today](https://www.universetoday.com/163783/lunar-astronauts-will-need-easy-walking-trails-around-the-moons-south-pole/)
- Suited energetics (Carr & Newman):
  - In space suits, running is likely more efficient per unit mass and distance than walking in reduced gravity.
  - High walking cost is attributed to joint torques in the suit.
  - These studies do NOT give slope limits.
  - Sources: [Carr PhD thesis MIT 2005](https://dspace.mit.edu/handle/1721.1/33088); [SAE 2005-01-2970](https://saemobilus.sae.org/papers/running-efficient-walking-a-space-suit-2005-01-2970); [Carr & Newman 2017 Exoskeleton Energetics](https://web.mit.edu/aeroastro/www/people/dnewman/pdf2/Exoskeleton%20Energetics_2017.pdf)
- Walk-back limits: Olthoff (2018, ICES) gives a dynamic walk-back limit calculation and finds the Apollo 17 walk-back limit conservative. NASA's 2007 Walkback Test studied a suited 10 km walk back. — [TTU repository: EVA Walk-Back Limit Calculation](https://ttu-ir.tdl.org/handle/2346/74208); [SAE 2007-01-3133](https://saemobilus.sae.org/content/2007-01-3133)

### Inferences
- **Suggested student classes** for suited walking slope (5–10 m baseline):
  - 0–10° safe
  - 10–15° caution (Apollo norm)
  - 15–20° hard (near Apollo 15 maximum and lunar planning limit)
  - 20–30° dangerous
  - more than 30° no-go (cliff/scarp)

  These are a synthesis of the sources above, NOT an official NASA standard. They should be labeled as such.
- **Rock/step hazard for walking:** borrow the 35 cm Perseverance wheel-drop number as a rough "step-down" hazard (about knee height). Mark it as borrowed from rover engineering.
- **Walk-back:** the "don't get lost" feature should show the distance and estimated time back to the base/rover along the safest path. That connects directly to the walk-back limit concept.

### Gaps
- Not found with sources this session:
  - Curiosity's official design slope/tilt limits. Prior knowledge: rocker-bogie static stability ~45° tilt, operations typically avoid more than ~20–30°, and obstacle capability about wheel-diameter size (~50 cm). Unverified.
  - The Mars 2020 landing-site engineering thresholds.
  - The Mars 2020 slope maps used for TRN are mentioned but numbers were not retrieved; see [USGS PDF: Guiding Rovers for Safe Mars Exploration](https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/atoms/files/Guiding%20Rovers%20for%20Safe%20Mars%20Exploration.pdf).
- No primary NASA document found that sets a formal maximum slope for suited walking on Mars. Grade-dependent metabolic cost studies (e.g., NASA JSC suited incline treadmill tests) were not retrieved.

---

## 5. Combining layers into a safety score

### Takeaway
Use a simple, explainable weighted-overlay (multi-criteria) model:
1. Normalize each hazard to 0–1 (0 = safe, 1 = dangerous).
2. Apply hard "no-go" masks (cliffs, slope >30°, large rocks).
3. Take a weighted sum for the rest.
4. Use the result as a cost map for path-finding.

This mirrors how rover planners use cost/goodness maps. ENav, for example, scores cells by slope, roughness and time.

### Cited Findings
- ENav assigns each map cell a cost from slope, roughness and time-to-traverse, then searches for the cheapest path. ACE then checks the top candidates against hard safety limits. — [MLNav arXiv 2203.04563](https://arxiv.org/pdf/2203.04563); [explainer (secondary)](https://macmyths.com/how-engineers-plan-a-safe-route-for-a-mars-rover/)
- Orbital slope models give a broad warning; local stereo maps refine it. This is a two-scale model. — [explainer (secondary)](https://macmyths.com/how-engineers-plan-a-safe-route-for-a-mars-rover/)
- Mars 2020 was the first rover to carry onboard hazard maps, made from MRO imagery, for landing decisions. — [USGS: Guiding Rovers for Safe Mars Exploration](https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/atoms/files/Guiding%20Rovers%20for%20Safe%20Mars%20Exploration.pdf)

### Inferences
Proposed formula (student design):

`score = 1 − (0.40·S_slope + 0.20·S_rough + 0.20·S_rock + 0.15·S_sand + 0.05·S_unc)`, set to 0 wherever a no-go mask applies.

- Each S term is a piecewise-linear "fuzzy" membership. For example, S_slope = 0 at 10° or less, rising linearly to 1 at 25°.
- **Path cost** = distance × (1 + k·(1 − score)), with no-go = infinite. Run A* or Dijkstra on a 1–2 m grid (3 km × 3 km at 2 m ≈ 2.25 M cells, which is fine in a browser Web Worker).
- **Metabolic option:** replace the distance term with walking-energy cost as a function of grade.
- **Uncertainty:**
  - Use the HiRISE DTM FOM layer, or a flag for where the merged DEM fell back to CTX/HRSC/MOLA, as S_unc.
  - Also show it as hatching on the map.
  - The THEMIS ±20% accuracy shows up as a blurred (100 m) sand-likelihood layer.

### Gaps
- No source for JPL GESTALT goodness map parameters was retrieved this session. Prior knowledge: GESTALT (used on MER/MSL) assigns per-cell "goodness" from step, tilt and roughness. Unverified.
- No sourced MCDA weight values for planetary EVA exist that I found. The weights above are illustrative.

---

## 6. Visualization and pipeline architecture (position → route display)

### Takeaway
Do all heavy processing offline in Python, so the browser only displays tiles and runs path-finding:
1. **Download:** STAC/ODE/USGS.
2. **Clip to the AOI:** rasterio/GDAL.
3. **Compute layers:** slope, roughness, rocks, sand, uncertainty.
4. **Score:** combine into the safety score.
5. **Export:**
   - Color XYZ tiles with gdal2tiles.
   - A low-resolution cost grid as a binary file or PNG.
   - Waypoints as GeoJSON.
6. **Web client:** Leaflet/OpenLayers/Cesium shows the layers, runs A* on the cost grid, and draws the route back to base from the estimated position.

### Cited Findings
- Trek tiles follow WMTS. Any WMTS-capable client needs only the endpoint and extent, so Leaflet/OpenLayers/Cesium can use Trek basemaps directly. — [Trek API doc](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars)
- USGS STAC assets are COGs designed for efficient remote access (HTTP range requests), so only the 3 km window needs downloading. — [USGS STAC HiRISE uncontrolled](https://stac.astrogeology.usgs.gov/docs/data/mars/uncontrolled_hirise/)
- QGIS can load STAC search results for visual checking before export. — [STAC QGIS tutorial](https://stac.astrogeology.usgs.gov/docs/tutorials/find_data_and_qgis_load)

### Inferences
- **Legend and colors:** use a colorblind-safe sequential or diverging ramp (e.g., green→yellow→orange→red, plus a purple/black "no-go"). Show the class boundaries in degrees and centimeters.
  - Draw uncertainty as hatching or reduced opacity, not as a separate color, so the safety color stays readable.
  - State that thresholds are student-chosen and the data date (HiRISE acquisitions, DEM v3).
- **Position estimate:** Mars has no GPS. Show the astronaut's position as a circle whose size is the position uncertainty (e.g., from dead-reckoning plus landmark matching).
  - Compute routes from the circle's worst-case cell.
  - Use the Curiosity waypoints JSON (MMGIS) as named landmarks for "you are near X".
- **Weather overlay:** REMS (current) plus MCD (seasonal climatology for the chosen Ls/local time). Show it as a side panel rather than a map layer, because it is one value for the whole 3 km area.

### Gaps
- Not checked: whether Leaflet/OpenLayers handle Mars equirectangular (IAU 49900 / 49911) projections without a custom CRS (proj4leaflet). Prior knowledge says a simple equirectangular CRS works for a small area. Unverified.
- Licensing/credit lines for each layer should be collected from each USGS product page before the final presentation.
