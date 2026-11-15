# AresSight design

How Marswalk should look and behave.

## 0. What AresSight is (decided)

The app is called **AresSight** (renamed from Marswalk on 2026-11-15; the repository keeps its name). It is **a planning display inside the crew's habitat**. It is one of the formats the challenge suggests. The crew uses it to prepare an EVA (spacewalk on foot) at Gale Crater. It is a working tool for astronauts, **not a game**. Every screen should look like it belongs on a mission console: calm and operational, with real data and one clear next action.

- **Look (decided 2026-11-15, final revision):** simple and clean, rounded (pill inputs and buttons, round tool buttons, 16-22 px panel corners), warm near-black, one orange accent, thin type. Deliberately not a copy of Google Maps (no blue "you are here" dot, no teardrop pin). The 3D is a **subtle pixel rendering**: faceted low-poly surfaces drawn at a fraction of the screen resolution and scaled up with crisp pixels, matching the walk preview's polygon terrain. Markers are a square habitat, a flag on a stake for the goal and diamonds for photo checks.
- **Home:** black space with a faceted pixel Mars in the centre (Viking colour mosaic, lit from the side so a night half shows, slowly turning, can be dragged). A "Gale Crater" label follows the marker on the globe. "Ares" and "Sight" sit either side. Below: one search bar with **New plan** inside it. Bottom right: a **History** (履歴) button that opens a menu upward with saved plans and science targets as two tabs (targets only, until a plan is saved). Font: Space Grotesk. Brighter two-layer pixel stars.
- **Shared rules (every page):** one spacing rule, `--edge` (16-28 px) from any screen edge and `--gap` (12 px) between floating things; one glass value, `--glass` (85 % opaque warm black with a 12 px blur), for every panel, button, bar and menu. Both live in `src/site/site.css`. The top bar (logo, Introduction / How it works / Credits, language) is the same on home and the reading pages.
- **Step pages (Introduction, How it works):** one idea per screen with a big visual and short words, built on `src/site/steps.ts` (next/back, arrow keys and clickers, swipe, `#n` or `#slide-name` jumps, full screen). Made for presenting and for reading alone.
- **Plans (projects):** every planner session is a plan, saved automatically in the browser (localStorage, no backend) once a destination is chosen. The name follows the destination until the user renames it in the panel header. `sim.html?project=<id>` reopens one.
- **Planner:** choose a destination and compare routes. This is the core tool. Kept short on purpose (decided 2026-11-15):
  - **Panel (left, fits its content):** plan name, Start / Goal, then the four routes as compact rows (name, time, distance, total O₂). The recommended one has a small badge. The selected route has a **Details** dropdown (closed at first) with the one-line reason, the three checks and the oxygen bar. No language switch here (it follows the home screen); no visible scrollbar.
  - **Tool rail (top right):** layers, 2D / 3D, fit route, north-up, zoom.
  - **Layers are heat maps:** Safety (red → amber → green, no-go dark red) and Easy to locate (violet = easy to get lost → cyan = easy to locate), plus hematite. Every cell is coloured by its score, so the really good ground stands out, not only the bad.
  - **Bottom:** a small "Profile" pill with the climb and the worst position error; tap to open the elevation and position-error chart.
- **Walk preview:** the first-person view, reframed as a preview of what the ground looks like along the route (the challenge suggests point-of-view images). It must not use game wording.
- **Conditions** come from Curiosity's REMS weather station and are shown for information only. Routes are planned from terrain, not weather.
- **Balance:** a cinematic presentation (creativity and presentation are judged), but framed as mission software, with practical working screens.
- **Ruled out:** game wording ("play", "start", "expedition"), a separate title screen, pixel-art or retro styling, a marketing landing page, and generic dashboard cards.

The three reference images set the general mood: dark, warm, quiet. We borrow qualities, not layouts or artwork.

---

## 1. What is wrong today

Seen from someone who opens the simulator for the first time:

| Problem | Where | Why it hurts |
|---|---|---|
| **No starting point.** Four routes, a map layer, a legend and two sliders are all on screen at once. Nothing says "do this first". | Simulator | A judge does not know where to look or what to click. |
| **Jargon.** "Localizability", "walk-back limit", "position error limit", "photo fix". | Simulator, How it works | The words only make sense after reading the explanation. |
| **Four routes look the same.** They differ by about 3 % in distance, and each card shows four small numbers. | Simulator | The comparison, which is the whole point, is invisible. |
| **Noisy map.** The red-to-green heat maps cover the whole image, so the actual ground and the routes are hard to see. | Simulator | The real NASA imagery, our best asset, is hidden. |
| **Controls are scattered.** The view switch is top right, layers float on the map, the sliders are at the bottom of a scrolling panel, and the route details are below the route list. | Simulator | You have to scroll and hunt. |
| **Long text pages.** "How it works" is a wall of text and tables. | How it works | Nobody reads it during a 5-minute judging slot. |
| **Generic look.** It reads as a developer tool, not as a product. | All pages | Presentation is one of the five judging criteria. |

