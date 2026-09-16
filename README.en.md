# Satellite Orbit Viewer

A self-contained, front-end-only 3D satellite orbit visualiser. It uses real TLE data and computes every satellite position from **your device local time** in real time. Click any satellite to zoom in and lock on, while a highlighted cone shows the sensor footprint it is sweeping right now.

> Data accuracy is for demonstration and visualisation only — not for operational use.

## Highlights

- **Real orbits**: 18 preset satellites covering nine orbit classes — equatorial LEO, polar, Sun-synchronous, low Earth, medium Earth, inclined geosynchronous, geostationary, highly elliptical (Molniya) and retrograde.
- **Click to lock on**: the camera flies in and tracks the satellite along its local zenith; release to return to the global view.
- **Sensor footprint**: a field-of-view cone plus a ground coverage ring follows the satellite; city labels swept by the cone turn gold and pulse.
- **Detail card**: orbit type (with hover explanation), live altitude, speed, period, inclination, eccentricity, sub-satellite point, field of view and a short description.
- **Add your own satellites**: paste a TLE (2 or 3 lines), build one from orbital elements with six quick templates, or pick from the built-in library of 58 real satellites (Landsat 8, Terra, Aqua, Sentinel-1/2/3/6, NOAA, Fengyun, GOES, Himawari, BeiDou, GPS, Galileo, Hubble, XMM-Newton, Tiangong, Shenzhou and more).
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
| Hover a satellite dot | Name/altitude tooltip plus footprint preview |
| Drag / wheel | Orbit and zoom (still available while locked) |
| Click empty space or press Esc | Release the lock |
| "Add satellite" | Open the add-satellite dialog |
| "Sensor view / Graticule / Orbit lines" | Toggle layers |
| "EN / 中" | Switch language |

Debug helpers: append `?lock=25544` (NORAD id) to lock a satellite directly, or `#debug` to show camera diagnostics.

## Data

- **TLE snapshot**: `public/data/catalog.json`, captured from [CelesTrak](https://celestrak.org/).
- **Propagation**: SGP4 via [satellite.js](https://github.com/shashwatak/satellite-js), run locally against device time.
- **Cities**: `public/data/cities.json` (102 cities).
- **Textures**: NASA Blue Marble (day) and Black Marble (night).

Refresh the data (needs network access):

```bash
npm run fetch:tle
npm run fetch:textures
```

## Tech stack

TypeScript + Vite + three.js + satellite.js (SGP4) + plain DOM/CSS, no UI framework. Tests use Vitest.

## Limitations

- TLE data ages: positions drift as the snapshot gets older; the page does not fetch updates at runtime.
- The footprint is a circular approximation — no off-nadir steering, scan strips or real sensor swath.

## License

[MIT](LICENSE)
