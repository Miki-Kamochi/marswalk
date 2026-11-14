# Marswalk — NASA Space Apps 2026

## The challenge
"Interplanetary Survival Guide: Martian Map": create a layered, integrated view of a
location or route on Mars, using data from multiple NASA missions, that helps a human
explorer plan and carry out a Marswalk while doing new science.

## Our angle
Mars has no GPS and no global magnetic field, so a compass doesn't work either.
Robots can stop and wait when lost; astronauts can't, because their oxygen runs out.
And with up to ~24 minutes of signal delay each way, they can't wait for Earth to help.
Apollo 14's crew couldn't find a crater rim they were standing close to. Mars,
with its closer horizon and hard-to-judge distances, is harder.
The problem is the same anywhere on Mars; Gale Crater is our demo location.

## Location: Gale Crater, foot of Mount Sharp
A ~2–3 km area around Murray Buttes, along Curiosity's real route. It has a mix of:
- distinct landmarks: Mount Sharp (~5 km high, visible from everywhere), the Murray
  Buttes mesas, Vera Rubin Ridge, small craters;
- a confusing look-alike zone: the dark Bagnold Dunes, where every dune looks the same
  and the sand is a hazard.
Why a human would go here: low crater floor (safer landing), near the equator (warmer,
more solar power), the best-understood ground on Mars thanks to Curiosity, and big
science (Gale was once a lake).
Verify all positions from the data. Hide the map edge with haze; Mount Sharp and the
crater rim as low-detail backdrop.

## The story: "Following Curiosity"
In 2012 a robot landed in Gale Crater and spent years climbing toward Mount Sharp.
Now the first humans follow.

1. Arrival: the player lands near Murray Buttes, Mount Sharp towering on the horizon.
2. Plan: a layered mission map (terrain, slopes, minerals, Curiosity's route, weather,
   each from a different NASA mission). Review the route and stops.
