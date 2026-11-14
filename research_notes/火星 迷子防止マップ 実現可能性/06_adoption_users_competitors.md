# Adoption, Users and Competitors: Is a Mars EVA "Don't-Get-Lost" Map/HUD Needed, What Already Exists, and How to Differentiate

Researcher notes (English). Researched 2026-11-14. Labels: [OPERATIONAL] = flown or in use, [TESTED] = field- or analog-tested prototype, [RESEARCH] = paper or lab work, [PROPOSED] = plan or architecture text.

## (a) What NASA's Moon/Mars surface plans say about EVA navigation, informatics and autonomy

### Takeaway
NASA's own architecture papers name navigation as a surface EVA challenge. They say early lunar missions will rely mainly on orienteering (map and landmark reading), with guidance and navigation later shown on suit "informatics" displays and rovers. For Mars, the one-way communication delay (0 to about 22 minutes over a mission) plus multi-day to multi-week blackouts mean Earth cannot help in real time, so crew-side tools that work on their own are an architecture need, not a nice-to-have.

### Cited Findings
- [PROPOSED] NASA's Moon to Mars "Surface EVA Architectural Drivers" white paper (2023) says lunar surface missions face "communications delays, navigation, and lighting" challenges. It says EVA needs affect "the informatics system" of the suit as well as habitats and surface mobility platforms. — [NASA NTRS 20230014957, Surface EVA Architectural Drivers](https://ntrs.nasa.gov/api/citations/20230014957/downloads/Surface%20EVA%20Architectural%20Drivers.pdf)
- [PROPOSED] The same paper: "Early missions will mainly utilize orienteering for navigation. Guidance and navigation systems, displayed via informatics and mobility assets, will help crew members get to destinations and back, guiding them to targets specifically designated by the science team." It also notes "persistent long shadows near the lunar South Pole." — [same source](https://ntrs.nasa.gov/api/citations/20230014957/downloads/Surface%20EVA%20Architectural%20Drivers.pdf)
- [PROPOSED] The same paper says communication between EVA crew may be limited by distance or line of sight, including during "contingencies/walk-back scenarios." It says surface site selection must balance terrain, illumination and distance against EVA capabilities such as "walk-back distance, vision." It cites the Joint AR (Joint Augmented Reality Visual Informatics System) product as the related informatics work. — [same source](https://ntrs.nasa.gov/api/citations/20230014957/downloads/Surface%20EVA%20Architectural%20Drivers.pdf)
- [PROPOSED] Tasks will "require the crew to navigate up and down slopes, traverse into and out of craters." — [same source](https://ntrs.nasa.gov/api/citations/20230014957/downloads/Surface%20EVA%20Architectural%20Drivers.pdf)
- [RESEARCH] A NASA ASCEND paper on communication for crewed Mars missions: delays "will vary from 0 to 22 minutes over the course of a mission, peaking while the crew is at or just departed from Mars". Disruptions "can last for several days up to several months". Solar conjunction happens about every 26 months. In the paper's example 50-sol stay, the orbiting vehicle could see the landing site for an average of 7 h 50 min at a time, with average gaps of 16 h 46 min, which is about one third of each sol with direct relay contact. — [NASA NTRS 20220013418, ASCEND: Communication Delays, Disruptions, and Blackouts for Crewed Mars Missions](https://ntrs.nasa.gov/api/citations/20220013418/downloads/ASCEND-Communication%20Delays%2C%20Disruptions%2C%20and%20Blackouts%20for%20Crewed%20Mars%20Missions.pdf)
- One-way Earth–Mars light time is about 3 min at closest approach (about 54.6 million km) to about 22.4 min at maximum (about 400 million km), per a NASA Mars Relay Network guide as reported by a secondary outlet. ESA's Mars Express blog gives about 4.3 to 21 min. The "4–24 min" figure in some sources is looser. Recommended wording: "about 3 to 22 minutes one way". — [SpaceDaily summary of the NASA guide](https://spacedaily.com/t-earth-mars-radio-delay-44-minutes-solar-conjunction/); [ESA Mars Express blog](https://blogs.esa.int/mex/?p=257); [JPL "Mars in a Minute" on conjunction](https://www.jpl.nasa.gov/edu/resources/video/mars-in-a-minute-what-happens-when-the-sun-blocks-our-signal/)
- The Moon–Earth delay is at most a few seconds. A 2025 SpaceOps paper on assistive decision support for EVA navigation says delays could reach about 10 s in future lunar missions and lists increased crew autonomy as a goal. — [SpaceOps 2025 paper](https://publications.spaceops.org/2025/download_by_id.php?id=0210)
- [RESEARCH] UC Davis RASAGE is an AI-enabled multi-agent onboard decision-support framework for EVA. Its prototype interface combines timeline, navigation and physiological monitoring. This is a close research competitor in "EVA decision support". — [UC Davis RASAGE](https://bioastro.ucdavis.edu/rasage)
- [RESEARCH] A NEEMO analog study simulated one-way delays of 5 and 10 minutes between crew and mission control. NASA briefings note that lunar comm delay "limits the ground's ability to oversee crew task execution, increasing the opportunity for crew error." — [NASA NTRS 20150019627](https://ntrs.nasa.gov/api/citations/20150019627/downloads/20150019627.pdf); [NASA NTRS Human Health and Performance white paper](https://ntrs.nasa.gov/api/citations/20230015521/downloads/Human%20Health%20and%20Performance.pdf)
- [PROPOSED] NASA hosts the Moon to Mars architecture white papers and the yearly Architecture Concept Review documents (2023–2025) at these index pages. — [NASA Architecture White Papers](https://www.nasa.gov/architecture-white-papers); [2025 Architecture Concept Review](https://www.nasa.gov/moontomarsarchitecture-whitepapers)
- [PROPOSED] Context for Artemis surface operations: NASA's VIPER rover planning describes a drive team in which a "navigator" reviews localization quality and navigation sensor health before each drive, and south-pole shadows complicate obstacle identification. This shows that localization quality is treated as an explicit operational check even for robots. — [NASA NTRS VIPER 2025](https://ntrs.nasa.gov/api/citations/20250004148/downloads/viper-2025-04-24.pdf); [NASA NTRS VIPER situational awareness 2025](https://ntrs.nasa.gov/citations/20250004275)
- [PROPOSED] Lunar Outpost's MAPP rover uses visual-inertial odometry with stereo cameras for autonomous navigation and is slated for an Artemis IV south-pole deployment. — [NASASpaceflight, Dec 2025](https://www.nasaspaceflight.com/2025/12/lunar-outpost-mapp/)

### Inferences
- The team can truthfully say that NASA's architecture lists navigation, lighting/shadows, walk-back distance and comm delay as EVA drivers. A map that shows where self-localization works is a direct answer to the "orienteering" approach NASA expects at first.
- At Mars, with no GPS and Earth contact for only about a third of each sol through a relay (in the ASCEND example), the crew must judge position on their own. This makes the value case for a Mars version stronger than for the Moon.

### Gaps
- I did not retrieve the Mars Design Reference Architecture 5.0 text on EVA navigation. DRA 5.0 (2009) is known to assume long pressurized-rover traverses, but I have no quote on navigation.
- The current Artemis III/IV schedule as of November 2026 is not verified here. A Jan 2025 NASA paper said Artemis III was targeting mid-2027 ([NTRS 20250004024](https://ntrs.nasa.gov/citations/20250004024)), and 2026 news describes Artemis restructuring, but I did not confirm the details.
- I found no navigation-specific details for the AxEMU (Axiom) suit or the Lunar Terrain Vehicle.

## (b) Existing and related systems and research for astronaut navigation and EVA displays

### Takeaway
Many systems already show "where am I / where to go / how to get back" to astronauts: Apollo paper maps, NASA's Joint AR helmet display (field-tested 2024), the SEXTANT/xGDS traverse planners from the BASALT Mars-analog program, Goddard's horizon-matching AI for the Moon, and many student SUITS HUDs. None of the sources found here offers a map layer that shows in advance where a crewmember would be able to localize from horizon or landmarks and where they would not. Robotics research on "localizability maps" and "belief-space planning" covers this idea for robots, so the team must credit it.

### Cited Findings
**Historical: Apollo 14 shows people really do lose position**
- [OPERATIONAL, historical] On Apollo 14's second EVA (1971), Shepard and Mitchell never found the rim of Cone Crater. The undulating terrain and lack of reference points made it hard to judge position and distance. They mistook nearby ridges for the rim, and Mitchell said "Our positions are all in doubt now." Mission Control ended the search because of oxygen limits and the long walk back. They were in fact within about 15–50 m of the rim; sources differ (NASA mission report: about 50 ft; NASA SVS: about 40 m). — [NASA Apollo 14 Mission Report summary (ALSJ)](https://www.nasa.gov/wp-content/uploads/static/history/alsj/a14/a14mr01.htm); [NASA SVS "Apollo 14 Hike To Cone Crater"](https://svs.gsfc.nasa.gov/4883); [NASA SP-350 Apollo Expeditions to the Moon](https://www.nasa.gov/wp-content/uploads/static/history/SP-350/ch-12-6.html); [Universe Today, LRO image](https://universetoday.com/37870/latest-lro-image-solves-apollo-14-mystery)
- The crew was never in real danger because they could see the lunar module behind them. This is an important nuance: being "lost" mostly cost science and consumables, not lives. — [AmericaSpace](https://www.americaspace.com/2016/02/14/familiar-to-millions-of-americans-45-years-since-apollo-14-part-4/)

**NASA Joint AR (helmet display)**
- [TESTED] NASA solicited augmented-reality optics for the suit visor (vendor submissions were due March 2023). The concept: EVAs of about 6–8 hours, showing navigation, procedures, telemetry, photos and video, so crew can work even when real-time contact with Earth is lost. The hardware must survive radiation, thermal swings and dust, and the crew cannot touch their head inside the suit. — [Mixed News](https://mixed-news.com/en/nasa-wants-to-equip-astronauts-on-lunar-missions-with-ar-displays/); [yet2 solicitation](https://www.yet2.com/active-projects/seeking-novel-augmented-reality-optics-technology/)
- [TESTED] Joint AR was worn by astronaut Kate Rubins (May 19 and 21, 2024) and Andre Douglas (night run) during NASA's JETT5 field test in Arizona's San Francisco Volcanic Field. Features: navigation, photo capture, graphical consumables display, procedure viewing, mission control updates. The team "successfully tested navigation displays using data from four different data streams: GPS/IMU, camera/IMU, LiDAR, and static maps." NASA says it may help "guide crew back to the lunar lander." — [Astrobiology.com repost of NASA JETT5 report](https://astrobiology.com/2024/06/09/tricorder-tech-artemis-away-team-field-test/)
- The name "JARVIS" is a University of Maryland SUITS student design, not a NASA program. NASA's system is "Joint AR". — [UMD Today](https://today.umd.edu/moonwalk-imagery-friend-3128f09a-603a-4f30-856d-d8025e6e3bbc)

**NASA SUITS student challenge**
- [RESEARCH/education] NASA SUITS (Spacesuit User Interface Technologies for Students) asks university teams to build AR/HUD interfaces. NASA describes the goal as supporting astronauts with "real-time navigation, task management, and scientific data visualization during moonwalks." In 2025 more than 100 students from 12 universities tested at JSC, framed around Artemis III and beyond. — [NASA SUITS overview](https://www.nasa.gov/learning-resources/spacesuit-user-interface-technologies-for-students/); [NASA SUITS 2025 wrap-up](https://www.nasa.gov/centers-and-facilities/johnson/nasa-challenge-wraps-student-teams-complete-space-suit-challenges); [NASA student challenge article](https://www.nasa.gov/general/nasa-student-challenge-prepares-future-designers-for-lunar-missions/)
- Older SUITS design requirements included navigation, interaction with other devices and assets, biometrics display, and science/geology tasks. — [Digital Engineering 24/7](https://www.digitalengineering247.com/article/next-gen-tech-driven-students-reach-for-the-stars/education-and-training)
- 2026–27 cycle: proposals were due Oct 22, 2026, selections are due Dec 3, 2026, and test week is May 16–20, 2027 at JSC. It is open only to US college students. — [NASA SUITS page](https://www.nasa.gov/learning-resources/spacesuit-user-interface-technologies-for-students/)

**BASALT / Minerva / SEXTANT (Mars analog)**
- [TESTED] NASA's BASALT program ran real field science at Mars analog sites (Hawaii, Idaho lava fields) "under simulated Mars mission conditions, including communication delays and data transmission limitations." Its software suite "Minerva" = xGDS (Exploration Ground Data Systems) + Playbook (timeline) + SEXTANT (Surface Exploration Traverse Analysis and Navigation Tool). xGDS calls SEXTANT to optimize routes, and the traverses are exported to Playbook. — [NASA NTRS 20170002364](https://ntrs.nasa.gov/api/citations/20170002364/downloads/20170002364.pdf); [PMC6442304, Minerva EVA ops (Astrobiology 2019)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6442304); [NTRS 20170002363](https://ntrs.nasa.gov/api/citations/20170002363/downloads/20170002363.pdf)
- [TESTED] SEXTANT's web interface was "the primary navigation method for the analog astronaut crew" in one deployment. An AR version, Holo-SEXTANT (HoloLens), was demonstrated. SEXTANT optimizes routes for metabolic cost, time and obstacle avoidance. — [MIT DSpace thesis 1721.1/119309](https://dspace.mit.edu/handle/1721.1/119309); [NTRS 20170002364](https://ntrs.nasa.gov/api/citations/20170002364/downloads/20170002364.pdf)
- BASALT lessons: tailor the interface to user role, real-time updates, search/tagging, and tighter coupling of timeline with traverse plans. — [NTRS 20170002364](https://ntrs.nasa.gov/api/citations/20170002364/downloads/20170002364.pdf)
- [RESEARCH] Path planning for human planetary surface exploration in rough terrain (Strathclyde). — [Strathclyde](https://pureportal.strath.ac.uk/en/publications/path-planning-for-human-planetary-surface-exploration-in-rough-te/)

**Horizon / landmark-based localization (closest technical match to the team's method)**
- [RESEARCH] NASA Goddard (Alvin Yew) is developing AI that renders the horizon from LRO LOLA elevation data and matches it to what a crewmember sees, to estimate location on the Moon. It is described as a backup to LunaNet. Paired with Goddard's GIANT tool, "a lost explorer could scan the horizon" and get a location and route back. Yew: "The motivation for me was to enable lunar crater exploration, where the entire horizon would be the crater rim." — [NASA "AI nav using landmarks on the Moon"](https://www.nasa.gov/technology/ai-nav-using-landmarks-on-the-moon/); [phys.org](https://phys.org/news/2022-12-nasa-ai-lunar-surface-landmarks.html)
- [RESEARCH] NASA 2024 paper on monocular lunar horizon navigation. — [NTRS Lunar Horizon Navigation SIW Paper](https://ntrs.nasa.gov/api/citations/20240011910/downloads/Lunar_Horizon_Navigation_SIW_Paper.pdf); [NASA optical navigation tech](https://www.nasa.gov/technology/goddard-tech/nasa-optical-navigation-tech-could-streamline-planetary-exploration/)
- [RESEARCH] Mars rover horizon-to-DEM matching: skyline from a rover panorama is compared with skylines rendered from a DEM (e.g., HiRISE) to give a position likelihood. A 2017 sensitivity study used MER Pancam and HiRISE DEMs. A test on MSL data located the rover 87% of the time to within 10 m. — [Mars rovers localization by matching local horizon to DEM](https://www.aminer.cn/pub/5c75707ef56def97986f7f24/mars-rovers-localization-by-matching-local-horizon-to-surface-digital-elevation-models); [UNR horizon matching (ISAIRAS 2014)](https://www.cse.unr.edu/~bebis/isairas14.pdf); [SpaceOps 2025](https://publications.spaceops.org/2025/download_by_id.php?id=0308)
- Known limits of skyline matching: parallax, distant skyline features, and accuracy "largely determined by the DEM resolution." — [CMU FSR 2019 lunar shadows paper](https://www.ri.cmu.edu/app/uploads/2020/05/FSR2019__Ray_Tracing_and_Use_of_Shadows_as_Features_for_Determining_Location_in_Lunar_Polar_Terrain__Camera_Ready.pdf); [arXiv 2106.12738](https://arxiv.org/pdf/2106.12738v1.pdf)
- [RESEARCH] ESA ALPER: vision-based absolute localization for planetary rovers. — [ESA ASTRA 2023](https://robotics.estec.esa.int/ASTRA/Astra2023/2023%20PAPERS/16_Germa_ALPER%20Vision%20based%20Absolute%20Localisation%20for%20Planetary%20Exploration%20Rovers.pdf)

**Other astronaut AR / UI research**
- [RESEARCH] A Princeton thesis tested a helmet-bubble AR interface in VR (HUD, cuff checklist, 3D navigation system) and found task time decreased with AR. — [Princeton DataSpace](https://dataspace.princeton.edu/handle/88435/dsp01x346d756n)

### Inferences
- "Show my position and the route home" is not new. Joint AR, SEXTANT/Holo-SEXTANT and dozens of SUITS teams already do it. "Estimate position from the horizon" is not new either (Goddard, Mars rover skyline papers). The team should present these as foundations they build on, not as their invention.
- The Apollo 14 Cone Crater episode is a strong, true story for the pitch: the crew were tens of meters from their goal but could not tell, because of featureless terrain and few landmarks. That is exactly the "where can you get lost" problem.

### Gaps
- I could not obtain the official SUITS 2025/2026 Mission Description PDF. Specific required features (e.g., breadcrumbs, return-to-airlock, LTV pathfinding, hazard pins) are not verified from primary text.
- Apollo LRV navigation (directional gyro, odometer and range/bearing to the LM) and cuff checklist/traverse maps were not fetched. The Apollo Lunar Surface Journal is the recommended source.
- I found no direct astronaut quotes or feedback from the JETT5 Joint AR tests.
- Haughton-Mars Project navigation lessons, LuNaMaps and LunaNet specifics were not retrieved.

## (c) Operational constraints (comm delay and outage, power, computing, suits, human factors)

### Takeaway
A real tool must work fully on board without Earth, run on radiation-tolerant low-power computers that are far slower than a laptop, and be controlled without touching the helmet and with clumsy gloves. It must also survive dust, extreme lighting and shadows, and must not overload the crew's attention.

### Cited Findings
- Communications: Mars one-way delay is about 3 to 22 min. Conjunction occurs about every 26 months, with blackouts of about 2 to 3 weeks. Relay coverage of the landing site can be about one third of each sol. — [NASA ASCEND paper](https://ntrs.nasa.gov/api/citations/20220013418/downloads/ASCEND-Communication%20Delays%2C%20Disruptions%2C%20and%20Blackouts%20for%20Crewed%20Mars%20Missions.pdf); [JPL](https://www.jpl.nasa.gov/edu/resources/video/mars-in-a-minute-what-happens-when-the-sun-blocks-our-signal/)
- Line of sight and walk-back: crew-to-crew and crew-to-asset comms may be lost through distance or terrain. EVA plans are bounded by walk-back distance. — [NTRS Surface EVA Architectural Drivers](https://ntrs.nasa.gov/api/citations/20230014957/downloads/Surface%20EVA%20Architectural%20Drivers.pdf)
- Computing: the RAD750 radiation-hardened processor tops out at about 200 MHz and has flown more than 150 times. NASA's next-generation HPSC (RISC-V, Microchip/SiFive) is reported at about 100x RAD750 for scalar work, 256 GFLOPS vector and 2 TOPS for 8-bit AI. The "500x" headline figure applies only to specific workloads. HPSC was still in testing and certification in 2025–26. — [NASA LPSC 2025 HPSC presentation (NTRS)](https://ntrs.nasa.gov/api/citations/20250002070/downloads/Powell-LPSC-2024-HPSC_for2025Mar12%2002252025_v2.pdf); [Aerospace Testing International](https://www.aerospacetestinginternational.com/news/nasa-tests-more-powerful-spacecraft-processor-to-enable-onboard-ai.html)
- Suit hardware: the AR visor solicitation required tolerance of radiation, thermal extremes and dust, and noted the crew cannot reach their head inside the suit, so head-mounted hardware must be built into the helmet. — [Mixed News on NASA AR solicitation](https://mixed-news.com/en/nasa-wants-to-equip-astronauts-on-lunar-missions-with-ar-displays/)
- Lighting: long shadows near the lunar south pole, and "pitch-black sharp shadows complicated object identification and obstacle avoidance". — [NTRS Surface EVA Architectural Drivers](https://ntrs.nasa.gov/api/citations/20230014957/downloads/Surface%20EVA%20Architectural%20Drivers.pdf); [JSOC 2024 manuscript](https://opsjournal.org/DocumentLibrary/Uploads/JSOC_2024_QTR%203%20Manuscript.pdf)
- Camera-based navigation is "not robust to lighting variations". — [SAE terrain-richness paper](https://saemobilus.sae.org/content/TBMG-36842)
- Ops lesson from VIPER: localization quality is checked by a dedicated "navigator" role before each drive. — [NTRS VIPER 2025](https://ntrs.nasa.gov/api/citations/20250004148/downloads/viper-2025-04-24.pdf)

### Inferences
- Design implication: precompute heavy parts on Earth or in the habitat, such as rendering horizons from DEMs and computing the "localizability" layer. Carry only lightweight lookups into the suit or rover. This fits both HPSC-class limits and comm outages.
- Mars dust (storms, haze) reduces visibility of distant horizons, so a dust-dependent reliability layer is physically motivated. But I found no source that quantifies horizon-matching degradation versus Mars optical depth, so this needs to be framed as a hypothesis or model.

### Gaps
- I found no specific numbers for suit-electronics power budgets.
- NASA HSIR / NASA-STD-3001 display design guidance for HUDs (font size, clutter, colour) was not retrieved. Glove touch-input limits and voice-control studies were also not retrieved.
- I found no quantitative study of how Mars dust optical depth affects horizon-based localization.

## (d) Features and usability that astronauts actually need

### Takeaway
The features that recur in field tests and NASA solicitations are navigation to targets and back to the lander or rover, consumables status, procedures and timeline, photo and science capture, and mission control updates. These should be glanceable and hands-free. Planners want routes tied to the timeline. Credible extras are position uncertainty and "can I find my way back" confidence.

### Cited Findings
- Joint AR feature set tested by astronauts: navigation, photo capture, graphical consumables, procedures, mission control updates, AR cues. Multiple navigation inputs were fused (GPS/IMU, camera/IMU, LiDAR, static maps). — [Astrobiology.com / NASA JETT5](https://astrobiology.com/2024/06/09/tricorder-tech-artemis-away-team-field-test/)
- NASA AR solicitation content: navigation information, procedural text, telemetry, photos and video for 6–8 h EVAs, usable when contact with Earth is lost. — [Mixed News](https://mixed-news.com/en/nasa-wants-to-equip-astronauts-on-lunar-missions-with-ar-displays/)
- NASA architecture: guidance to "destinations and back," to "targets specifically designated by the science team". — [NTRS Surface EVA Architectural Drivers](https://ntrs.nasa.gov/api/citations/20230014957/downloads/Surface%20EVA%20Architectural%20Drivers.pdf)
- BASALT: integrate traverse plans with the timeline, and tailor views by role (crew vs science backroom). — [NTRS 20170002364](https://ntrs.nasa.gov/api/citations/20170002364/downloads/20170002364.pdf)
- RASAGE prototype: integrated timeline + navigation + physiological monitoring for onboard decision support. — [UC Davis RASAGE](https://bioastro.ucdavis.edu/rasage)
- Apollo 14 lesson: the crew lacked reliable position and distance estimates in featureless terrain, and consumables (oxygen) plus walk-back time ended the traverse. — [NASA SVS](https://svs.gsfc.nasa.gov/4883); [NASA SP-350](https://www.nasa.gov/wp-content/uploads/static/history/SP-350/ch-12-6.html)

### Inferences
- A minimal credible HUD for the team:
  1. Position with an uncertainty circle.
  2. Route home, with a walk-back time versus consumables margin.
  3. Hazard warnings (slope, rocks, shadow).
  4. Next science target.
  5. A "localization confidence" indicator, e.g. green, yellow or red: horizon fix reliable here or not.
- Keep the HUD minimal and put the full layered map on the habitat display or tablet used for planning. This matches the challenge brief's options and avoids clutter.
- Breadcrumbs (a recorded track) are a common SUITS-style feature, but this is not verified from primary SUITS text here.

### Gaps
- I found no published astronaut ranking of desired features. No primary SUITS requirement list was obtained.

## (e) Differentiation of the "where can you get lost" layer, and what Space Apps judges value

### Takeaway
The concept of a map that predicts where localization will be reliable already exists in robotics, under names such as "localizability maps", "belief-space planning" and "uncertainty-aware path planning". There is even planetary work on rover horizon-matching certainty (CMU, ICRA 2019). What appears new is turning this into a human-facing EVA planning and HUD layer for Mars: built from NASA orbital DEMs, varying with dust and lighting, and tied to walk-back and safety. Judges score 1–5 on Impact, Creativity, Validity, Relevance (including meaningful NASA data use) and Presentation. Crediting prior work while showing this human/Mars twist fits Creativity ("improvement upon existing ideas in a meaningful way") and Validity.

### Cited Findings
**Prior art the team must credit**
- [RESEARCH] Nardi & Stachniss (ICRA 2019), "Uncertainty-Aware Path Planning for Navigation" (Univ. Bonn): uses an uncertainty-augmented MDP and builds a localizability map (from OpenStreetMap) to choose routes that avoid poorly-localizable areas. — [Bonn PDF](https://www.ipb.uni-bonn.de/pdfs/nardi2019icra-uapp.pdf); [earlier version](https://www.ipb.uni-bonn.de/wp-content/papercite-data/pdf/nardi2018ppniv.pdf)
- [RESEARCH] Schirmer et al. (IROS 2017): estimates localizability at all map locations and runs a belief-space heuristic search. In the ICRA 2019 follow-up, a localizability prior is combined with odometry drift for coverage planning. — [IROS 2017](https://www.ipb.uni-bonn.de/pdfs/schirmer17iros.pdf); [ICRA 2019](https://www.ipb.uni-bonn.de/wp-content/papercite-data/pdf/schirmer2019icra.pdf)
- [RESEARCH] MDPI Sensors 2021: localizability measure from the likelihood over a prior map, used to build a "localizability-aware map", with localizability and energy in the trajectory cost. — [MDPI Sensors 21(2):335](https://mdpi.com/1424-8220/21/2/335/htm)
- [RESEARCH] arXiv 2403.04936: a per-cell uncertainty "virtual map" used as a planning cost map. It notes that earlier localizability work often stops short of path planning. — [arXiv](https://arxiv.org/html/2403.04936v1)
- [RESEARCH] Gao et al.: evaluation functions for how localization uncertainty affects path safety. — [IIETA JESA](https://iieta.org/journals/jesa/paper/10.3166/JESA.50.435-448)
- [RESEARCH, planetary] CMU ICRA 2019: belief-space planning for planetary rovers. It notes that the path a rover takes affects its localization certainty and uses horizon matching as the terrain-relative navigation example. This is the closest prior art to the team's idea, but for robots, not astronauts. — [CMU ICRA19](https://www.ri.cmu.edu/app/uploads/2020/05/ICRA19_1775_FI.pdf)
- [OPERATIONAL, analogous] Mars 2020 Terrain-Relative Navigation (LVS) matched descent images to an onboard CTX-based map (position error under 40 m). It used a 25 cm/pixel HiRISE-derived hazard map so the lander could steer away from hazards. This let NASA land in Jezero, previously "considered too hazardous." This is a precedent for "orbital map + onboard matching + hazard layer = safe access to a risky site". — [JPL Robotics TRN](https://robotics.jpl.nasa.gov/what-we-do/flight-projects/mars-2020-rover/terrain-relative-navigation); [USGS Mars 2020 TRN CTX DTM mosaic](https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic); [phys.org on hazard map](https://phys.org/news/2020-07-mars-mission-usgs-astrogeology.pdf)
- [RESEARCH] Terrain "richness" and its impact on navigation (small bodies, 3D range sensors). — [SAE/NASA Tech Briefs](https://saemobilus.sae.org/content/TBMG-36842)

**Space Apps judging (official, 2026 site)**
- At every level (Local, Universal, Executive), projects are scored 1–5 on five criteria — [Space Apps Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide):
  - Impact: size of the problem and how many it helps or inspires.
  - Creativity: "introduces a novel concept that has not been attempted before or presents an improvement upon existing ideas in a meaningful way."
  - Validity: "grounded in scientific principles," feasible, could function in the real world, complete, usable and user-friendly.
  - Relevance: fully addresses the challenge and "meaningfully integrates NASA data, utilizing it as a core component... rather than a superficial addition."
  - Presentation: storytelling, clarity. The guide says teams should "pay equal attention to the final criterion: presentation."
- Submission: a demo of either 7 slides max (including title) or a 30-second video max. English is required on the submission page; a video may be spoken in another language but must include English (likely subtitles). Global Finalists will be announced Dec 17, 2026, and Global Winners on Jan 26, 2027. — [Space Apps Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide)
- Global award categories: Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact, Best Mission Concept ("most plausible concept and design"), Most Inspirational, Best Storytelling, Global Connection, Art & Technology, Local Impact. — [Space Apps Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide)
- The 2026 Space Apps hackathon runs Nov 14–15, 2026. NASA framed the 2026 theme around building "the ultimate interplanetary survival guide," with several challenges on Martian surface operations that combine data from multiple Mars missions. — [NASA Science](https://science.nasa.gov/universe/nasa-welcomes-all-ages-experience-levels-for-space-apps-challenge/); [Astrobiology.com registration notice](https://astrobiology.com/2026/09/04/registration-is-now-open-for-the-2026-nasa-space-apps-challenge/)
- A third-party write-up of the Martian map challenge lists inputs such as MOLA topography, CRISM mineralogy and rover ground truth (unverified, not official). — [dev.to](https://dev.to/walsal201/astromind-4ji4)

### Inferences
- Honest positioning: "We apply known robot localizability and belief-space planning ideas (Bonn, CMU) and NASA's horizon-navigation work (Goddard) to a new user (a suited astronaut on Mars) and a new variable (dust and lighting). We present it as a map layer people can read, linked to walk-back safety." Avoid claiming "never done before" for the core concept.
- Concrete differentiators that no source found here shows together:
  1. A layer for human EVA planning showing where a horizon fix is reliable, computed from NASA HiRISE/CTX/MOLA DEMs.
  2. Reliability that varies with atmospheric dust (visibility range) and sun angle.
  3. Routes that trade distance against "never be in a red zone longer than X minutes" or "always keep the habitat or a unique landmark visible".
  4. A walk-back margin tied to consumables.
  5. Apollo 14 as a validation story.
- These map well to Creativity (meaningful improvement), Relevance (NASA DEMs as the core), Validity (cite Mars 2020 TRN and the MSL horizon-matching result of 87% within 10 m as feasibility evidence) and the Best Mission Concept / Best Use of Data awards.
- Real-world value: NASA itself treats localization quality as an operational check (VIPER navigator role). Mars 2020 shows NASA adopts map-based localization when it opens otherwise-too-risky sites. Realistic adoption path: a planning aid in xGDS/SEXTANT-style tools and an input to Joint AR-type displays, not a standalone product.

### Gaps
- No examples of past Space Apps global winners for similar Mars map or visualization challenges were retrieved.
- The official 2026 challenge statement text for "Interplanetary Survival Guide: Martian Map" was not fetched from spaceappschallenge.org.
- I found no published work specifically combining localizability maps with human EVA planning, or with Mars dust. Absence of evidence after limited searching is not proof of novelty.
