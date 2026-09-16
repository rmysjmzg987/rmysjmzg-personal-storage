# Satellite Orbit Viewer

A self-contained, front-end-only 3D satellite orbit visualiser. It uses real TLE data and computes every satellite position from **your device local time** in real time. Click any satellite to zoom in and lock on, while a highlighted cone shows the sensor footprint it is sweeping right now.

> Data accuracy is for demonstration and visualisation only — not for operational use.

## Highlights

- **Real orbits**: 18 preset satellites covering nine orbit classes — equatorial LEO, polar, Sun-synchronous, low Earth, medium Earth, inclined geosynchronous, geostationary, highly elliptical (Molniya) and retrograde.
- **Click to lock on**: click a satellite dot, or just its orbit line, and the camera flies in to a "satellite above, Earth below" framing; release to return to the global view.
- **Sensor footprint**: a field-of-view cone plus a ground coverage ring follows the satellite; cities inside the shot turn gold and pulse, and cities the cone has just swept past keep a warm afterglow.
- **Detail card**: orbit type (with hover explanation), live altitude, speed, period, inclination, eccentricity, sub-satellite point, field of view and a short description.
- **Orbit-type cheat sheet**: hover the ⓘ next to the orbit type for a plain-language explanation; the card freezes its refresh while the pointer is over it, so the numbers stay put.
- **Two lock framings**: press `V`, or use the "View" button on the detail card, to switch between the nadir shot (camera on the satellite's local zenith) and a level side shot centred on the sensor cone's mid-point — handy for polar and geostationary satellites alike.
- **Locked-mode controls match the free view**: drag with the left button to orbit around the current view centre (which is the moving satellite), drag with the right button to move that centre, and scroll to zoom. Both lock framings zoom freely — your zoom level is never pulled back by the orbit altitude or the framing mode. The frame keeps north up with a rate-limited roll, so it never flips over the poles.
- **Search dock**: a search field sits at the bottom of the page (press `/` to focus). It matches live on the localised name, the original name in either language, or the NORAD id — typing `sentinel`, `landsat` or `iss` works in the Chinese UI too. Hit Enter or click a result to drop that satellite into the scene and lock on.
- **Orbit manager**: the dialog has a Manage tab listing everything currently on screen. Remove satellites one by one (presets included) or use "Restore defaults" / "Remove all" — nothing is lost, removed entries can be added back from the library.
- **Add your own satellites**: paste a TLE (2 or 3 lines), build one from orbital elements with six quick templates, or pick from the built-in library of **180** real satellites across seven groups (Earth imaging, weather, crewed, communications, navigation, science, HEO & special) in a scrollable, searchable list (Landsat 8, Terra, Aqua, Sentinel-1/2/3/5P/6, WorldView, RADARSAT, ALOS, NOAA, Fengyun, GOES, Himawari, Meteor, MetOp, BeiDou, GPS, Galileo, GLONASS, QZSS, Iridium, OneWeb, Starlink, O3B, Inmarsat, Intelsat, TDRS, Hubble, XMM-Newton, Chandra, HXMT, Tiangong, Shenzhou, Meridian, Molniya and more).
- **Local persistence**: custom satellites and enabled library entries live in localStorage and can be exported/imported as JSON.
- **Bilingual UI**: Chinese and English for interface, city names, satellite names and orbit descriptions.
- **Time control**: ×1 / ×10 / ×60 / ×600 rates, pause and "back to now".
- **Layer toggles**: sensor view, graticule and orbit lines.

## Getting started

### Option 1: just open it online (no install)

Go to <https://rmysjmzg987.github.io/rmysjmzg-personal-storage/> in any browser.

> The repo ships an auto-deploy workflow (`.github/workflows/deploy.yml`) that rebuilds and publishes on every push to `main`. It is already switched on here, so the URL above just works.
> If you **fork or clone this into your own repo**, pick Settings → Pages → Source → “GitHub Actions” first, otherwise the URL stays a 404.

### Option 2: run it locally (offline use, or you want to change the code)

Requires **Node.js 20.19+ or 22.12+** (that is what Vite 8 needs; Node 18 fails immediately on startup).

```bash
git clone https://github.com/rmysjmzg987/rmysjmzg-personal-storage.git
cd rmysjmzg-personal-storage
npm install
npm run dev        # Vite prints the local URL — open that
```

### Option 3: build a static bundle and host it anywhere

```bash
npm run build      # type-check, then bundle into dist/
npm run preview    # preview the dist/ build locally first
```

`dist/` is a plain static bundle built with relative paths, so it also works from a subdirectory. Drop it on GitHub Pages, Vercel, Netlify, nginx, object storage — anything that serves files.

> The app needs WebGL and an http(s) origin — opening `dist/index.html` over file:// will not load the data files, so serve it over http.

### Other commands

```bash
npm test               # unit tests (Vitest)
npm run lint           # ESLint
npm run fetch:tle      # refresh the TLE snapshot from CelesTrak (optional, needs network)
npm run fetch:textures # pull the full-resolution NASA textures (optional; a downscaled set ships in the repo)
```

## Usage

| Action | Result |
| --- | --- |
| Click a satellite dot | Lock on and follow it |
| Click an orbit line | Also locks that satellite (handy when the dot is tiny) |
| Hover a satellite dot | Name/altitude tooltip plus footprint preview |
| Left drag | Orbit the globe when unlocked; orbit around the view centre (the satellite) when locked |
| Right drag | Pan the scene when unlocked; move the view centre when locked |
| Wheel | Zoom (also works while locked) |
| `V` or the "View" button | Switch between the nadir and side lock framings |
| `/` | Focus the search dock |
| Type in the search dock | Live match on name (either language) or NORAD id; click or press Enter to lock |
| Click empty space or press Esc | Release the lock |
| "Add satellite" | Open the add-satellite dialog (library / manage / paste TLE / elements) |
| "Sensor view / Graticule / Orbit lines" | Toggle layers |
| "EN / 中" | Switch language |

Debug helpers: append `?lock=25544` (NORAD id) to lock a satellite directly, or `#debug` to show camera diagnostics.

## Data

- **TLE snapshot**: `public/data/catalog.json`, captured from [CelesTrak](https://celestrak.org/).
- **Propagation**: SGP4 via [satellite.js](https://github.com/shashwatak/satellite-js), run locally against device time.
- **Cities**: `public/data/cities.json` (102 cities).
- **Textures**: NASA Blue Marble topo/bathymetry (day, 8192x4096) and NASA VIIRS 2012 night lights (8192x4096), both equirectangular and registered to the rotation angle and city coordinates. The shader adds distance-attenuated terrain relief lighting and a sea glint, so close-ups look dimensional without turning the whole globe speckled.

Refresh the data (needs network access):

```bash
npm run fetch:tle
npm run fetch:textures
```

## Tech stack

TypeScript + Vite + three.js + satellite.js (SGP4) + plain DOM/CSS, no UI framework. Tests use Vitest.

Implementation notes:

- Positions and velocities are computed live in the browser; nothing is pre-baked.
- The lock camera aims along the satellite's local zenith for a "satellite above, Earth below" shot, keeps north up with a rate-limited roll, and falls back to parallel transport near the poles so the view never flips or gimbal-locks.
- While locked the camera is driven entirely by `src/core/followCamera.ts` (OrbitControls is disabled), so left-drag rotation, right-drag panning and wheel zoom all derive from internal angle state and never jump direction mid-drag. The side mode centres on the sensor cone's mid-point and scales its distance with the satellite altitude; wheel zoom stores a multiplier on top of that base distance (clamped to absolute limits), so switching orbits or framings keeps the zoom you dialled in.
- Search matching is a pure function, `matchSatellite()`: localised name prefix > name substring > original name in either language (alias) > NORAD id > orbit group. An alias hit still displays the localised name and shows the matched spelling in the subtitle.
- The starfield is treated as an infinitely distant backdrop: the star sphere follows the camera every frame, so the stars never shrink away when you zoom out.
- Orbit-line picking measures point-to-segment distance in screen space, so you can lock a satellite without hunting for its dot (segments behind the Earth are discarded).

## Limitations

- TLE data ages: positions drift as the snapshot gets older; the page does not fetch updates at runtime.
- The footprint is a circular approximation — no off-nadir steering, scan strips or real sensor swath.
- City highlighting has two tiers: gold pulse means the city is inside the geometric coverage circle (widened 1.6x so edge cities do not flicker), while the warm afterglow marks cities the widened "sweep circle" has just passed. That sweep circle has a floor of 8 degrees (about 890 km), otherwise a narrow-swath satellite such as Landsat (15 degrees) would barely touch a handful of cities per day. The afterglow lasts 150 seconds of simulated time, so it stays readable while fast-forwarding. Only 102 cities are built in, so small towns are missed when the decision radius and city density do not line up.
- Texture resolution is finite (8192x4096 from NASA imagery), so the ground still softens at ground-hugging zoom; run `npm run fetch:textures` (or drop in your own files) to replace the two images in `public/textures/` — the fetch script pulls the 21600x10800 NASA master, which is much larger than the downscaled copy shipped in the repo.

## License

[MIT](LICENSE)