3. Mission "EVA-1: The Lake Rocks":
   - Murray Buttes: scan the rock layers (each layer is a chapter of Mars's past).
   - Edge of the Bagnold Dunes: sample the sand / place a wind sensor
     (the player sees how alike the dunes look).
   - Vera Rubin Ridge (main goal): collect a hematite sample. MRO's CRISM detected
     hematite here from orbit; it often forms in water.
4. Storm: dust rolls in. Mount Sharp disappears. The wind fills in your footprints.
   "GPS LOST. There is no GPS on Mars." You start drifting toward the dunes without
   realizing it.
5. Wayfinder brings you home: it never needed your eyes. It kept your path, catches
   the drift, and locks on when a butte briefly appears through the dust.
6. Reveal: the path you thought you took (into the dunes) vs. the real one.
   Closing line: "In 2018, a dust storm ended the Opportunity rover's mission.
   This time, we made it home."

MVP: only the hematite stop + the storm + getting home. Add the other stops later.

## Wayfinder: the tool at the center
A GPS-free navigator for astronauts that switches methods as conditions change:
- When you can see: real landmarks actually visible from where you stand, and the
  sun's real position at Gale as a compass. Directions a human understands
  ("keep the buttes on your left, sun on your right"), not coordinates.
- Always: quietly records your path from steps and heading.
- When you can't see: guides you back along that recorded path, re-correcting with
  nearby landmarks whenever visibility returns.
- Watches safety: oxygen, distance home, drift toward hazards (dunes), and warns you
  to turn back early.
- Possibly: an "I'm lost" mode that matches the horizon shape to the terrain to
  find where you are.

## How Wayfinder works (real techniques; simulate them honestly)
- Dead reckoning: estimate position from step count, stride length and heading
  (like a suit's motion sensors). Small errors add up over distance, so the estimate
  slowly drifts. Simulate realistic sensor noise; don't let it be perfect.
- Sun compass: compute the sun's real direction in Gale's sky for the in-game
  time and date (e.g. NASA's Mars24 method). Knowing where the sun is gives a true
  heading. Gets weaker as dust thickens and fails once the sun is hidden.
- Landmark visibility: from the real elevation data, work out which landmarks are
  actually visible from the astronaut's eye height (line of sight). Mars's horizon is
  only ~3.4 km away for a standing person, closer than on Earth (Mount Sharp is the
  exception: it's tall enough to see from far away).
- Landmark position fix: the bearing (direction) to two or more known landmarks
  pins down where you are, like old-school navigation. Each fix resets the drift.
- Horizon matching: compare the shape of the skyline you see to skylines computed
  from the terrain data to recover your position when lost.
- Breadcrumbs: the recorded path is the safest way home when you can't see,
  since you already walked it.
- Combining them: Wayfinder blends whatever sources are available right now and
  knows how sure it is. Show this honestly, e.g. an uncertainty circle that grows
  as drift builds up and shrinks after a landmark or sun fix.
- The game tracks the astronaut's true position separately from Wayfinder's
  estimate. The gap between them is the real problem, and the end reveal shows it.

## Controls
- Desktop: first-person, look around with the mouse.
- Phone: first-person with regular touch controls, plus a "look-around" mode where
  turning the phone changes the view (like looking through a window onto Mars),
  so it can be played standing in place in a small room.

## Visual style
- Faceted low-poly with flat shading, inspired by games like The Planet Crafter but
  even more polygonal. Original assets only; style reference, not copying.
- Terrain triangles colored from real NASA imagery so the real data stays visible.
- Must run smoothly on phones.

## Ideas we like (not requirements)
- A helmet-style display (HUD) for Wayfinder.
- Map layers (slope, minerals, etc.) can recolor the 3D terrain itself, so the
  layered view lives inside the world, not only on a 2D map.
- More events that each take away a navigation method: sunset (sun compass fails,
  cold), comms blackout, a solar radiation alert where Wayfinder finds the nearest
  shelter behind a butte instead of home, dust devils.
- Landing intro; Curiosity's real route shown on the map.
- Feeling how distances on Mars are deceiving.

## What success looks like
- A judge understands the problem and the solution within a few minutes of playing.
- Real data from several NASA missions, covering the full challenge brief.
- The navigation approach is realistic enough to survive questions from an expert.
- Works on a laptop and on a phone in a small room.

## Non-negotiables
- Runs in a web browser, no backend.
- Real NASA data, credited by mission.
- The visual style above.
- A working demo at every stage; we have 48 hours.

## Preferred tech stack (change it if you have a strong reason; tell me why)
- Vite + TypeScript. Plain static site; no Next.js or server rendering needed.
- Three.js for the 3D world (terrain, astronaut, storm, first-person camera).
- Leaflet (or similar) for the 2D layered mission map.
- HTML/CSS overlay for the HUD and menus.
- Phone sensors through the browser's DeviceOrientation / DeviceMotion APIs
  (needs HTTPS and a tap-to-allow on iPhone).
- Python + GDAL / rasterio for the one-time data processing scripts.
- Static hosting (Vercel, Netlify or GitHub Pages) with HTTPS so phones can test it.

## Data and assets
- Find and download the NASA data you need yourself. Prefer official NASA / USGS /
  PDS / HiRISE sources. Likely starting points (verify):
  - HiRISE DTM + orthoimage over Murray Buttes and the ridge (the UArizona HiRISE DTM
    from stereo pair PSP_009650_1755 / PSP_009716_1755 reportedly covers both).
  - Lower-resolution elevation for the Mount Sharp / crater rim backdrop (e.g. MOLA).
  - CRISM mineral data (hematite on Vera Rubin Ridge), Curiosity's traverse,
    Curiosity REMS weather data.
- Ask me before any single download over ~500 MB.
- Keep raw files in data/raw/ (not committed to git) and process them into small
  web-ready files in /public.
- Never open or print large data files (data/raw/, big JSON, images). Inspect them
  with scripts that print only sizes, headers and summaries.
- List every dataset, its mission/instrument and source link in DATA_SOURCES.md.
- Build the 3D models yourself in the same faceted low-poly style (astronaut,
  lander/base, rocks, etc.). Anything we add later goes in public/models/.

## Your role
You decide how to build it, and feel free to improve the idea itself.
Propose your plan before starting work. Commit after each working piece.
Use the browser testing tool to check your work and up-to-date library docs
instead of guessing APIs.