## 2. Goals

1. **Understood in 30 seconds.** A judge who has never seen the project should, without help:
   - pick a destination,
   - see the recommended route,
   - understand why it was chosen over the shortest one.
2. **One thing at a time.** Every screen has one main action. Everything else is hidden until it is needed.
3. **Plain words first, details on request.** Each idea gets a short name a high-school student understands. The technical name and the method sit one tap away.
4. **The ground is the hero.** Real HiRISE terrain stays visible. Our layers highlight only what matters instead of covering everything.
5. **Looks like a mission console.** Dark, calm and precise, with one warm Mars accent.

## 3. Visual language

### Mood
A mission planning console on a dark night above Mars:
- near-black, slightly warm backgrounds;
- a soft orange glow, as if Mars or a sunrise were just out of frame;
- thin orbit arcs and rings around key elements;
- large, quiet headlines and small uppercase labels;
- generous empty space.

### Colour

One accent only. Orange means "this is the important thing" (the recommended route, the main button). Nothing else is orange.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0908` | Page background |
| `--surface-1` | `#151210` | Panels |
| `--surface-2` | `#1e1916` | Cards, inputs |
| `--line` | `rgba(255,255,255,0.08)` | Borders, dividers, orbit lines |
| `--text` | `#f4ede6` | Main text |
| `--text-2` | `#a39a92` | Secondary text |
| `--text-3` | `#6d655f` | Labels, hints |
| `--accent` | `#ff6b2c` | Recommended route, primary button, active state |
| `--accent-glow` | `#ffb27a` | Glow gradients behind hero elements |
| `--ok` | `#5fd3a0` | "Fine" states (rules passed) |
| `--warn` | `#ffc75a` | Caution |
| `--danger` | `#ff5a5a` | No-go, failed rule |
| `--info` | `#7cc8ff` | Position / localization data |

Map overlays use their own colours (section 5) so they never compete with the accent.

### Type

- **Latin:** a geometric sans such as *Manrope* or *Space Grotesk*. Headlines are 600–700 weight with slightly tight letter spacing. The wordmark is spaced wide, like "ESCAPE".
- **Japanese:** *Noto Sans JP*.
- **Numbers:** tabular figures in a mono or semi-mono face (for example *JetBrains Mono*), used for distances, minutes and percentages, as in the SpaceFox "73%" gauge.
- Self-host the fonts through npm `@fontsource` packages, so the site works offline at the venue and sends no requests to outside services.

| Style | Size / line height | Use |
|---|---|---|
| Display | 56–72 / 1.05 | Home hero only |
| H1 | 32 / 1.15 | Page titles |
| H2 | 22 / 1.25 | Section titles |
| Body | 15 / 1.55 | Text |
| Label | 11, uppercase, +0.12em tracking, `--text-3` | Above titles and numbers ("CURRENT METRICS" style) |
| Data | 28 mono | Big numbers in cards |

### Shapes and depth

- Radius: 20 px for panels, 14 px for cards, 999 px for pills and icon buttons.
- Panels use `--surface-1` with a 1 px `--line` border. Floating panels add `backdrop-filter: blur(16px)` over a 70 % opaque surface.
- Shadows stay soft and wide. Depth comes mostly from glow, not from drop shadows.
- **Orbit motif.** A thin 1 px arc (`--line`, or the accent at 40 %) partly circles important objects: the hero planet, the oxygen gauge, the destination pin. We use it sparingly, for no more than 2–3 objects per screen.

### Icons
A single line-icon set at 1.5 px stroke, for example *Lucide*, installed from npm. No emoji.

### Motion
- 150–250 ms ease-out for UI changes.
- Routes draw in along their path (about 600 ms).
- The hero glow breathes slowly.
- With `prefers-reduced-motion`, everything is instant.

## 4. Information architecture

```
EVA briefing (first screen)       objectives · conditions · 3D site view → [Plan EVA route]
 ├─ Planner                       the core tool (opens with a destination from the briefing)
 ├─ Walk preview                  first-person view along the route (prototype)
 ├─ How it works                  method, layers, rules, assumptions
 └─ Data & credits
```

A judge reaches the planner in one click from the briefing.

Top bar on every page: the wordmark on the left. On the right: Planner, Learn, Credits and the language toggle (`EN / JA`).

