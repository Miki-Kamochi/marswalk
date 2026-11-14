# Martian Dust Storms, Low Visibility, and Camera-Based Astronaut Navigation (Gale Crater)

Notes in English; final report to be written in Japanese for high-school readers. Research date: 2026-11-14.

## 1. Frequency, scale, seasonality, development speed, dust devils, forecasting

### Takeaway
Dust storms on Mars are routine. Most are local and last days. Regional storms come back almost every year in southern spring and summer (roughly Ls 180–360, around perihelion at Ls ~251). Planet-encircling ("global") storms are irregular, about every 3–5 Mars years, or roughly a 25% chance in any given Mars year. Global storms have been recorded in 1971, 1977 (two in one Mars year), 2001, 2007 and 2018; 1956, 1982 and 1994 appear in some lists. The 2018 storm covered much of the planet in about two weeks. Forecasting is mostly "watch today's map" (MRO MARCI daily global maps). Skilful multi-day prediction of storm onset is not yet operational.

### Cited Findings
- Global dust storms "occur on Mars at irregular intervals, approximately every 3–5 Mars Years"; about a 25% chance of a global storm in any Mars year; two global storms occurred in one Mars year (MY12, Viking, 1977); 2001 = MY25, 2007 = MY28, 2018 = MY34 — [NASA NTRS conference paper](https://ntrs.nasa.gov/api/citations/20190027303/downloads/20190027303.pdf)
- A NASA/JPL 2016 release lists global-storm years 1956, 1971, 1982, 1994 and 2007. Lists differ between sources: 1994 is sometimes called partial, and 1973 appears in one preprint but is unconfirmed — [JPL: Study predicts next global dust storm](https://www.jpl.nasa.gov/news/study-predicts-next-global-dust-storm-on-mars/); [JPL: Mars orbiters reveal seasonal dust storm pattern](https://www.jpl.nasa.gov/news/nasa-mars-orbiters-reveal-seasonal-dust-storm-pattern/)
- In years without a global storm, three large regional storms (types A, B, C) recur with similar timing most Mars years: A = springtime southern-hemisphere event; B = starts near perihelion over the south pole and lasts through solstice; C = southern summer — [JPL 2016](https://www.jpl.nasa.gov/news/nasa-mars-orbiters-reveal-seasonal-dust-storm-pattern/)
- Dust storm activity centres on perihelion (Ls ~251°, southern spring). Planet-encircling storms form in southern spring/summer; regional storms are more frequent — [arXiv 1602.09137](https://arxiv.org/pdf/1602.09137); [Springer 1998 review](https://link.springer.com/content/pdf/10.1023/A:1006134805153.pdf)
- 2018: "Martian dust storms are common, especially during southern hemisphere spring and summer… Most typically stay within a local area." The 2018 storm "engulfed much of Mars over about two weeks"; the last global storm before it was 2007. Scott Guzewich (NASA) on why some storms last months and others a week: "We don't have any good idea." — [JPL news, June 2018](https://www.jpl.nasa.gov/news/martian-dust-storm-grows-global-curiosity-captures-photos-of-thickening-haze/)
- 2018 storm timeline at Gale: the Curiosity campaign ran sol 2075 (7 June 2018, Ls 188.7°) to sol 2169 (11 Sept 2018, Ls 248.2°), i.e., about 3 months of elevated dust — [Guzewich et al. 2019 GRL, via ADS](https://ui.adsabs.harvard.edu/abs/2019GeoRL..46...71G); [CAB INTA-CSIC listing](https://cab.inta-csic.es/publicaciones/mars-science-laboratory-observations-of-the-2018-mars-year-34-global-dust-storm/)
- Forecasting: MRO MARCI images are stitched into a daily global map at the same local time (mid-afternoon). MSSS publishes weekly weather reports. MRO updates give rover teams advance notice "especially if a regional storm might grow into a planet-encircling one". A NASA scientist: "many patterns are getting predictable, but just when we think we have Mars figured out, it throws us another surprise" — [JPL: back-to-back regional storms](https://www.jpl.nasa.gov/news/nasa-mars-orbiter-tracks-back-to-back-regional-storms/); [MSSS weather reports](https://www.msss.com/msss_images/2018/06/13/)
- Research status (2026): Montabone et al. say reliable forecasting "requires key developments" in Mars GCMs. They describe a machine-learning model that uses 7 preceding daily dust maps to predict the **next sol** — [EPSC 2026 abstract](https://meetingorganizer.copernicus.org/EPSC2026/EPSC2026-1310.html)
- Dust devils at Jezero (Perseverance MEDA): 4.9 vortices per sol (>0.5 Pa pressure drop) over 415 sols, of which at least 1 in 5 carries dust. About 2.0–3.0 dust devils km⁻² sol⁻¹ (another study: 1.3–3.4), peaking 12:00–13:00 local time. The rate is lower than at Spirit/Pathfinder sites but much higher than at InSight — [Toledo et al. 2023 JGR Planets (PDF)](https://digital.inta.es:8443/jspui/bitstream/20.500.12666/868/1/JGR%20Planets%20-%202023%20-%20Toledo%20-%20Dust%20Devil%20Frequency%20of%20Occurrence%20and%20Radiative%20Effects%20at%20Jezero%20Crater%20%20Mars%20%20as%20Measured.pdf); [Hueso et al. 2023 (PDF)](https://digital.inta.es:8443/jspui/bitstream/20.500.12666/883/1/JGR%20Planets%20-%202023%20-%20Hueso%20-%20Convective%20Vortices%20and%20Dust%20Devils%20Detected%20and%20Characterized%20by%20Mars%202020.pdf)
- Mars year = 669.6 sols, about 1.88 Earth years — [arXiv 1602.09137](https://arxiv.org/pdf/1602.09137) (general reference)

### Inferences
- "Every ~3 Mars years" is a rough average only. The gaps observed are 2001→2007 (3 Mars years) and 2007→2018 (6 Mars years). As of Nov 2026 there has been no global storm since 2018 (MY34) that I found. Base the plan on about a 25% chance per Mars year, not on a fixed schedule.
- For a crewed mission (about 500 sols on the surface), at least one dusty season (Ls 180–360) is certain, and a global storm is plausible. The navigation system must be designed for it, not treated as an edge case.
- Forecasting gives roughly hours-to-a-day of situational awareness, mainly from watching a storm approach on orbital maps. It cannot guarantee "no storm tomorrow" for EVA planning days ahead.

### Gaps
- I found no reliable primary source for "thousands of local storms per year". Do not quote a number. (A study-aid site says most storms are <2,000 km across and dissipate in days; that is low quality.)
- I found no sourced Gale-specific dust devil frequency in this search. From memory, Curiosity observations suggest dust devils at Gale are relatively rare compared with Jezero/Spirit, but this is **unverified**; flag it as uncertain.
- No published multi-day forecast skill scores.

## 2. Optical depth (tau) and horizontal visibility, including Gale specifics

### Takeaway
Tau measures how much the whole atmosphere column (looking straight up) dims the direct sun: direct sunlight = e^(−tau). At Gale, the column tau measured by Curiosity's Mastcam peaked at **8.5 (880 nm)** in the 2018 global storm. Before that storm, Gale's maximum was about 1.5. Opportunity measured **10.8** (≈11) on 10 June 2018 and then went silent. Horizontal visibility is a different quantity. Within Gale it was measured from how clearly Navcam/Mastcam saw the crater rim about 25–30 km away. The rim "is visible at most times of year". At the 2018 storm peak, visibility fell to **less than 3 km**, not tens of metres. This is the single most important number for the project.

### Cited Findings
- Guzewich et al. 2019 (GRL): Mastcam 880 nm optical depth reached **8.5** at Gale in the 2018/MY34 storm. REMS saw a **97% reduction in total UV** reaching the surface and a **30 K drop in the daily air-temperature range**. No dust lifting was seen inside Gale; the dust came from outside the crater — [ADS abstract](https://ui.adsabs.harvard.edu/abs/2019GeoRL..46...71G); [CAB listing](https://cab.inta-csic.es/publicaciones/mars-science-laboratory-observations-of-the-2018-mars-year-34-global-dust-storm/)
- JPL (June 2018): tau at Gale "above 8.0, the highest the Curiosity mission has recorded", more than doubling over one weekend; haze "six to eight times thicker than normal for this season"; tau over Opportunity last measured near 11 — [JPL news](https://www.jpl.nasa.gov/news/martian-dust-storm-grows-global-curiosity-captures-photos-of-thickening-haze/)
- Opportunity tau **10.8** (10 June 2018, sol 5111), about double its previous record of about 5–5.5 (2007 storm). It exceeded Viking's estimated tau of about 9 (1970s). Battery recharging reportedly needed tau below about 2. Normal tau at Opportunity was about 0.5 — [Planetary Society](https://www.planetary.org/articles/06-mer-update-opportunity-dust-storm-sleep); [JPL PIA22930 last images](https://pds-rings.seti.org/press_releases/pages/PIA22xxx/PIA22930.html); [JPL PIA22521](https://www.jpl.nasa.gov/images/pia22521-shades-of-martian-darkness/)
- The 2018 storm opacities were "more than five times the maximum value measured by Mastcam prior to this storm", implying a pre-storm Gale maximum of about 1.5–1.7 — [EGU2019-8287 abstract](https://meetingorganizer.copernicus.org/EGU2019/EGU2019-8287.pdf)
- Gale seasonal cycle: optical depth peaks during southern spring/summer (Ls ~180–360) and is lower and more stable in autumn/winter (Ls 0–180). Mastcam 880 nm tau is typically double-peaked (Ls ~240° and ~320°) with a low near Ls ~120°. The seasonal cycle is "punctuated by numerous significant increases in optical depth on short timescales" — [Lemmon MSL tau dataset (Mendeley)](https://data.mendeley.com/datasets/tbh3pg39xc); [Moore et al. 2019 / PMC6662233](https://pmc.ncbi.nlm.nih.gov/articles/PMC6662233)
- **Horizontal visibility method (Smith et al. 2019 GRL, arXiv 1910.00986):** visibility is the "maximum distance that a feature, assumed to be black and against the horizon, is resolvable", using Koschmieder's law with a 2% contrast threshold: V = −ln(0.02)/β ≈ 3.9/β, where β = line-of-sight extinction per km — [ar5iv full text](https://ar5iv.labs.arxiv.org/html/1910.00986)
- Smith et al. 2019: "the crater rim, which sits approximately 30 km away, is visible at most times of year". Seasonal LOS extinction has "average peak values of 0.11 km⁻¹" (peak amplitude 0.06 km⁻¹). In 2018 LOS extinction peaked at **>1.1 km⁻¹ (sols 2086–2090), an order of magnitude higher than previous maxima**, and "visibility was reduced to less than 3 km" (sol 2088). Visibility in N and W directions temporarily improved 15–20 sols after the peak and then had a second peak. **Morning extinction was systematically higher than afternoon.** "The Curiosity Rover was able to operate throughout the storm" — [ar5iv](https://ar5iv.labs.arxiv.org/html/1910.00986); [arXiv abstract](https://arxiv.org/abs/1910.00986)
- Moore et al. 2016/2019 (Navcam north crater rim): the rim is about 23.5–27.5 km away, based on DEM distances (earlier work assumed 30 km). "High visibility" in Ls 0–179 and "low visibility" in Ls 180–359. The LOS minimum is near Ls 90° and the maximum near Ls 300° (high-dust Ls 270–315°). LOS extinction is highest at low altitude. Column extinction exceeds in-crater LOS extinction for most of the year, but in southern summer (Ls 270–360) LOS exceeds column. Gale acts as a net dust sink (deposition about 2.7–3.5 µm per Mars year). Systematic error is up to about 15% — [PMC6662233](https://pmc.ncbi.nlm.nih.gov/articles/PMC6662233); [Moore et al. 2016 listing](https://cab.inta-csic.es/publicaciones/a-full-martian-year-of-line-of-sight-extinction-within-gale-crater-mars-as-acquired-by-the-msl-navcam-through-sol-900/)
- Mariner 9 (1971 storm): from orbit, the only visible features were the summits of the Tharsis volcanoes poking through the haze — [web search summary; Space.com / behindtheblack](https://www.space.com/4099-martian-dust-storms-engulf-planet.html) (secondary)
- 2001 storm: sunlight at the surface fell to "less than 5 percent" of a clear atmosphere — [Space.com 2001 report](https://www.space.com/4099-martian-dust-storms-engulf-planet.html) (secondary)

### Inferences (calculations — mark as our own estimates)
- **Direct sunlight fraction e^(−tau)** (beam only, my arithmetic):
  | tau | direct sun reaching ground | meaning |
  |---|---|---|
  | 0.3 | 74% | clear (Gale aphelion season, approximate) |
  | 0.5 | 61% | normal (Opportunity's "normal") |
  | 1 | 37% | dusty season |
  | 1.5 | 22% | Gale pre-2018 maximum |
  | 2 | 13.5% | Opportunity's battery threshold |
  | 4 | 1.8% | regional storm |
  | 8.5 | 0.02% | Gale 2018 peak |
  | 10.8 | 0.002% | Opportunity 2018 |
  **Caveat:** total daylight is much higher than the direct beam, because dust scatters light forward and the sky glows. At tau 8.5 REMS still measured about 3% of normal UV (97% reduction). So a global storm is "very dark overcast", not night.
- **Visibility from Koschmieder (V ≈ 3.9/β):** β = 0.05 km⁻¹ gives about 80 km (beyond the rim). β = 0.11 km⁻¹ (typical seasonal peak) gives about 35 km, so the rim is still just visible. β = 1.1 km⁻¹ gives about 3.5 km. The paper states <3 km at peak, consistent with β somewhat above 1.1 at some times or directions.
- **Answer to "tens of metres or kilometres?":** at Gale during the strongest storm on record, near-surface horizontal visibility was **about 3 km**, not tens of metres. This is plausibly because Gale is a dust sink with a shallow boundary layer and the dust was imported rather than lifted locally. Visibility *inside* an active local dust-lifting front or dust devil could be much worse; no measurement was found.
- The 2% threshold is for a black object seen by the human eye. A computer matching skyline shapes needs much more contrast than 2%. So the usable range for horizon matching is probably a fraction of V, perhaps about 1/3 to 1/2. **This is a guess, not a published value.**
- Seasonal "good visibility" fraction: the rim is visible "most of the year", and Ls 0–180 (aphelion half) is the clear half. Because Mars moves slower near aphelion, Ls 0–180 lasts somewhat more than half the year (about 370 of 669 sols). That figure is my orbital-mechanics estimate; verify it.

### Gaps
- Only **one** quantitative near-surface visibility value for a storm on Mars was found (<3 km, Gale 2018). No measurements exist for the inside of local dust-lifting storms or the storm fronts themselves, or for other sites.
- No exact seasonal-median tau numbers for Gale were retrieved (e.g., about 0.3 aphelion, about 1 dusty season). Lemmon's Mendeley dataset could be downloaded to compute them. Treat "about 0.3–0.5 clear season / about 1–1.5 dusty-season peaks" as approximate.
- Visibility varies by direction. The southern direction (Mt. Sharp side) could not be measured in 2018, and the eastern results are only limits.

## 3. Effect on cameras and image-based navigation

### Takeaway
Curiosity (nuclear-powered MMRTG) kept operating and imaging through the entire 2018 storm, including daily Navcam horizon images. Its main camera impact was longer exposure times in low light. Opportunity (solar) lost power at tau 10.8 and never recovered. For horizon matching, the decisive factor is contrast loss with distance. At Gale the far rim (about 25–30 km) is visible most of the year but disappears when line-of-sight extinction rises much above about 0.15 km⁻¹. During a global storm only features within roughly 1–3 km keep useful contrast.

### Cited Findings
- JPL engineers: the storm poses "little risk" to Curiosity's instruments; the largest impact is on cameras, which need extra exposure time because of low light. Mastcam is routinely pointed down after use to limit dust on its optics. Curiosity's nuclear battery operates day and night — [JPL news 2018](https://www.jpl.nasa.gov/news/martian-dust-storm-grows-global-curiosity-captures-photos-of-thickening-haze/)
- Curiosity took daily Navcam horizon images and Mastcam crater-rim images throughout a 100-sol storm campaign; the crater rim was obscured at the storm peak — [Smith et al. 2019 (ar5iv)](https://ar5iv.labs.arxiv.org/html/1910.00986)
- Opportunity fell silent on 10 June 2018 after tau 10.8. Its last images show a dark, noisy sky with a faint sun. NASA's simulated views (PIA22521) show the sun shrinking from a bright disc (tau 1) to a faint pinprick (tau 11) — [JPL PIA22930](https://pds-rings.seti.org/press_releases/pages/PIA22xxx/PIA22930.html); [JPL PIA22521](https://www.jpl.nasa.gov/images/pia22521-shades-of-martian-darkness/)
- Mastcam blue-filter extinction results were higher than red/green, likely because of low signal-to-noise. This illustrates low-light noise in storm images — [arXiv 1910.00986 abstract](https://arxiv.org/abs/1910.00986)
- Rim brightness varies up to about 50% between sunlit and shadowed sections because of reflectance and illumination, not dust. So lighting changes alone alter how a skyline looks — [PMC6662233](https://pmc.ncbi.nlm.nih.gov/articles/PMC6662233)

### Inferences
- Tau values were measured by imaging the sun disk (Mastcam at Gale reached 8.5; Pancam at Opportunity reached 10.8). So a camera with a solar filter can still detect the sun's position up to tau about 8–10, even though the human eye would see only a dim glow. The sun disk is clearly visible at tau 2, dim at tau 4, and a faint pinprick at tau 8+ (per PIA22521 simulation). Sun-direction heading may still be possible with a dedicated sun sensor at tau ≤ 4–6. Above that it is unreliable. This is an inference; I found no sun-sensor test data.
- Horizon matching at Gale is only possible when the 5 km-high Mt. Sharp (south) or the 25–30 km rim (north) is visible. The rim is lost at roughly β > 0.13–0.15 km⁻¹ (V < 30 km). In global-storm conditions (β ≈ 1 km⁻¹), only local terrain within about 1–3 km would be visible, so the system must switch to near-field terrain or landmark matching, or other methods.
- Morning visibility was worse than afternoon visibility at Gale. Schedule visual position fixes for the afternoon.
- Diffuse, shadowless lighting under thick dust also removes the shading cues that matching algorithms use, beyond the haze itself. This is reasoning, not a sourced measurement.

### Gaps
- No published study was found that quantifies visual odometry or horizon or skyline matching failure versus tau on Mars. Terrestrial fog studies were not searched. This is a major evidence gap; the team could test it themselves by adding synthetic haze, I(d) = I₀·e^(−βd) + sky·(1−e^(−βd)), to Navcam images.
- I did not verify whether Perseverance's Navcams were affected by dust events (it landed in 2021, after the global storm). No information on Perseverance operations during the regional storms of 2022 was gathered here.

## 4. Dust effects on hardware, suits, health, and radio

### Takeaway
Dust is a slow, cumulative threat to solar power and optics, and a serious threat to suits and seals (Apollo lesson). Typical dust build-up on solar arrays costs about 0.2% of power per sol; InSight went from about 5,000 Wh/sol to about 500 Wh/sol and ended in 2022. Mars dust is very fine (about 3 µm) and contains toxic perchlorates. Radio effects: older JPL analysis found at most about 1.3 dB at Ka-band (32 GHz), i.e., small. Newer models that include charged dust claim larger losses, and this is **disputed**.

### Cited Findings
- Solar arrays: a typical loss of about 0.2% per sol, with an observed range of 0.05–2% per sol across missions. Pathfinder lost about 0.25% per sol. Spirit and Opportunity (2,208 and 5,352 sols) were periodically cleaned by dust devils and gusts — [Lorenz et al. 2021, Planet. Space Sci. 207:105337](https://hal.sorbonne-universite.fr/hal-03369920)
- InSight: about 5,000 Wh/sol at landing, falling to about 500 Wh/sol by May 2022 from dust. It had no dust-removal system, and no cleaning dust devil came. NASA wound down the mission, and it ended in December 2022 — [JPL InSight news](https://www.jpl.nasa.gov/news/nasas-insight-still-hunting-marsquakes-as-power-levels-diminish); [NASA: InSight waits out dust storm](https://www.nasa.gov/missions/insight/nasas-insight-waits-out-dust-storm/)
- Curiosity's wind sensors were damaged by debris kicked up during landing — [Universe Today / web summary](https://www.universetoday.com/156171/perseverance-is-seeing-a-lot-of-dust-devils/) (secondary)
- Apollo (Gaier 2005, NASA/TM-2005-213610): dust effects fell into **nine categories**, including vision obscuration, false instrument readings, dust coating and contamination, loss of traction, clogging of mechanisms, abrasion, thermal control problems, seal failures, and inhalation/irritation. Simple measures fixed some problems but "were ineffective to mitigate many of the more serious problems". Ground tests consistently underestimated severity — [NTRS 20050160460](https://ntrs.nasa.gov/citations/20050160460)
- Apollo seals: "all Apollo environmental, gas, and regolith sample seals compromised"; suit leak rates rose after Apollo 12 EVAs — [Gaier NASA slides](https://www.nasa.gov/wp-content/uploads/2019/04/06_2_jgaier_whatdoweneedtoknowv1_pres.pdf)
- Mars dust: about 3 µm particles can reach deep into the lungs (silicosis-like risk). Perchlorates can disrupt thyroid function. Martian dust is likely less sharp or abrasive than unweathered lunar regolith, but perchlorates and tracking dust into habitats remain hazards (2025 GeoHealth study, J. Wang et al.) — [Discover](https://www.discovermagazine.com/fine-mars-dust-may-pose-a-risk-to-astronauts-health-47463); [Earth.com](https://www.earth.com/news/dust-could-threaten-the-health-of-future-astronauts-on-mars) (secondary reporting)
- Radio: JPL TDA Progress Report 42-87 (1986) found the worst case for X-band (8.4 GHz) and Ka-band (32 GHz) through Martian dust was about 1.3 dB at 32 GHz, "small enough to be academic" — [JPL IPN PR 42-87](https://ipnpr.jpl.nasa.gov/progress_report/42-87/87EE.html); [NTRS 19870005926](https://ntrs.nasa.gov/api/citations/19870005926/downloads/19870005926.pdf)
- Contradicting view: Dou et al. 2024 (Applied Physics B) model charged dust and predict "significant" attenuation in UHF/S/X/Ka that grows with optical depth. A 2025 arXiv paper cites 5–15 dB (not verified) — [Springer 2024](https://link.springer.com/article/10.1007/s00340-024-08209-w); [arXiv 2506.16198](https://arxiv.org/html/2506.16198v1)

### Inferences
- In 2018 Curiosity kept communicating with Earth through relay orbiters throughout the storm (implied by daily operations, [Smith et al. 2019](https://ar5iv.labs.arxiv.org/html/1910.00986)). This is real-world evidence that UHF relay links work in a global storm. Treat radio as the most storm-robust external reference. Mention the charged-dust models as an open research question.
- Camera lenses on suits and rovers need covers, wipers or downward stowing (Mastcam practice). Dust settling during and after storms gradually lowers contrast even after the air clears.
- Electrostatic charging and abrasion: Apollo experience shows they are real, but the Mars-specific magnitude was not quantified in my sources.

### Gaps
- No sourced quantitative data on dust accumulation rate on camera lenses on Mars.
- Electrostatic charging of Mars dust and triboelectric effects in storms were not researched in depth here.
- No measured UHF attenuation value found.

## 5. Navigation methods during storms and strict feasibility assessment

### Takeaway
Horizon or skyline matching to terrain data is a good-weather method. At Gale it should work for most of the clear half of the year (Ls 0–180) and much of the dusty season. It will fail for distant features during regional or global storms: the rim was lost at the 2018 peak, with visibility below 3 km. Even in the worst recorded case, visibility at Gale stayed at kilometres, not metres. So near-field landmarks (hundreds of metres to about 1 km) may still be matchable. The navigation map needs a fallback chain that does not depend on optics.

### Cited Findings
- Visibility stayed at kilometres at the worst point: <3 km at Gale (sol 2088, 2018). The rim (about 25–30 km) is visible "at most times of year" — [Smith et al. 2019](https://ar5iv.labs.arxiv.org/html/1910.00986)
- Curiosity operated throughout the storm (nuclear power, relay communications) — [JPL 2018](https://www.jpl.nasa.gov/news/martian-dust-storm-grows-global-curiosity-captures-photos-of-thickening-haze/); [Smith et al. 2019](https://ar5iv.labs.arxiv.org/html/1910.00986)
- A solar-powered asset (Opportunity) died at tau 10.8; it needed tau < about 2 to recharge — [Planetary Society](https://www.planetary.org/articles/06-mer-update-opportunity-dust-storm-sleep)
- High tau lasted months: the Gale campaign covered about 94–100 sols (June–Sept 2018) — [Guzewich et al. 2019](https://ui.adsabs.harvard.edu/abs/2019GeoRL..46...71G)

### Inferences (our assessment; label as such in the report)
- **Rough thresholds for horizon matching at Gale (estimates, not published):**
  - tau about 0.3–1, β < 0.1 km⁻¹: rim and Mt. Sharp visible. Horizon matching works. This covers most of the year.
  - tau about 1–2, β about 0.1–0.2 km⁻¹: the far rim is faint or lost. Mt. Sharp (closer and taller) and near terrain are still usable. Accuracy is degraded.
  - tau about 2–4 (regional storm): only features within a few to about 10 km. Use near-field landmarks; treat the horizon fix as low-confidence.
  - tau > 4–8 (global storm), V about 3 km: horizon matching fails. Use non-optical navigation.
- **Recommended fallback chain:**
  1. Radio ranging and beacons (rover, habitat, landing-site beacons; UHF/relay orbiter links). This is the most dust-robust option, as shown by Curiosity in 2018.
  2. IMU dead reckoning plus step counting/odometry, reset at each known landmark. Drift grows with time, so keep EVA distances short.
  3. Sun sensor with a filter for heading, usable up to about tau 4–6 (unverified).
  4. Near-field visual landmarks and pre-placed markers and breadcrumbs along the route (visible within 1–3 km even in the worst Gale case).
  5. Camera horizon matching as the high-accuracy correction in good weather.
  6. Operational rules: watch MARCI and orbital dust maps daily, avoid long EVAs in the Ls 180–360 dusty season or during regional storm alerts, and prefer afternoon fixes. Star trackers are not usable in daytime or storms.
- **Strict conclusion:** a camera-only horizon-matching system is NOT sufficient as a safety-critical "don't get lost" system. It is feasible as one layer in a multi-sensor system. Optical position fixes would be unavailable for weeks to about 3 months during a global storm, and intermittently during regional storms every year.

### Gaps
- No published Mars-specific test of horizon or terrain-matching accuracy versus tau or visibility; the thresholds above are reasoned estimates.
- No data on visibility inside an actively lifting local dust storm or dust devil at an astronaut's location; this could be far below 3 km.
- Fraction of sols at Gale with tau above 1, 2 or 4 not computed; Lemmon's dataset (Mendeley tbh3pg39xc) would allow this.
