import { mkdir, writeFile } from 'node:fs/promises';

const SOURCES = [
  {
    file: 'public/textures/earth-day.jpg',
    // NASA Visible Earth "Blue Marble" 地形+海深版本，5400x2700 等距圆柱投影
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg',
  },
  {
    file: 'public/textures/earth-night.jpg',
    // NASA 地球夜间灯光（VIIRS 2012），3600x1800
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg',
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