## 5. The planner (simulator): new layout and flow

### Layout (desktop)

```
┌──────────────────────────────────────────────────────────────────────┐
│ MARSWALK                              Planner  Learn  Credits  EN|JA │
├──────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐                                         ┌─────────┐ │
│ │ STEP PANEL   │          FULL-BLEED MAP (3D or 2D)       │ 2D | 3D │ │
│ │              │                                         └─────────┘ │
│ │ 1 Destination│                                                     │
│ │ 2 Routes     │                                                     │
│ │ 3 Details    │                                                     │
│ │              │                                                     │
│ └──────────────┘                                                     │
│        ┌──────────────── LAYER DOCK ────────────────┐                │
│        │  Ground  ·  Safety  ·  Getting lost  ·  Science │           │
│        └────────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────┘
```

- **The map fills the whole window.** 3D is the default, because it impresses. A small `2D | 3D` pill sits top right. The side-by-side split view is removed: it halves both views and confuses people.
- **Step panel (left, floating, about 380 px).** One step is open at a time, like a wizard. Finished steps collapse into a one-line summary that you can click to reopen.
- **Layer dock (bottom centre, floating pill bar),** like the SpaceFox bottom navigation. It has 4 large, labelled toggles. Only one map layer can be on at a time. The default is *Ground* (plain imagery).
- **Legend:** appears above the dock only while a layer is on, as one line, for example "red = no-go · amber = careful".

### The flow

**Step 1: "Where do you want to go?"**
- Three large destination cards, one per science target. Each has a thumbnail, a one-line reason ("Hematite: a sign of ancient water") and the distance from base.
- Below them: "…or click anywhere on the map."
- First visit: a short hint near the map. It pulses once and fades.
- On hover over the map, a small tooltip says what is there in plain words, for example "Safe ground · Easy to locate · Hematite".

**Step 2: "Choose your route"**

After a destination is picked, the camera flies to fit the routes. The step shows:

```
┌ RECOMMENDED ────────────────────────────┐
│ ● Balanced                    2.92 km   │
│   1 h 41 min  ·  O₂ 30 %  ·  ✓ ✓ ✓      │
│   "Avoids sand and keeps you locatable" │
└─────────────────────────────────────────┘
  ○ Shortest          2.84 km   +473 m blind
  ○ Least oxygen      2.93 km
  ○ Easiest to locate 2.90 km
```

- **The recommended route is drawn in accent orange and glows.** The others are thin grey lines and light up on hover.
- **Each card has one sentence saying what makes this route different,** generated from the numbers. For example: "Shortest, but 473 m where you can't check your position" or "Least oxygen: goes around the climb".
- **"✓ ✓ ✓" are the three safety rules.** A failed rule turns red and explains itself in one line.
- **Compare toggle.** It shows a small table of the four routes, with the best value in each row highlighted.

**Step 3: "Your Marswalk"**

Details of the selected route:
- **Oxygen ring gauge** (orbit motif), split into out / work / back / reserve, with a big mono "60 % left" in the middle.
- **Timeline strip** along the route: start, photo checks, sample site, home. This replaces the error saw-tooth chart. That chart stays as an expandable "How sure are we of the position?" with a plain-language caption.
- **Three rule badges:** "Safe ground", "Never lost (≤ 20 m)", "Can always walk home".
- **"What if…?" scenarios** replace the raw sliders:
  - "Suit oxygen already at 50 %": shows the walk-back limit closing in.
  - "Stricter position accuracy (6 m)".
  - "Start from the forward camp".

  Each is a one-tap chip. The exact sliders stay under "Advanced".

### Words (rename everywhere)

| Now | Plain name in the UI | Technical name, shown in tooltips and Learn |
|---|---|---|
| Localizability layer | **Getting lost risk** (or "Can I check my position?") | Localizability: predicted photo-match success (MGL principle) |
| Photo fix | **Position check** | Photo matched to the HiRISE image |
| Walk-back limit | **How far you can go and still get home** | Walk-back limit (Apollo) |
| Position error limit | **Position accuracy** | Max dead-reckoning error |
| Blind distance | **Stretch without a position check** | — |
| Safety layer | **Safe ground** | GESTALT-style tilt / roughness / step |
| Hematite layer | **Science: hematite** | CRISM BD860 |

Japanese gets the same treatment: plain words first (迷いやすさ, 位置確認, 帰れる範囲), technical terms in the tooltip.

### Map overlays: show only what matters

