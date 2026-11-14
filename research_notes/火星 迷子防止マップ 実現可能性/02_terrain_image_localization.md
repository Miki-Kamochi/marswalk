# Terrain/Image-Based Localization on Mars (horizon/skyline matching, orbital-image matching, TRN) vs. Other Methods

Scope note: Notes are in English for the report writer. Maturity labels used throughout: **[OPERATIONAL]** = used in real missions on Mars/Moon; **[FIELD-TESTED]** = tested with real hardware on Earth analog sites or on real mission data offline; **[RESEARCH]** = simulation / academic only. Current as of Nov 2026.

---

## Q1. Does horizon/skyline matching exist, and is it used operationally by NASA?

### Takeaway
Yes, horizon/skyline matching is a real research area going back to the 1990s (CMU lunar rover work) and was field-tested by NASA Ames/CMU in 2014, but it has **never been used operationally** on Mars or the Moon. What NASA actually uses operationally is (a) Terrain-Relative Navigation during landing (Perseverance 2021) and (b) since Feb 2026, onboard **orbital-image matching of rover panoramas** ("Mars Global Localization") on Perseverance — which matches the *ground around the rover seen from above*, not the horizon line. JPL's own paper says horizon methods typically reach only ~100 m (best ~10 m) accuracy, which is why they chose a different approach.

### Cited Findings

