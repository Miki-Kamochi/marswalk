# Route Planning for Astronauts and Rovers on Planetary Surfaces (safety, time, consumables, guaranteed return)

Research notes for the NASA Space Apps 2026 "Martian Map" team. Notes are in English; the final report will be written in Japanese for high-school readers.
Each item is marked **[OPERATIONAL]** (used on a real mission), **[ANALOG]** (used in field tests or analog missions), or **[RESEARCH]** (papers and prototypes). As of November 2026.
Some sources were read only as abstracts or search snippets because several NASA PDFs returned 404 or could not be parsed. These are flagged inline.

---

## Q1. Algorithms: Dijkstra, A*, D*/D* Lite, Field D*, Theta*, RRT, multi-objective, raster least-cost path. Which ones do Mars rovers actually use, and how do they replan?

### Takeaway
Real Mars rovers use a two-layer design. A **global planner** runs Dijkstra or Field D* on a coarse grid cost map and works out "how far to the goal from here." A **local planner** scores a fan of short candidate arcs against a fresh 3D map from the rover's cameras. The rover drives about 1 m, then replans, so new obstacles are handled by constant replanning rather than by a single fixed route. Human EVA traverse tools use the same idea: Dijkstra or A* on a raster cost map from orbital elevation data (DEM), with a cost that represents metabolic energy or time instead of distance.