- **Safe ground:** normal ground is left untouched. Caution areas get an amber tint. No-go areas get a red hatch. Only about 10 % of the map is coloured, so the terrain stays readable.
- **Getting lost risk:** only the cells where a position check fails are coloured (violet, `#9b7bff`, which is distinct from the accent and from red), with soft edges. Good ground is left alone.
- **Science:** a magenta-pink glow for hematite. Areas CRISM did not observe are greyed slightly and labelled once.
- **How far you can go:** everything beyond the limit is darkened. The edge is drawn as a thin dashed orbit-style line.
- **Routes:** recommended in accent orange, 5 px, with a glow. Alternatives are white at 40 % and 2 px. Position-check points are small white rings, not filled dots. Start: a base icon in a ring. Destination: a pin with an orbit arc.
- **Colour blindness:** the red/amber states also differ in pattern (hatch versus flat), and the violet layer does not rely on a red/green contrast.

### Mobile (≤ 860 px)
- The map stays full screen.
- The step panel becomes a **bottom sheet** with three heights: peek (step title and the main number), half, and full.
- The layer dock becomes a row of icon buttons above the sheet.
- 3D works on phones, but starts in 2D if the device is low-end (coarse pointer and a small screen).

### Empty, loading and error states
- **Loading:** the planet glow with a progress line ("Loading Gale Crater terrain… 60 %"), not plain text.
- **Clicked on no-go or unreachable ground:** an inline card next to the pin says, in one sentence, why there is no route, and offers "Move to the nearest safe spot".
- **Calculating:** route cards show skeleton shimmer. Routes appear one by one.

## 6. Home (first screen)

Built (`index.html`, `src/site/home.ts`, `src/site/globe.ts`; saved plans in `src/site/projects.ts`). Layout follows the reference of a centred globe with the title split around it.

- **Globe:** icosphere with about 12,500 facets, each coloured from the Viking mosaic at its centre (`public/img/home/mars.jpg`, made by `scripts/globe.py`). Rendered at 1/3 resolution (1/2 on phones) with `image-rendering: pixelated`. A thin warm atmosphere rim on the lit side; a few pixel stars. Reduced motion: it stands still.
- **Title:** "Ares" left of the globe, "Sight" right of it; on phones one line above the globe. A "Gale Crater" label sits next to the marker on the globe.
- **Below:** search pill (thin warm gradient ring) with **New plan** inside. **Bottom right:** the History menu (saved plans: name, when, delete; science targets).
- **Top:** "AresSight", page links and the language switch. **Bottom:** data credit.
- The earlier menu over the 3D terrain is in git history (`4b3a02e`); the console version with a plans table is `1cbb4c5`.

## 7. Learn page (today's "How it works")

- Same order as now, but each section opens with **one picture and one sentence**. Details sit in an expandable "Deep dive" (the tables, formulas and assumptions).
- Pictures to make:
  - photo-matching diagram (patch, slide, unique or not);
  - GESTALT plane diagram (tilt, roughness, step);
  - error saw-tooth;
  - walk-back circle.

  All are simple inline SVG in the same line style.
- The assumptions table and the "limits" list stay, and are easy to find. Judges value honesty.

## 8. Accessibility and quality bar

- Text contrast is at least 4.5:1. The accent on dark is used for large text and fills only.
- Everything can be reached with the keyboard, with a visible focus ring (accent, 2 px).
- Map clicks have a keyboard alternative (the destination cards).
- `prefers-reduced-motion` is respected.
- Works at 1280×720 (projector) and on a phone, with no horizontal scroll.
- Both languages fit without overflowing. Check the longest Japanese strings.

## 9. Build plan

Each step ships something that works and is committed on its own.

1. **Design tokens and fonts.** Rewrite `src/site/site.css` around the tokens above and add the fonts and icons. Every page picks up the new look.
2. **Planner layout.** Done as a docked plan panel with route options (see section 0). The Leaflet 2D map and the split view are removed.
3. **Planner flow.** Steps 1–3, the recommended route, route sentences, rule badges and the renamed words.
4. **Overlays.** Highlight-only colouring, new route styles and pins.
5. **Oxygen gauge, timeline and "What if…" chips.**
6. ~~Home page~~ → EVA briefing screen (done).
7. **Learn page** with pictures and deep dives.
8. **Mobile bottom sheet** and a final pass at 1280×720 and on a phone.

## 10. Open questions

- **Name of the localizability idea in the UI:** "Getting lost risk" or "Can I check my position?" The first is shorter. The second is more accurate.
- **Default view:** 3D (more impressive) or 2D (easier to read)? This plan proposes 3D, with the camera fitted to the routes.
- **Game:** keep it in the footer as "Prototype", or remove it from the site?
- **Fonts:** decided: Space Grotesk (self-hosted), which suits the pixel 3D.
