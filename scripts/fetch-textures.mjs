import { mkdir, writeFile } from 'node:fs/promises';

const SOURCES = [
  {
    file: 'public/textures/earth-day.jpg',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg',
  },
  {
    file: 'public/textures/earth-night.jpg',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/55000/55167/earth_lights_lrg.jpg',
  },
];

await mkdir('public/textures', { recursive: true });
for (const { file, url } of SOURCES) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed ${url}: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(file, bytes);
  console.log(`saved ${file} (${(bytes.length / 1024).toFixed(0)} KB)`);
}