### Cited Findings
**Rover flight software [OPERATIONAL]**
- MER (Spirit/Opportunity) local planner GESTALT handles small isolated obstacles well. It struggles when the goal is behind a large obstacle or a rock cluster. — [Carsten et al. 2007, IEEE Aerospace, "Global Path Planning on-board the Mars Exploration Rovers"](https://www-robotics.jpl.nasa.gov/media/documents/IEEEAC-Carsten-1125.pdf)
- Field D* fixes this. It was developed at CMU by Stentz and Ferguson and integrated into MER flight software by Carsten and Rankin at JPL. It estimates the cost of travel from the end of each GESTALT arc to the goal, and its "votes" replace GESTALT's goal-seeking votes. — [Carsten et al. 2007](https://www-robotics.jpl.nasa.gov/media/documents/IEEEAC-Carsten-1125.pdf); [CMU RI page](https://www.ri.cmu.edu/?p=17044)
- Opportunity used Field D* on Mars. On Sol 1160 it planned around a cluster of rocks. Three of five planned checkout tests were done, all successful. A 2009 *Journal of Field Robotics* paper reports five fully autonomous runs on Mars. — [JPL 2007 doc](https://www-robotics.jpl.nasa.gov/media/documents/2007-iav.pdf); [JFR 2009, doi 10.1002/rob.20287](https://zendy.io/title/10.1002/rob.20287)
- Perseverance's ENav (Enhanced Navigation) works like this (from Abcouwer et al., JPL):
  - Stereo images become a 2.5D heightmap centred on the rover.
  - A coarser **cost map** gives each cell a weighted sum of **tilt + roughness (deviation from a fitted plane) + minimum traversal time**.
  - Cells get infinite cost for extreme tilt, a failed plane fit, or a keep-out zone. Unseen cells get an intermediate cost.
  - The candidate tree has 14 turn-in-place options, then 11 arcs of 3 m, then another 11 arcs of 3 m. That gives **1,694 candidate paths** over a horizon of about 6 m.
  - Each path's cost = manoeuvre time + cost-map samples along the path + a **Dijkstra-based cost-to-goal** from the path's endpoint.
  - The best-ranked paths go through **ACE** (Approximate Clearance Evaluation). ACE checks wheel heights, attitude, suspension angles and belly clearance. Each ACE call takes 10–20 ms on the RAD750 CPU.
  - Only the **first ~1 m (or first 30° of a turn)** is executed, then the cycle repeats.
  - Source: [Abcouwer et al., "Machine Learning Based Path Planning for Improved Rover Navigation," IEEE Aerospace 2021 (arXiv 2011.06022)](https://ar5iv.labs.arxiv.org/html/2011.06022)
- The same paper's simulated tests found:
  - ENav succeeded in reaching an 80 m goal on complex terrain **69.9%** of the time.
  - A learned heuristic raised success to 72.5% and cut "overthinking" (more than 275 ACE calls, about 3–4 s per cycle) from 20.0% to 7.1%.
  - Benign terrain was defined as ≤15° slope and ≤7% rock cover.
  - Source: [ar5iv 2011.06022](https://ar5iv.labs.arxiv.org/html/2011.06022)
  - The JPL poster reports a success rate of 69.9% → 78.8% over 1,500 Monte Carlo runs. This number differs from the paper's 72.5%, probably because the poster used a different experiment configuration. — [JPL poster](https://www.jpl.nasa.gov/site/research/media/posters/2021/R20134p.pdf)
- "Thinking while driving": AutoNav images terrain while rolling, builds a 3D hazard map, and plots its course between waypoints that rover planners on Earth chose. — [Rapid Traverse paper / news summary](https://www.roboticscenter.ai/news/digest/2026-02-25-perseverance-smashes-autonomous-driving-record-on-mars/)
- Driving records:
  - Perseverance drove **331.74 m autonomously in one sol** on 3 April 2023 (347.69 m total). Opportunity's earlier autonomous record was 109 m/sol.
  - An ENav paper in *IEEE Transactions on Field Robotics* (Nov 2025) gives the full flight results. I did not read it.
  - Source: [roboticscenter.ai digest of IEEE Spectrum](https://www.roboticscenter.ai/news/digest/2026-02-25-perseverance-smashes-autonomous-driving-record-on-mars/)
- Rapid Traverse Campaign (sols 379–409, 2022):
  - Longest multi-sol drive in one plan: 528.7 m.
  - Longest continuation drive: 699.9 m.
  - The team could "routinely plan hundreds of meters of driving each sol, the great majority … driven autonomously."
  - Source: [JPL 2023 rapid traverse paper](https://www-robotics.jpl.nasa.gov/media/documents/2023-rapid-traverse.pdf)
- In 2026, Perseverance's odometer reached **45.22 km**, passing Opportunity's off-world record. — [Nextgov, Oct 2026](https://nextgov.com/emerging-tech/2026/10/nasas-self-driving-mars-rover-sets-world-mileage-record/416718)

**Human EVA traverse planners [ANALOG/RESEARCH]**
- MoonPath (Peña-Asensio, Kring et al., *Acta Astronautica* 2024) **[RESEARCH]**:
  - Combines **Monte Carlo + Dijkstra minimum-cost path** on LOLA 5 m/pixel lunar south pole elevation data.
  - Goal: minimise astronaut metabolic workload ("shortest and flattest route").
  - Source: [Universe Today summary](https://www.universetoday.com/163783/lunar-astronauts-will-need-easy-walking-trails-around-the-moons-south-pole/); [UAB record](https://ddd.uab.cat/record/284640)
- SEXTANT (MIT; Johnson, Newman, Hoffman) **[ANALOG]**:
  - Finds the most efficient path between activity points for an astronaut or a rover.
  - "Efficiency" can be **distance, time, or energy** (metabolic expenditure or rover power).
  - It can also compute a **"walkback" route home from any point** on the traverse.
  - Source: [MIT DSpace 1721.1/59560](https://dspace.mit.edu/handle/1721.1/59560); [MIT HSL](https://hsl.mit.edu/eva-mission-planning-tool-based-metabolic-cost-optimaization)
- The Artemis Geospatial Data Team lists "basic and advanced least cost path traverse planning" as a capability. — [NTRS 20230006633](https://ntrs.nasa.gov/api/citations/20230006633/downloads/Artemis%20Geospatial%20Data%20Team%20Capabilities%20-%20Strives%20(final).pdf)

**Dynamic replanning [RESEARCH foundation]**
- D* Lite (Koenig & Likhachev, AAAI 2002) is the standard incremental replanner. When the cost map changes, it reuses the previous search instead of starting from scratch. — [idm-lab.org paper](http://idm-lab.org/bib/abstracts/papers/aaai02b.pdf). The fetch failed on a TLS certificate error, so this is cited from the known reference and its content was not re-verified here.
- Field D* is the interpolated, any-angle descendant of D*. It is the algorithm that flew on MER (see above).

### Inferences
- Simple explanation for students:
  - **Dijkstra** = "spread outward like ripples and record the cheapest cost to every cell."
  - **A*** = Dijkstra plus a hint (the straight-line distance to the goal) so it searches toward the goal first.
  - **D* Lite** = A* that "remembers" its earlier work, so it can fix the route quickly when a new rock appears.
  - **Field D*** and **Theta*** = versions that allow diagonal "any-angle" lines instead of zig-zag grid steps.
  - **RRT** = random-tree sampling. It is used for robot arms and vehicle dynamics, and is rarely needed for a 2D map tool.
- Multi-objective (Pareto) planning, for example distance vs risk vs energy, is usually approximated in practice by a **weighted sum** in a single cost, as ENav does with tilt + roughness + time. For a web app, offering 2–3 preset weightings (shortest / safest / balanced) is the practical form of Pareto planning.
- No mission rover is known to use RRT for global routing. Grid-based Dijkstra, A* and Field D* dominate.

### Gaps
- I did not obtain the full text of the 2025 IEEE T-FR ENav paper. Its global planner details and flight statistics are unverified here.
- I found no source on a specific Pareto/multi-objective planner flown on Mars. Theta* in planetary use was not researched.

---

## Q2. Cost functions: slope, roughness, rocks, sand, elevation gain; anisotropy; Tobler; suited metabolic cost; Apollo walking speeds and distances

### Takeaway
Terrain becomes cost in three ways:
1. **Hard limits:** cells that are too steep or too rocky are impassable (infinite cost).
2. **A weighted penalty** for slope, roughness and rocks.
3. **A physical model** of time or energy.

For walking, Tobler's hiking function gives speed vs slope and is anisotropic: downhill is faster than uphill, and the fastest speed is on a slight downhill. Apollo data show suited walking speeds of about 1–4 km/h and an average metabolic rate of about 234 kcal/h.

### Cited Findings
- **Tobler's hiking function** [model, Earth unsuited hiking]: v = 6·exp(−3.5·|S + 0.05|) km/h, where S = dh/dx (rise over run).
  - Maximum speed is 6 km/h at about −2.86° (slight downhill).
  - The cost for least-cost paths is 1/v.
  - Dropping the constant 6 rescales all costs equally and does not change which route is best.
  - Source: [leastcostpath R docs](https://search.r-project.org/CRAN/refmans/leastcostpath/html/create_slope_cs.html); [rdrr cost.R](https://rdrr.io/cran/leastcostpath/src/R/cost.R)
- **Slope limits for EVA:**
  - Kring recommends lunar EVA traverses on slopes **<20°**.
  - MoonPath capped slopes at **15°** and found 94% of permanently shadowed regions (PSRs) reachable from the rim on slopes below 15°. Four PSRs are reachable entirely below 10°.
  - Source: [Universe Today](https://www.universetoday.com/163783/lunar-astronauts-will-need-easy-walking-trails-around-the-moons-south-pole/); [UAB record](https://ddd.uab.cat/record/284640)
- **Rover slope/rock costs:** ENav uses tilt, roughness and traversal time as cost terms, with infinite cost at extreme tilt. — [ar5iv 2011.06022](https://ar5iv.labs.arxiv.org/html/2011.06022)
- **Apollo walking speeds [OPERATIONAL data]** (all from [OSTI 7168757](https://www.osti.gov/servlets/purl/7168757)):
  - Apollo 15 crews' average walking speed rose from about 1 km/h to about 2 km/h across EVAs.
  - Apollo 12 crews reached about **4 km/h** on a shallow grade, then had to rest to recover heart rate and breathing.
  - Apollo 14 (Cone Crater): a **~10° slope** on the second half of the walk forced frequent rests. Going **downhill on the return, they roughly doubled their average speed**.
- **Apollo 14 Cone Crater EVA:** the crew went about 1,280 m from the LM toward the rim, and the EVA lasted 4 h 34 min. — [Smithsonian](https://www.smithsonianmag.com/blogs/air-space-museum/2021/02/25/small-steps-and-giant-leaps-apollo-lunar-landings/). The OSTI source says 1.4 km, so the distance figures conflict.
- **Slope misperception:** lighting can exaggerate how steep a slope looks. The Apollo 16 crew estimated a crater slope at 60° when it was below 30°. — [EPSC2024-196](https://presentations.copernicus.org/EPSC2024/EPSC2024-196_presentation.pdf)
- **Apollo metabolic rates [OPERATIONAL data]:**
  - Overall average lunar EVA metabolic rate: **234 kcal/h**, lower than expected. — [NTRS 19730008098 (Apollo 16 metabolic report)](https://ntrs.nasa.gov/citations/19730008098)
  - Rates on the Moon ranged from **~120 to 400 kcal/h**, with walking while sampling at about 250 kcal/h. — [NTRS search results](https://ntrs.nasa.gov/api/citations/19910001262/downloads/19910001262.pdf). Snippet only, not verified in the full text.
  - Average ~1000 BTU/h, peaks up to 2200 BTU/h. The PLSS was designed for a 1200 BTU/h average. — [NTRS 19720019460](https://ntrs.nasa.gov/api/citations/19720019460/downloads/19720019460.pdf). Snippet only.
  - Riding the LRV was "by far the least stressful activity." — [NTRS 19730008098](https://ntrs.nasa.gov/citations/19730008098)
- **Suited locomotion research [RESEARCH]:**
  - Carr's MIT thesis found that suits raise the metabolic cost of movement. In reduced gravity, **suited running is likely more efficient per distance than suited walking**, and the suit knee acts like a spring. — [Carr 2005, MIT DSpace 1721.1/33088](https://dspace.mit.edu/handle/1721.1/33088)
  - Carr & Newman later modelled exoskeleton energetics for planetary EVA. — [MIT PDF](https://web.mit.edu/aeroastro/www/people/dnewman/pdf2/Exoskeleton%20Energetics_2017.pdf)
- **SEXTANT's metabolic model** is extrapolated from Apollo velocity and metabolic data and assumes constant walking speed per slope.
  - In a Mars Desert Research Station (MDRS) field test, actual traverse time was significantly **longer** than predicted and energy use was higher. Distance prediction was fine.
  - A 2024 NASA paper argues that field-derived metabolic models are needed instead of lab treadmill models.
  - Source: [MIT DSpace 1721.1/81410](https://dspace.mit.edu/handle/1721.1/81410?show=full); [NTRS 20240001423 (IEEE EMBC 2024)](https://ntrs.nasa.gov/api/citations/20240001423/downloads/IEEE%20EMBC%202024.pdf)
- MoonPath estimated travel time from **Apollo 12 and 14 walking EVA data**. It found all round trips from candidate landing sites to PSRs within 2 km could be done in **under 2 h** of constant walking. — [UAB record / abstract](https://ddd.uab.cat/record/284640)

### Inferences
- For the app, a defensible cost for one grid step is:
  - `time = step_length / v(slope)`
  - `v(slope)` = Tobler's function scaled to a suited flat speed of about 2 km/h. Apollo data put realistic flat speeds at 1–4 km/h, so Tobler's 5 km/h flat speed is too high.
  - Add penalties for roughness and rocks, and set slope > 15–20° as impassable.
- **Anisotropy:** the cost of A→B differs from B→A. In a grid, compute slope per *directed* edge (Δh / horizontal distance with sign) rather than per cell.
- **Mars caveat:** Mars gravity is 0.38 g, more than twice the Moon's 0.165 g. Lunar speed and metabolic data will not transfer exactly. This should be stated as an assumption in the report.

### Gaps
- I could not extract slope-specific suited metabolic tables (BTU/h vs grade) from Norcross et al. or the Carr thesis. Only abstracts were read.
- No Mars-gravity suited walking dataset was found.
- No source was found that gives numeric costs for sand or dust compared with rock for walking.

---

## Q3. Consumables, time and walkback: EVA duration, margins, Apollo walkback limit, turn-back points, buddy rule

### Takeaway
Apollo set a **"walkback limit"**: the rover was never allowed farther from the lunar module (LM) than the crew could walk back with the oxygen and cooling water left in their suits (PLSS), plus a reserve. Mission rules allowed **up to ~6 miles (~10 km)**, and the actual farthest distances were **4.5–7.6 km**. Modern Artemis suits target **8-hour EVAs**, with planning at about 6 ± 2 h.

### Cited Findings
- "Mission rules restricted us from going more than **6 miles from the LM** – the distance we could walk back in a pinch." LRV top speed on the level was about 7 mph, and the informal record was 11 mph downhill. — [NASA SP-350, Apollo Expeditions to the Moon, ch. 14.8](https://www.nasa.gov/wp-content/uploads/static/history/SP-350/ch-14-8.html) **[OPERATIONAL]**
- Actual maximum distances from the LM: **Apollo 15 – 5.0 km, Apollo 16 – 4.5 km, Apollo 17 – 7.6 km**. Wired reports the walkback rule was relaxed somewhat for Apollo 17. — [NSSDC LRV page](https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html); [Wired archive](https://wirednews.pages.dev/2013/07/lunar-flying-units-1969). These figures come from search snippets and should be double-checked.
- A 1971 Apollo 15 planning memo (ALSJ document 19790073512) reportedly required a **20% consumables pad for emergency walkback**. It tied the walkback envelope to the PLSS consumables remaining and to a walking return speed of **3.3 km/h**. — [ALSJ PDF (now 404; archived copy)](https://webarchive.library.unt.edu/eot2008/20090109180220/http:/www.hq.nasa.gov/alsj/19790073512_1979073512.pdf). Search snippet only; the PDF could not be fetched directly.
- The Apollo 17 traverse graphics drew **separate oxygen and cooling-water walkback limits** as lines on the traverse map. The crew left Station 2 with about a half-hour buffer. — [ALSJ Apollo 17 trvsta3](https://www.nasa.gov/wp-content/uploads/static/history/alsj/a17/a17.trvsta3.html). Search snippet; the page returned 404 when fetched.
- Apollo suit primary life support lasted **4–6 hours depending on metabolic rate**. — [Smithsonian](https://www.smithsonianmag.com/blogs/air-space-museum/2021/02/25/small-steps-and-giant-leaps-apollo-lunar-landings/)
- **Artemis suits:**
  - xEMU requirements support EVAs of **up to 8 hours (6 ± 2 h planning)**. — [NTRS 20210000827](https://ntrs.nasa.gov/api/citations/20210000827/downloads/Exporation%20EVA%20Testing%20and%20Analogs%2020210000827.pdf) (search snippet)
  - AxEMU (Axiom) is designed for **at least 8 hours** of lunar EVA. — [Axiom Space](https://axiomspace.com/news/axiom-space-celebrates-national-moon-day-hosts-reddit-ama-on-axemu-spacesuit); [Orbital Radar](https://orbitalradar.com/spacesuits/axemu)
  - The ISS EMU's Secondary Oxygen Pack gives about **30 min** of emergency O2. I did not find an authoritative AxEMU reserve figure. One "2 h emergency reserve" claim came from an unreliable mirror site and is excluded.
- **Artemis lunar south pole:** astronauts should stay **within 2 km of the lander**, ideally keeping it in sight. — [Universe Today on Peña-Asensio et al.](https://www.universetoday.com/163783/lunar-astronauts-will-need-easy-walking-trails-around-the-moons-south-pole/)
- **Artemis surface navigation:** crews will have pre-planned traverses for each EVA, based on science and safety criteria including **terrain slope, line of sight to the lander, and illumination**. — [NTRS 20230012314, "Early Artemis Surface Navigation"](https://ntrs.nasa.gov/api/citations/20230012314/downloads/EarlyArtemisSurfaceNavigation_v1-ION23-XXX-v3.docx)
- **Apollo traverse practice:** crews drove to the planned *farthest* point first and then worked back toward the LM through the stations. As consumables ran down, they moved closer to home. — [search summary of ALSJ/Apollo planning sources](https://www.ninfinger.org/karld/My%20Space%20Museum/LRV.htm) (secondary source)

### Inferences
- "Point of no return" logic for the app:
  - At any point *p*, the route is safe only if `remaining_O2(p) ≥ (1 + margin) × O2_needed_to_return(p)`, with margin ≈ 20% (Apollo pad).
  - The **turn-back point** is the first point on the outbound route where this would fail on the next step.
- "Go far first, then come back" (Apollo's strategy) matters because consumables are highest when you are farthest away.
- **Buddy rule:** Apollo and Artemis EVAs are always two-person. I found no specific citation in this session, so the report should cite a NASA EVA document if it states this.

### Gaps
- Exact Apollo 15/16/17 walkback limits in km by EVA and the oxygen vs water limit lines were not retrieved. The ALSJ pages returned 404.
- I found no authoritative AxEMU oxygen capacity, CO2 scrubber limit, battery capacity or reserve.
- A NASA paper on "Surface EVA Architectural Drivers" (NTRS 20230014957) was downloaded but could not be text-extracted. It likely contains Artemis walkback and metabolic assumptions and is worth reading manually: https://ntrs.nasa.gov/api/citations/20230014957/downloads/Surface%20EVA%20Architectural%20Drivers.pdf

---

## Q4. Return guarantees and human-in-the-loop EVA traverse tools (xGDS, BASALT, SEXTANT, Desert RATS, Artemis)

### Takeaway
NASA analog missions use human-in-the-loop tools:
- **xGDS** draws and edits traverses and tracks crew positions.
- **SEXTANT** optimises routes and computes walkback paths.
- **Playbook** handles the timeline.

Together these formed the "Minerva" suite in BASALT, a Mars analog program in Hawaiian and Idaho lava fields. They remain analog-only, not operational flight tools.

### Cited Findings
- In BASALT, Minerva = **xGDS** (timeline and traverse planning) + **SEXTANT** (route optimisation between stations) + **Playbook** (activity scheduling). xGDS calls SEXTANT to optimise routes, and the resulting traverses are exported to Playbook as a timeline. Precursor imagery and DEMs were imported to generate planned traverses. During EVAs, the tools showed crew position, planned vs actual path, and field notes. — [PMC6442304 (BASALT, *Astrobiology* 2019)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6442304); [NTRS 20170002364](https://ntrs.nasa.gov/api/citations/20170002364/downloads/20170002364.pdf) **[ANALOG]**
- A NASA presentation lists xGDS's traverse plan editor and location tracking as "Supported Analog Testing Only." — [NTRS 20230003967 (ICES-2021-227)](https://ntrs.nasa.gov/api/citations/20230003967/downloads/ICES-2021-227-CPAIGE-nocopyright.pdf)
- Lessons from BASALT-1 included the need for role-tailored interfaces, **real-time updates**, and tighter SEXTANT/Playbook integration. — [PMC6442304](https://pmc.ncbi.nlm.nih.gov/articles/PMC6442304)
- SEXTANT computes a walkback route from any point. — [MIT DSpace 1721.1/59560](https://dspace.mit.edu/handle/1721.1/59560)
- MoonPath evaluates **surface temperature, astronaut body illumination, regolith bearing capacity and direct view to the lander** at the same time. It outputs a "traverse atlas" for planners. — [UAB record](https://ddd.uab.cat/record/284640) **[RESEARCH]**
- A 2026 NASA abstract ("AsTrav", LPSC 2026) measures speed-made-good of Apollo 15/16 LRV traverses as a function of slope and terrain, for Artemis traverse planning. — [NTRS 20250011301](https://ntrs.nasa.gov/api/citations/20250011301/downloads/AsTrav_LPSC26_v1.docx)

### Inferences
- **Guaranteed-return algorithm** (my inference, built from SEXTANT's walkback idea and Apollo's 20% pad):
  1. Run Dijkstra once from **base** over the cost map. Because costs are anisotropic, use reversed edges so the result is the cost to walk *to* base. This gives a "return-cost field" R(cell) for O2, time or energy.
  2. During the outbound A*, prune any cell where `spent_so_far + 1.2 × R(cell) > budget`.
  3. Show R as a coloured "safe radius" heat map. This is a direct modern version of Apollo's drawn walkback-limit lines.

### Gaps
- Desert RATS traverse-planning specifics were not researched in this session.
- No public xGDS source or code was examined.

---

## Q5. Dynamic events and localization-aware ("don't get lost") path planning

### Takeaway
Research planners now treat **localization uncertainty** as a cost. A route that keeps the rover or astronaut where it can still tell its position (landmarks, line of sight to the lander, good lighting) can beat a shorter "blind" route. This is still **research**. Operationally, Artemis planning already uses *line of sight to the lander* and *illumination* as traverse criteria.

### Cited Findings
- **Sánchez-Ibáñez et al., IROS 2022 [RESEARCH]**:
  - Path planning considers **localization uncertainty that grows along the path** and trades **collision risk against path length**.
  - It uses the Fast Marching Method to build an uncertainty-aware cost map.
  - It was tested in simulation and on a wheeled rover in a lunar analogue facility.
  - Source: [IROS22 PDF (orbilu.uni.lu)](https://orbilu.uni.lu/bitstream/10993/57807/1/IROS22_planning.pdf); [AMiner](https://aminer.org/pub/63aaa85a90e50fcafd2e880d/optimal-and-risk-aware-path-planning-considering-localization-uncertainty-for-space-exploration). The full text could not be fetched (certificate error), so these details come from the abstract and search snippets.
- **Fang (CMU), NASA workshop [RESEARCH]**:
  - Proposes **belief-space planning**: take localization into account during path planning.
  - Terrain-relative navigation accuracy depends on **feature presence** and the quality of orbital data.
  - Source: [science.nasa.gov Fang.pdf](https://science.nasa.gov/wp-content/uploads/2023/04/Fang.pdf)
- **Strader et al. (WVU), perception-aware mast motion planning [RESEARCH]:** predicts the sensor trajectory (where the camera points) that maximizes the rover's localization performance. — [arXiv 1912.06898](https://ar5iv.labs.arxiv.org/html/1912.06898)
- **ESA two-level navigation (arXiv 1911.09975) [RESEARCH]:** pairs local hazard avoidance with adaptive SLAM for global localization, which corrects drift on long traverses. — [arXiv 1911.09975](https://arxiv.org/pdf/1911.09975v1.pdf)
- **Neural radiance maps (Stanford, arXiv 2603.17236, 2026) [RESEARCH]:** plans paths using local rover images and a NeRF-type representation of the site. — [arXiv 2603.17236](https://arxiv.org/pdf/2603.17236)
- **CMU mission-directed planning (2005) [RESEARCH]:** plans in a combined space of **position, time and energy**, for example solar power vs time of day. — [CMU RI](https://www.ri.cmu.edu/publications/mission-directed-path-planning-for-planetary-rover-exploration)
- **Artemis [planning criteria for operations]:** line of sight to the lander and illumination are explicit traverse criteria. — [NTRS 20230012314](https://ntrs.nasa.gov/api/citations/20230012314/downloads/EarlyArtemisSurfaceNavigation_v1-ION23-XXX-v3.docx)
- **Lighting distorts perception:** the Apollo 16 crew misjudged a slope as 60° when it was under 30°. — [EPSC2024-196](https://presentations.copernicus.org/EPSC2024/EPSC2024-196_presentation.pdf)
- **Rover replanning:** ENav replans after every ~1 m using fresh stereo images, so new obstacles are absorbed automatically. Unseen cells get a cost between known-flat and known-obstacle. — [ar5iv 2011.06022](https://ar5iv.labs.arxiv.org/html/2011.06022)

### Inferences
- **Simple "localizability" cost for the app:**
  - Precompute for each cell how many landmarks (big craters, peaks, the base/habitat) are visible within X km. Use a viewshed or line-of-sight check on the DEM.
  - Add a penalty when the count is < 2 (no way to triangulate) or when the base is not in line of sight.
  - This is a lightweight approximation of the belief-space and uncertainty-aware ideas above.
- **Dust storms:**
  - Treat a storm as a time-dependent increase in cost: lower visibility → larger localizability penalty, plus lower solar power for rovers.
  - Trigger replanning (A* again, or D* Lite) with tightened walkback margins.
  - A contingency rule is "if comms or visibility are lost, follow the precomputed return-cost field downhill to base." That field is just the stored Dijkstra map from Q4.
- Mars storm timing data and comm-loss procedures were outside this session's search scope.

### Gaps
- I could not read the full IROS 2022 paper for its quantitative results.
- No operational EVA procedure for dust-storm route abort was found.
- Literature on "active localization" for *astronauts* (not rovers) seems thin. I found none specifically.

---

## Q6. Worked example: 1 km trip, (1) steep shortcut over a ridge vs (2) safe detour vs (3) detour that keeps landmarks in view

### Takeaway
On illustrative numbers, the **shortest route is not the fastest or cheapest**:

| Route | Distance | Time | Energy | O2 |
|---|---|---|---|---|
| (1) Ridge shortcut | ~1.04 km | ~67 min | ~355 kcal | ~70 L |
| (2) Safe detour | 1.4 km | ~49 min | ~205 kcal | ~41 L |
| (3) Landmark detour | 1.6 km | ~60 min | ~250 kcal | ~50 L |

Route (3) costs about 20% more than (2) but keeps navigation reliable.

**All numbers below are my own calculations (HYPOTHETICAL), built from the cited models: Tobler, Apollo speeds, Apollo metabolic rates, and the Apollo 20% pad.**

### Cited Findings (inputs used)
- Tobler: v = 6·exp(−3.5·|S+0.05|). — [leastcostpath docs](https://search.r-project.org/CRAN/refmans/leastcostpath/html/create_slope_cs.html)
- Suited flat walking speed of about 2 km/h (Apollo 15 later EVAs). Steep (~10°) uphill needed rests. — [OSTI 7168757](https://www.osti.gov/servlets/purl/7168757)
- Average metabolic rate 234 kcal/h, range up to ~400 kcal/h. — [NTRS 19730008098](https://ntrs.nasa.gov/citations/19730008098); [NTRS 19910001262](https://ntrs.nasa.gov/api/citations/19910001262/downloads/19910001262.pdf)
- Caloric equivalent: about 5 kcal per litre of O2 (from a NASA snippet: "5 kcal … is the approximate caloric equivalent"). — [NTRS search result](https://ntrs.nasa.gov/api/citations/19720019460/downloads/19720019460.pdf)
- 20% walkback pad (Apollo 15 memo). — [ALSJ archived PDF](https://webarchive.library.unt.edu/eot2008/20090109180220/http:/www.hq.nasa.gov/alsj/19790073512_1979073512.pdf)
- Slope limit 15–20°. — [Universe Today/Kring](https://www.universetoday.com/163783/lunar-astronauts-will-need-easy-walking-trails-around-the-moons-south-pole/)

### Inferences (worked calculation, hypothetical)

**Scenario.** Base and target are 1.0 km apart in a straight line. A ridge 100 m high lies between them, with 20° flanks.

**Speed model.**
- Suited speed = 2 km/h × Tobler(S)/Tobler(0), where Tobler(0) = 5.04 km/h.
- 20° uphill: S = +0.364 → Tobler 1.41 km/h → ratio 0.28 → **0.56 km/h**.
- 20° downhill: S = −0.364 → Tobler 2.0 km/h → ratio 0.40 → **0.79 km/h**.
- Gentle (≤5°) terrain: average ratio ~0.85 → ~1.7 km/h.

**(1) Shortest route: over the ridge**
- Distance:
  - Flat 450 m.
  - Up 293 m along the surface (275 m horizontal at 20°).
  - Down 293 m.
  - Total **≈1.04 km**.
- Time:
  - Flat: 450 m ÷ 2 km/h = 13.5 min.
  - Up: 293 m ÷ 0.56 km/h = 31 min.
  - Down: 293 m ÷ 0.79 km/h = 22 min.
  - Total **≈67 min**.
- Energy:
  - Flat: 13.5 min at 234 kcal/h.
  - Up: 31 min at 400 kcal/h.
  - Down: 22 min at 250 kcal/h.
  - Total **≈355 kcal**, which is about **71 L O2** (≈100 g).
- Risk: 20° is at or above the recommended limit. Fall and slip risk is high. Lighting may exaggerate the slope. → Fails a 15° safety cap.

**(2) Safety-first route: around the end of the ridge**
- Distance ≈ **1.4 km**, slopes ≤5°.
- Time: 1.4 km ÷ 1.7 km/h ≈ **49 min**.
- Energy: about 250 kcal/h × 0.82 h ≈ **205 kcal**, about **41 L O2**.
- Result: 40% longer than (1) but **~27% faster and ~42% less oxygen**.

**(3) Navigation-aware route: wider detour along a crater rim that keeps the base and two landmarks in view**
- Distance ≈ **1.6 km**, slopes ≤8°, average speed about 1.6 km/h.
- Time: **≈60 min**.
- Energy: **≈250 kcal**, about **50 L O2**.
- Cost: about 20% more time and O2 than (2).
- Benefit: the crew can always see the base. If GPS-like aids, comms or visibility drop (for example, a dust event), they can still navigate home.

**Return guarantee (round trip, 20% pad)**
- Required O2 = (outbound + return) × 1.2.
- Route (2): (41 + 41) × 1.2 ≈ 98 L.
- Route (1): 71 L out + ~71 L back × 1.2 ≈ 170 L. The return over the ridge is also anisotropic: the steep sides swap, so the cost is similar.
- With an 8-hour suit, all three routes are well inside the time budget. The difference matters when chaining several stations or when walking back after a rover failure. Example: a 5 km walkback at about 2 km/h takes 2.5 h, while at 0.56 km/h on 20° slopes it would be roughly 9 h. Steep terrain can make the walkback infeasible.

**Teaching point.** "Shortest distance" ≠ "shortest time" ≠ "least oxygen" ≠ "safest." The planner should show all three routes side by side.

### Gaps
- Mars-specific suited speeds and metabolic rates are unavailable. These are Moon-derived numbers applied to Mars, which has higher gravity, so they are probably optimistic for energy.
- The 400 kcal/h steep-uphill rate is the upper end of the Apollo range, not a measured value at 20°.

---

## Q7. Implementation: A* on a grid in a web browser (JavaScript/TypeScript)

### Takeaway
A* or Dijkstra with a **binary-heap priority queue** on a typed-array grid of a few hundred to about 1000 × 1000 cells is practical in plain JavaScript in a browser. Use a Web Worker so the UI does not freeze. Off-the-shelf libraries exist, but a custom ~100-line implementation is easier to adapt to anisotropic slope costs.

### Cited Findings
- javascript-astar (bgrins) uses a binary-heap open set and is "quite faster" than its original array version. — [GitHub javascript-astar](https://github.com/TiTi/javascript-astar); [jsDelivr README](https://cdn.jsdelivr.net/npm/javascript-astar@0.4.1/README.md)
- EasyStar.js is another browser A* library. — [GitHub easystarjs](https://github.com/elinake/easystarjs)
- pfinder's changelog reports a +200% speedup on a **500 × 500** grid from a better open-set container, and precomputing neighbours. — [pfinder](https://classic.yarnpkg.com/en/package/pfinder)
- fast-astar (WebAssembly) claims to be **17–25× faster than JS** on grids from 50×50 to 1000×1000. This is the package's own claim and is unverified. — [fast-astar](https://www.pkgstats.com/pkg:fast-astar)
- Data resolution:
  - MoonPath used **5 m/pixel** LOLA data. — [Universe Today](https://www.universetoday.com/163783/lunar-astronauts-will-need-easy-walking-trails-around-the-moons-south-pole/)
  - For comparison, a 2 km radius at 5 m/pixel is an 800 × 800 grid, about 640k cells. This is my arithmetic.

### Inferences
- **Recommended design:**
  1. Load a DEM tile, for example a HiRISE DTM (~1 m) or a CTX DTM (~20 m) of the chosen Mars site, resampled to 5–10 m cells. Keep the grid at about 200×200 to 1000×1000.
  2. Store heights in `Float32Array`. Compute slope and roughness per cell once.
  3. Edge cost = step length ÷ suited speed from scaled Tobler (directed, so it is anisotropic). Add penalties for rocks and roughness, plus an optional penalty for low localizability. Treat slope > 15–20° as impassable.
  4. Use A* with 8-neighbour moves, an octile-distance heuristic multiplied by the *minimum* cost per metre (so the heuristic stays admissible), and a binary heap. Run it in a Web Worker.
  5. Run one reverse Dijkstra from base to get the return-cost field for the walkback check and the heat map.
  6. Offer three weight presets (shortest / safest / balanced+return-guaranteed) and show distance, time, O2 and margin for each.
  7. Smooth the zig-zags with line-of-sight shortcutting (a Theta*-like post-process), or simply accept 8-direction paths.
- **Expected speed:** a 1000×1000 Dijkstra with a binary heap in modern JS typically finishes in roughly 0.1–1 s. This is my estimate from general experience, not measured here; the team should benchmark it.
- **Replanning:** with grids this small, simply rerunning A* when an obstacle or storm cell is added is fast enough. D* Lite is worth explaining as the "real rover" approach but is not necessary to implement.

### Gaps
- No rigorous browser benchmark of A* on a 1000² anisotropic grid was found. PathFinding.js documentation was not retrieved.