**Historical / research skyline-matching work**
- Cozman & Krotkov (CMU, 1996 WACV / 2000 Autonomous Robots "Viper" system): interface detects mountain formations in rover images and automatically searches for matching mountain peaks in a topographic map; tested on real images from Pittsburgh East and Dromedary Peak USGS quadrangles and on lunar imagery incl. the Apollo 17 site; authors claim accuracy "greatly surpass[es] previous work" but no numeric figure was found in accessible abstracts — [CMU RI](https://ri.cmu.edu/?p=14261); [Autonomous Robots DOI](https://unpaywall.org/10.1023%2FA%3A1008966317408) **[FIELD-TESTED on Earth imagery / Apollo images]**
- Krotkov et al. 1994 also studied sun-based position estimation (intersecting circles of equal altitude from sun observations at different times, like a sextant) — [Search summary of CMU RI pubs](https://ri.cmu.edu/publications/stereo-driving-and-position-estimation-for-autonomous-planetary-rovers)
- Nefian et al. 2014 (NASA Ames / CMU / Univ. Nevada Reno), "Infrastructure Free Rover Localization" (i-SAIRAS 2014): combines **stereo visual odometry + 3D terrain matching against a HiRISE-style orbital DEM + horizon curve matching**. Tested on a **3 km traverse** of a prototype rover at **Basalt Hills State Park, California** (avg speed 0.8 m/s, images at 2 Hz) with GPS-INS as ground truth. Result: "localization error is reduced by over **60%** compared to the wheel odometry solution." — [Nefian et al. i-SAIRAS 2014 PDF](https://www.cse.unr.edu/~bebis/isairas14.pdf) **[FIELD-TESTED, Earth analog]**
  - Details: horizon detected via a Bayesian sky/ground segmentation using gray-level intensity + local edge density (3×3 Sobel, 7×7 window), per image column, then smoothed. Horizon rendered by OpenGL from a combined DEM: 0.8×0.8 km at **1 m/post** high-res + 10×10 km at **9 m/post** low-res (needed so distant ridges appear in the rendered horizon; fits ~1 GB GPU memory). Stereo point clouds limited to 30 m range. Full pose computed only every **300 frames** due to compute limits. — same source
  - The paper's Fig. 1 shows MSL (Curiosity) navcam DEMs aligned over HiRISE DEM, motivating the work; the paper notes NASA "typically relies on tedious manual matching of rover camera views and orbital terrain maps." — same source. Note: I found no source confirming Nefian et al. ran the full system on Curiosity data with a reported error-reduction number; the 60% figure is from the California field test.
  - Related: Nefian/Bouyssounouse 2016 NTRS paper estimates rover *orientation* by matching detected horizon curves to horizons rendered from prior 3D terrain maps — [NTRS 20160011500](https://ntrs.nasa.gov/api/citations/20160011500/downloads/20160011500.pdf); ICIP 2014 "Planetary Rover Localization within Orbital Maps" — [UNR PDF](https://www.cse.unr.edu/~bebis/icip14.pdf)
- Chiodini et al. 2017 (Univ. Padova), "Mars rovers localization by matching local horizon to surface digital elevation models" (IEEE MetroAeroSpace): used MER rover panoramas, extracted skyline, brute-force matched to DEM-precomputed skylines with Euclidean distance — cited in [SpaceOps 2025 paper ID 176](https://publications.spaceops.org/2025/download_by_id.php?id=0176) **[RESEARCH on real Mars images]**
- JPL also has a paper on skyline matching using HiRISE-based rendering ("Toward Autonomous Localization of Planetary Robotic Explorers…") and "Topographical Landmarks for Ground-Level Terrain Relative Navigation on Mars" — [JPL PDF 1](https://www-robotics.jpl.nasa.gov/media/documents/Toward_Autonomous_Localization_of_Planetary_Robotic_Explorers_by_Relying_on_Se_JoTX19T.pdf); [JPL PDF 2](https://www-robotics.jpl.nasa.gov/media/documents/Topographical_Landmarks_for_Ground-Level_Terrain_Relative_Navigation_on_Mars.pdf) (numbers not extracted)

**NASA Goddard lunar horizon navigation (Alvin Yew)**
- 2022 NASA Goddard tech page: Alvin Yew's AI system renders synthetic horizon panoramas from **LRO LOLA** elevation data and matches explorer photos to them; target ground accuracy **< 30 ft (9 m)**; planned to use **GIANT** (Goddard Image Analysis and Navigation Tool); could become a handheld device for astronauts; described as a **backup**, not primary, system — [NASA Goddard](https://www.nasa.gov/technology/goddard-tech/ai-nav-using-landmarks-on-the-moon/); [phys.org](https://phys.org/news/2022-12-nasa-ai-lunar-surface-landmarks.html) **[RESEARCH]**
- Follow-up paper "Monocular Horizon Navigation" (Driessen, Kaki, Liounis, McGann, McKee, Tennenbaum, Yew; NASA GSFC/JSC, CMU, Georgia Tech; Space Imaging Workshop, Oct 2024): single image of part of the horizon + star-tracker attitude + LOLA DEM → Perspective-n-Point (PnP) pose solve. Results (simulation only): per-image position std. dev. **below 100 m**, orientation ~1°; one example converged from **~400 m** prior error to **~73 m**; with an EKF filter, "position errors of **50 meters or better**". Conclusion: "promising for positioning astronauts and robotic systems on the lunar surface with **10s of meters** of accuracy." — [NTRS PDF](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf) **[RESEARCH, simulation]**
  - Stated limitations: "this is **not a 'lost-on-the-Moon' solution**" — requires a prior position (~100 m 1σ) and accurate attitude (camera pointing needed to ~20–30 arcsec ≈ 0.006–0.008°); errors largest **along the camera boresight** (cameras give poor depth); "still does rely on favorable illumination conditions." DEM used in batch tests: 256 px/deg ≈ **118 m** resolution. — same source
  - Proposed hardware: monocular camera, single-board computer (e.g., Jetson Nano, Raspberry Pi CM4, SpaceCube 3 Mini-Z), IMU; a stand-alone unit for rover or spacesuit; existing EVA body cameras probably not usable — same source

**Newer (2023–2026) skyline papers**
- Abdoli et al., SpaceOps 2025 (Cal State Fullerton), "Machine Learning Techniques in Autonomous Localization Based on Surrounding Terrain Outlines": lunar, simulation. 12 km × 12 km region, 304×304 grid (**40 m/cell → 92,416 candidate positions**). Brute-force correlation "provides good accuracy" but "fails in… computational time, onboard memory, and storage"; at 0.5 m grid step brute force would need **~2.1×10¹² inner products and >1 TB** of database. Tested PCA/FFT compression, K-means, logistic regression, LDA, QDA, CNN — "CNN consistently outperforms other methods" (preliminary) — [SpaceOps 2025 PDF](https://publications.spaceops.org/2025/download_by_id.php?id=0176) **[RESEARCH]**
- Other recent works cited there: Lee & Cheung, "A Novel Autonomous Lunar Self-Localization Technique Based on Local Surrounding Horizon Mask," IEEE Aerospace 2024; Tian, Zhang, Hu, "Global Localization Technology of Lunar Rover by Horizon Line Matching," IEEE TAES 60(6) 2024 (RGB-D camera, feature-level horizon matching vs DEM); Chen et al. 2024 and Zhao et al. 2024 (cross-view rover–orbital image matching for lunar rovers) — [SpaceOps 2025 PDF refs](https://publications.spaceops.org/2025/download_by_id.php?id=0176); [BIT pure](https://pure.bit.edu.cn/en/publications/global-localization-technology-of-lunar-rover-by-horizon-line-mat/) **[RESEARCH]**
- ESA ALPER (Germa et al., ASTRA 2023, "Vision based Absolute Localisation for Planetary Exploration Rovers"): the search snippet states it notes that "skyline matching techniques do not achieve a sufficient level of accuracy on their own," motivating combined approaches — [ESA ASTRA 2023 PDF](https://robotics.estec.esa.int/ASTRA/Astra2023/2023%20PAPERS/16_Germa_ALPER%20Vision%20based%20Absolute%20Localisation%20for%20Planetary%20Exploration%20Rovers.pdf) (full text could not be fetched — certificate/login error; numbers unverified)
- NASA JSC survey (McKee, AAS 25-173, Jan 2025): skyline-based navigation is "actively researched at NASA JSC and GSFC"; "These techniques are promising, but have **only been studied in theoretical and academic contexts**." Describes *coarse* skyline lookup (lost-on-the-Moon, accuracy limited by spacing of reference points, "possibility of a false-positive match is non-negligible") and *fine* skyline refinement (render expected skyline at a guessed pose and correct it) — [NTRS 20250000720](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)

**JPL's assessment of horizon methods (key quote)**
- "Horizon-based approaches match the local horizon to surface digital elevation models… Accuracy is typically on the order of **100m, at best 10m**. These methods are valuable for orientation estimation, but their accuracy does not match the position accuracy requirements of a typical Mars rover mission scenario." — [Nash et al., JPL, "Censible" global localization paper](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_ICRA.pdf)

**What IS operational**
- **Perseverance Lander Vision System (LVS) / Terrain-Relative Navigation, Feb 2021** **[OPERATIONAL, landing only]**: During descent, camera images matched to an onboard orbital map (built from HiRISE/CTX). LVS requirement: position knowledge within **40 m**; post-flight: estimate produced in ~10 s with only a few metres error; overall touchdown ~**5 m** from target vs **60 m** touchdown requirement; inertial-only navigation could have drifted up to **~3.2 km** — [Yang, Ansar, Johnson et al., Earth and Space Science 2021](https://zendy.io/title/10.1029/2020ea001560); [NTRS 20230007014](https://ntrs.nasa.gov/citations/20230007014); [JPL TRN page](https://robotics.jpl.nasa.gov/what-we-do/flight-projects/mars-2020-rover/terrain-relative-navigation). Pre-flight simulated tests: errors < 20 m — [Air & Space/Smithsonian](https://www.smithsonianmag.com/air-space-magazine/land-right-here-180973966/). (Note: some numbers came via search summaries; 5 m figure described as an estimate.)
- **Ground-based manual localization (all Mars rovers, ~2004–present)** **[OPERATIONAL]**: rover drives until odometry uncertainty grows, takes a 360° panorama, humans on Earth match it to HiRISE orbital map; accuracy of this hand alignment ~**0.5 m** (limited by orbital map); takes **a day or more** — [Nash et al. JPL](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_ICRA.pdf); [JPL news Feb 2026](https://www.jpl.nasa.gov/news/nasas-perseverance-now-autonomously-pinpoints-its-location-on-mars/)
- **Perseverance onboard "Mars Global Localization" (Censible algorithm)** **[OPERATIONAL since Feb 2, 2026]**: first used in regular operations Feb 2, 2026 (at "Mala Mala", Jezero crater rim) and again Feb 16, 2026; locates the rover to **~25 cm** in **~2 minutes**; tested on 264 past rover stops and found the correct position every time; runs on the Helicopter Base Station processor (a mid-2010s smartphone chip, >100× faster than the 1997-era radiation-hard main computers, 1 GB memory; ~25 bits of memory found damaged, so results are run several times and cross-checked by the main computer). Before this, visual odometry error on long drives could exceed 100 ft (up to ~35 m) — [JPL news, Feb 18 2026](https://www.jpl.nasa.gov/news/nasas-perseverance-now-autonomously-pinpoints-its-location-on-mars/); [NASA PIA26705](https://www.jpl.nasa.gov/images/pia26705-mars-global-localization-pinpoints-perseverances-location/); 2026 memory-workaround paper: [JPL IEEE Aero 2026](https://www-robotics.jpl.nasa.gov/media/documents/2026_Global_Localization_Memory_Workaround_IEEE_Aero__final.pdf); 2024 IEEE Aerospace paper (Verma, Nash): [JPL PDF](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_IEEE_Aero.pdf)
  - Discrepancy note: the ICRA PDF on JPL's site is titled "Censible: A Robust and Practical Global Localization Framework for Planetary Surface Missions" (Nash, Dwight, Saldyt, Wang, Myint, Ansar, Verma) with a ©2023 notice; the filename says "2024 ICRA"; Universe Today attributed figures to "Nash et al. 2026". The 264-panorama, 0.36 m result is confirmed from the PDF text itself.

### Inferences
- For the student team: "matching photos to orbital terrain data" is **validated and operational in 2026** — but the winning approach is *looking down at nearby ground* (stereo panorama → top-down mosaic → match to HiRISE), not *matching the far horizon silhouette*. Horizon matching is a credible **coarse / backup** method (tens to ~100 m) and a good heading (direction) source.
- No astronaut has ever used any of these methods; all astronaut-specific horizon work (Goddard/JSC) is simulation-stage.

### Gaps
- Exact numeric accuracy of Cozman & Krotkov (1996/2000) and Stein & Medioni (1995) not found in accessible text.
- Full ALPER (ESA) numbers not retrieved (site access failed).
- No source found confirming Ingenuity actually flew map-relative navigation; Censible paper only notes Ingenuity/Sample Retrieval Helicopters "require absolute position estimation" (future need). Mars Science Helicopter map-based nav (2022 IEEE Aerospace, cited in Censible refs) not examined.

---

## Q2. How does the matching work, step by step (plain language), and what does it cost computationally?

### Takeaway
Two families: (A) **skyline/horizon matching** — "compare the outline of the mountains you see with outlines a computer draws from a 3D map at many candidate spots"; (B) **orbital-image (top-down) matching** — "turn your 360° stereo photos into a bird's-eye picture of the ground around you and slide it over the satellite photo until it fits." Both are made fast by first using odometry to narrow the search area and a sun/star sensor to fix heading.

### Cited Findings

**(A) Skyline/horizon matching — steps**
1. Take a panorama (or one image) of the horizon. — [McKee survey NTRS](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
2. Extract the skyline: segment each image column into sky vs ground (e.g., Bayesian model using brightness + edge density, Sobel edges) and smooth the line — [Nefian et al. 2014](https://www.cse.unr.edu/~bebis/isairas14.pdf); subpixel limb detection ~0.1 px accuracy in Goddard sim — [Driessen et al. NTRS](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf)
3. From the orbital DEM, render the skyline expected at each candidate position (needs a wide-area DEM so distant ridges appear; Nefian used 10×10 km at 9 m + 0.8×0.8 km at 1 m) — [Nefian et al. 2014](https://www.cse.unr.edu/~bebis/isairas14.pdf)
4. Compare observed vs rendered skyline (Euclidean distance / correlation; or PnP on matched points) and pick the best — [SpaceOps 2025](https://publications.spaceops.org/2025/download_by_id.php?id=0176); [Driessen et al.](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf)
5. Optionally refine iteratively (render at new guess, re-match) — "coarse" lookup then "fine" refinement — [McKee survey](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
- Key property: a 360° skyline is "(in theory) unique to an observer's position and invariant to heading" (like a fingerprint), but "No analytical relationship allows for position to be deduced… a look-up table of many pre-rendered skylines can be used" — [Driessen et al.](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf)
- Compute scaling: grid spacing drives cost quadratically. 12×12 km at 40 m → 92,416 skylines; at 0.5 m → ~2.1×10¹² inner products and >1 TB database → infeasible onboard without ML compression or a prior — [SpaceOps 2025](https://publications.spaceops.org/2025/download_by_id.php?id=0176)
- Because the horizon is far away, coarser DEMs suffice (LOLA globally adequate for horizon nav) compared with near-field methods like crater navigation — [Driessen et al.](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf)

**(B) Orbital-image matching (Perseverance "Censible") — steps**
1. Get absolute heading first (sun finding, star sighting or gyrocompassing), so the search is only 2D shift (east/north). — [Nash et al.](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_ICRA.pdf)
2. Take a 360° panorama of stereo pairs (red channel, closest to HiRISE red/NIR). — same
3. Radiometric correction (fix vignetting etc.), stereo matching (semi-global matching), keep points 3–40 m away, project to a top-down 25 cm grid ("orthomosaic") + local elevation map. — same
4. Crop the orbital map (HiRISE 0.25 m image, 1.0 m DEM) around the odometry estimate (e.g., 30 m search radius). — same
5. Slide the rover mosaic over the map; score each offset with a **modified census transform** (compares each pixel only as "brighter/darker than neighbours", so it ignores lighting differences; a third "missing" category for hidden areas) plus elevation SSD; pick best, subpixel refine; correct map-projection scale (~1 m per 500 m east-west). — same
- Compute: on flight-identical Snapdragon 801 co-processor: **36 s** (1 stereo pair) to **81 s** (5 pairs), **<1 GB** RAM; binary only **744 KB** (small for uplink) — same

### Inferences
- Plain analogy for students: skyline = "recognizing where you are from the shape of the mountains on the horizon" (like recognizing Mt. Fuji's silhouette from a particular town); top-down matching = "doing a jigsaw puzzle: fitting a piece (your surroundings) into the big picture (satellite photo)."
- A phone-class processor is sufficient if the search area is narrowed (tens of metres); global "lost anywhere" search is the expensive case.

### Gaps
- No specific timing numbers for horizon rendering on embedded hardware found (Nefian's system ran full pose only every 300 frames due to resource limits).

---

## Q3. Accuracy numbers and dependence on DEM resolution, terrain, lighting, ambiguity

### Takeaway
Top-down orbital matching on real Mars data: **0.36 m average, 1.07 m max** (264 panoramas). Horizon-based: **~10–100 m** typical; Goddard sim ≤50 m filtered. Accuracy degrades with coarser maps, fewer images, shorter stereo range, low-feature terrain, and poor lighting; similarity measures that are not lighting-robust fail badly (~25 m errors, most outliers).

### Cited Findings
- Censible results (264 Perseverance navcam panoramas over 2.5 years, Jezero crater): avg error **0.36 m**, 99th percentile **0.93 m**, max **1.07 m**, **0/264** errors >5 m (5 m = Perseverance requirement for global localization); mode ≈ 1 map pixel (0.25 m). Human expert hand-alignment accuracy ~0.5 m. — [Nash et al.](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_ICRA.pdf)
- Same dataset with other similarity measures: masked NCC avg **24.97 m**, 225/264 outliers; mutual information **24.33 m**, 216/264 outliers; removing census scores → 14.17 m avg, 185/264 outliers. → lighting/appearance differences between ground and orbital views are the main difficulty. — same
- Map resolution sensitivity: orbital map 25 cm → 0.36 m; 50 cm → 0.48 m; **100 cm → 0.71 m** avg error (still 0 outliers). — same
- Coverage sensitivity: 1 stereo pair → 0.88 m avg but 99%-tile 20.09 m, 6/264 outliers; max stereo range 10 m → 0.69 m avg, 3/264 outliers. Image resolution down to 320×240 barely matters; 80×60 → 4.17 m avg, 46/264 outliers. Search radius up to 100 m fine; 150 m → 1/264 outlier. — same
- Feature-based methods (SIFT, craters, rocks) "struggle in low feature terrain that the rovers often drive through" — same
- Horizon methods: typically ~100 m, best ~10 m — same
- Goddard lunar horizon sim: per-image std dev <100 m; filtered ≤50 m; DEM ~118 m/pixel; errors largest along viewing direction (depth unobservable); x-translation strongly coupled with yaw (moving sideways looks like turning) — [Driessen et al.](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf)
- Terrain distinctiveness: "a mountain range in the distance provides far more information about the observer's position than a flat plain"; an operator can choose a well-lit, informative part of horizon — same
- Ambiguity: coarse skyline lookup has a non-negligible false-positive match risk — [McKee survey](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
- Human visual navigation fails on self-similar terrain: Apollo 14 crew could not find Cone crater, overestimated distances; later analysis showed they were within **~30 m** of the rim when they turned back; lunar surface "plays tricks on" the eye (self-similarity, extreme lighting, no sense of scale) — same
- Lighting: lunar south pole lighting "highly unfavorable"; opposition effect can obscure crater rims; skyline measurement errors lead to localization errors — [Driessen et al.](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf). Shadow-robust lunar crater methods exist (ShadowNav, LunarNav, IEEE Aero 2023) — cited in same paper.
- Nefian: beyond stereo range, ground-vs-satellite features are hard to match due to resolution, viewing angle, illumination, unknown albedo; horizon "frequently remains a discriminant visual feature" — [Nefian et al. 2014](https://www.cse.unr.edu/~bebis/isairas14.pdf)
- Mars DEM resolution reference: HiRISE image 0.25 m/pixel, HiRISE DEMs 1 m posts (from stereo) — [Nash et al.](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_ICRA.pdf). (CTX ~6 m image / ~18–20 m DTM and MOLA ~463 m gridded: not verified in this pass — see Gaps.)

### Inferences
- With only MOLA (hundreds of metres/pixel) a horizon match could probably give only very coarse (km-scale) location; HiRISE DTMs only cover small patches of Mars, so where astronauts land the map quality is decisive.
- Near-field (parallax) issue: nearby boulders/hills that are not in the DEM (too small) can block the true horizon and create false skyline features; Nefian and Censible both handle near range with stereo instead.
- Repetitive terrain (dune fields, flat plains) is a predictable failure mode for skyline matching (flat horizon = no information).

### Gaps
- No quantified study of skyline accuracy vs. DEM resolution (HiRISE vs CTX vs MOLA) on Mars was found.
- No explicit dune-field ambiguity study found.
- CMU lunar shadow paper not retrieved.

---

## Q4. Failure in dust / low visibility

### Takeaway
I found **no study that quantifies skyline or orbital-matching performance during Martian dust storms or haze.** All camera methods need visible terrain/horizon; distant horizons are the first thing lost in haze, so horizon matching is likely more vulnerable than near-field top-down matching.

### Cited Findings
- Censible: panoramas within ~10 minutes of each other; "variations in dust optical depth and sun elevation did not have a significant" effect within its dataset (normal Jezero conditions, mostly afternoon) — [Nash et al.](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_ICRA.pdf)
- Goddard horizon method "still does rely on favorable illumination conditions which may not be achievable in all situations" — [Driessen et al.](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf)
- LiDAR works in all lighting conditions (stereo cameras have more range under good lighting); local LiDAR DEM can be matched to orbital DEM "like a puzzle piece" — [McKee survey](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)

### Inferences
- In dust storms: rely on IMU/step counting + radio ranging; use terrain matching once visibility returns. Night: camera methods fail without lighting; LiDAR or radio needed.

### Gaps
- No quantitative dust-visibility vs localization study found for Mars.

---

## Q5. Other methods and sensor fusion; astronaut navigation studies

### Takeaway
All real planetary navigation is **fusion**: relative sensors (wheel/step odometry, IMU, visual odometry) drift with distance/time and must be periodically "reset" by absolute fixes (sun/star for heading; orbital map matching, radio, or human-in-the-loop for position). For astronauts on foot, foot-mounted IMUs give ~1–3% of distance travelled error; Apollo relied on a simple gyro + odometer + sun-shadow device + eyes and maps.

### Cited Findings
**Apollo LRV** **[OPERATIONAL 1971–72]**
- Gyro heading + wheel odometers; console showed range and bearing to the Lunar Module; heading aligned with a **sun-shadow device** (solar compass); requirements: bearing to LM ±6°, range to LM ±600 m, distance travelled ±2%; met on Apollo 15, 16, 17; gyro "virtually did not drift" on Apollo 15; max planned distance from LM 9.5 km — [McKee survey NTRS](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
- No compass works on the Moon (weak magnetic field, too slow spin for gyrocompass) — heading must come from IMU realigned with stars/sun. Earth VLBI radio tracking of LRV S-band transmitter located it after the fact to ~25 m — same. (Mars also lacks a global magnetic field — general knowledge, not sourced here.)

**Mars rovers** **[OPERATIONAL]**
- Sojourner: wheel encoders + gyro; gyro heading drift ~13°/sol — [McKee survey](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
- Opportunity, sol 446: commanded 50 m, wheels spun, visual odometry showed only **2 m** actual motion (wheel slip) — same
- MER/MSL/M2020 point NavCams at the Sun to re-fix heading ("sun finding") — same; [Nash et al.](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_ICRA.pdf)
- Perseverance: autonav evaluated 88% of distance driven; longest drive without human review 699.9 m over 3 days; drives cut short by growing position uncertainty — [Nash et al.](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_ICRA.pdf). VO errors could exceed 100 ft (~35 m) on long drives — [JPL news 2026](https://www.jpl.nasa.gov/news/nasas-perseverance-now-autonomously-pinpoints-its-location-on-mars/)
- VIPER design: zenith-facing star tracker to correct IMU drift (Sun near horizon at south pole) — [McKee survey](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)

**Sun sensing**
- Sun-based heading for Mars rovers: precision **0.28–0.97 arcmin** (1σ) in a 2018 study — [Advances in Astronomy 2018 (DOAJ)](https://doaj.org/article/c53829c044c648d2a04ea51898d12b09); CMU sun tracker: well within 1° roll/pitch/yaw, no drift; FIDO trial: 3–4× better heading than incremental odometry — [CMU RI](https://www.ri.cmu.edu/publications/a-sun-tracker-for-planetary-analog-rovers) **[FIELD-TESTED]**
- Celestial position (star tracker + gravity "down"): Earth test ~421 m error; ~125 m projected for Moon (Amert et al.) — [McKee survey](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf) **[FIELD-TESTED on Earth]**

**Astronaut on-foot navigation**
- ZUPT (zero-velocity update) foot-IMU dead reckoning for astronauts, field-tested in park and desert incl. walking and hopping: **1.5–2.3%** of distance — [ISPRS Archives 2014 (Sun et al.)](https://isprs-archives.copernicus.org/articles/XL-4/239/2014/) **[FIELD-TESTED]**
- Foot-mounted IMU in desert analog: 107 m loop → 1.2 m (~1%) avg error; **4.8 km traverse → 134.1 m (~3%)**, closure error 24.4% — cited in [Reimeir et al., Sensors 2025, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12349493)
- AMADEE-24 Mars analog (Armenia, Mar 2024): astronaut full-body IMU motion capture median error **2.13 m** (mean 2.42 ± 1.38 m); rover LiDAR SLAM 1.50 m median; LiDAR detection of astronaut from rover 5.63 m median; reference GPS CEP 2.5 m; walks ~0.4–1.7 km — [Reimeir et al. 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12349493) **[FIELD-TESTED, analog]**
- Draper Wearable Kinematic System (vision-aided) tested at NASA JETT3 (Flagstaff, Oct 2022) in mockup suits; "navigated well… despite low lighting angles" (qualitative) — [Georgia Tech SEAL thesis/presentation](https://seal.ae.gatech.edu/sites/default/files/2024-09/MarioCourtney.pdf) **[FIELD-TESTED]**

**Radio / infrastructure**
- LunaNet / LCRNS (lunar GPS-like services) promising but need "significant near and long term investments" and phased deployment; coverage may be limited — [Driessen et al.](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf) **[IN DEVELOPMENT]**
- Mars: MRO Electra UHF relay radio can measure Doppler to pin down a lander/rover location — [Wikipedia Electra](https://en.wikipedia.org/wiki/Electra_(radio)); [IEEE Spectrum](https://spectrum.ieee.org/mars-gets-broadband-connection) (no accuracy figures found) **[OPERATIONAL capability, not real-time for astronauts]**
- Pre-placed RF beacons were proposed for Apollo — [McKee survey](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)

**Fusion**
- Nefian: EKF fusing IMU + steering + wheel rotation, then visual odometry, then terrain + horizon cost function → >60% error reduction — [Nefian et al. 2014](https://www.cse.unr.edu/~bebis/isairas14.pdf)
- Goddard: horizon fixes fed to EKF; demonstrated scenario of an **astronaut rotating 360° in place, taking several horizon pictures** — [Driessen et al.](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf)

### Gaps
- No quantified UWB/rover-to-astronaut ranging study found in this pass; no Desert RATS/BASALT navigation numbers found.
- No Electra surface-position accuracy number found.

---

## Q6. Comparison table and recommendation

### Takeaway
Comparison table (numbers from sources above; maturity in brackets). Recommendation: use horizon/terrain matching as a **periodic absolute "reset"/backup**, fused with a foot/suit IMU (continuous) and sun/star heading — not as the sole primary method. Where HiRISE coverage exists, top-down orbital matching (Perseverance-style) is far more accurate than skyline matching.

### Cited Findings (table; each cell from sources cited above)

| Method | Measures | Typical accuracy | Drift | Works in dust/dark? | Infrastructure | Maturity | Compute/power |
|---|---|---|---|---|---|---|---|
| Wheel odometry | distance | LRV ±2% distance; slip can be huge (Opportunity 50 m cmd → 2 m) | grows with distance | yes | none | OPERATIONAL | very low |
| Foot IMU / step (ZUPT) | relative position | 1–3% of distance (4.8 km → 134 m) | grows | yes | none | FIELD-TESTED | low |
| Gyro/IMU heading | heading | Sojourner ~13°/sol drift | grows with time | yes | none | OPERATIONAL | low |
| Visual odometry | relative motion | Perseverance >35 m on long drives (uncorrected) | grows | needs light/texture | none | OPERATIONAL | medium |
| Sun sensor / sun finding | heading | <1°; ~1 arcmin possible | none | needs Sun (fails in heavy dust/night) | none | OPERATIONAL | low |
| Star-based position | absolute position | ~421 m (Earth test) | none | needs night sky | none | FIELD-TESTED | low–medium |
| Horizon/skyline matching | absolute position + heading | ~10–100 m; Goddard sim ≤50 m filtered | none | needs visible distant horizon & light | DEM only | RESEARCH / FIELD-TESTED (Earth) | medium–high (grows with search area) |
| Orbital top-down matching (Censible) | absolute position | 0.36 m avg, 1.07 m max | none | needs light; tolerant to normal dust variation | HiRISE map | OPERATIONAL (Perseverance, 2026) | ~1–2 min on phone-class CPU, <1 GB |
| Landing TRN (LVS) | absolute position during descent | ~few m (req. 40 m); landing ~5 m | none | daylight | orbital map | OPERATIONAL (landing only) | dedicated |
| Ground-team manual matching | absolute | ~0.5 m | none | needs images | Earth link | OPERATIONAL | humans, ≥1 day |
| Radio (VLBI, LunaNet, beacons) | absolute | LRV VLBI ~25 m after the fact | none | yes | yes (satellites/beacons) | partly | low on user side |

### Inferences
- Horizon matching **is technically feasible** and a defensible hackathon concept, but should be presented honestly as: (1) a coarse/backup absolute fix (tens of metres), (2) excellent for heading, (3) dependent on visibility, lighting, distinctive terrain, and DEM coverage.
- Better design for the team's app: IMU/step counting (continuous) + sun/sky heading + periodic image-to-map fix (top-down matching where HiRISE DTMs exist; horizon matching as fallback for distant landmarks) + optional rover/habitat radio beacons; fuse in a Kalman or particle filter; show an uncertainty circle on the map.
- Narrow search with odometry prior (Censible uses 30 m radius) to keep compute phone-class.

### Gaps
- No source gives an official NASA accuracy requirement for Mars astronaut EVA navigation.
