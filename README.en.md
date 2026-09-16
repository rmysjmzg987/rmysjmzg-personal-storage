# Satellite Orbit Viewer

A self-contained, front-end-only 3D satellite orbit visualiser. It uses real TLE data and computes every satellite position from **your device local time** in real time. Click any satellite to zoom in and lock on, while a highlighted cone shows the sensor footprint it is sweeping right now.

> Data accuracy is for demonstration and visualisation only — not for operational use.

## Highlights

- **Real orbits**: 18 preset satellites covering nine orbit classes — equatorial LEO, polar, Sun-synchronous, low Earth, medium Earth, inclined geosynchronous, geostationary, highly elliptical (Molniya) and retrograde.
- **Click to lock on**: click a satellite dot, or just its orbit line, and the camera flies in to a "satellite above, Earth below" framing; release to return to the global view.
- **Sensor footprint**: a field-of-view cone plus a ground coverage ring follows the satellite; city labels swept by the cone turn gold and pulse.
- **Detail card**: orbit type (with hover explanation), live altitude, speed, period, inclination, eccentricity, sub-satellite point, field of view and a short description.
- **Orbit-type cheat sheet**: hover the ⓘ next to the orbit type for a plain-language explanation; the card freezes its refresh while the pointer is over it, so the numbers stay put.
- **Two lock framings**: press `V`, or use the "View" button on the detail card, to switch between the nadir shot (camera on the satellite's local zenith) and a level side shot centred on the sensor cone's mid-point — handy for polar and geostationary satellites alike.
- **Locked-mode controls match the free view**: drag with the left button to orbit around the current view centre (which is the moving satellite), drag with the right button to move that centre, and scroll to zoom. The frame keeps north up with a rate-limited roll, so it never flips over the poles.
- **Add your own satellites**: paste a TLE (2 or 3 lines), build one from orbital elements with six quick templates, or pick from the built-in library of **162** real satellites across seven groups (Earth imaging, weather, crewed, communications, navigation, science, HEO & special) in a scrollable, searchable list (Landsat 8, Terra, Aqua, Sentinel-1/2/3/5P/6, WorldView, RADARSAT, ALOS, NOAA, Fengyun, GOES, Himawari, Meteor, MetOp, BeiDou, GPS, Galileo, GLONASS, QZSS, Iridium, OneWeb, Starlink, O3B, Inmarsat, Intelsat, TDRS, Hubble, XMM-Newton, Chandra, HXMT, Tiangong, Shenzhou, Meridian, Molniya and more).
- **Local persistence**: custom satellites and enabled library entries live in localStorage and can be exported/imported as JSON.
- **Bilingual UI**: Chinese and English for interface, city names, satellite names and orbit descriptions.
- **Time control**: ×1 / ×10 / ×60 / ×600 rates, pause and "back to now".
- **Layer toggles**: sensor view, graticule and orbit lines.

## Getting started

Requires Node.js 18 or newer.

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build into dist/
npm run preview  # preview the production build
npm test         # run unit tests
```

### Deploy to GitHub Pages

A workflow is included. Push to `main`, then choose **Settings → Pages → Source → GitHub Actions**; the page becomes available at `https://<user>.github.io/<repo>/`.

> The app needs WebGL and an http(s) origin — opening `dist/index.html` over file:// will not load the data files.

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
| Click empty space or press Esc | Release the lock |
| "Add satellite" | Open the add-satellite dialog |
| "Sensor view / Graticule / Orbit lines" | Toggle layers |
| "EN / 中" | Switch language |

Debug helpers: append `?lock=25544` (NORAD id) to lock a satellite directly, or `#debug` to show camera diagnostics.

## Data

- **TLE snapshot**: `public/data/catalog.json`, captured from [CelesTrak](https://celestrak.org/).
- **Propagation**: SGP4 via [satellite.js](https://github.com/shashwatak/satellite-js), run locally against device time.
- **Cities**: `public/data/cities.json` (102 cities).
- **Textures**: NASA Blue Marble topo/bathymetry (day, 5400x2700) and NASA VIIRS 2012 night lights (3600x1800), both equirectangular and registered to the rotation angle and city coordinates.

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
- While locked the camera is driven entirely by `src/core/followCamera.ts` (OrbitControls is disabled), so left-drag rotation, right-drag panning and wheel zoom all derive from internal angle state and never jump direction mid-drag. The side mode centres on the sensor cone's mid-point and scales its distance with the satellite altitude.
- The starfield is treated as an infinitely distant backdrop: the star sphere follows the camera every frame, so the stars never shrink away when you zoom out.
- Orbit-line picking measures point-to-segment distance in screen space, so you can lock a satellite without hunting for its dot (segments behind the Earth are discarded).

## Limitations

- TLE data ages: positions drift as the snapshot gets older; the page does not fetch updates at runtime.
- The footprint is a circular approximation — no off-nadir steering, scan strips or real sensor swath.
- Texture resolution is finite, so the ground still softens when the camera gets very close; drop your own images into `public/textures/` to replace them.

## License

[MIT](LICENSE)
