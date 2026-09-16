import { mkdir, writeFile } from 'node:fs/promises';

// 仓库内已附带压缩到 8192x4096 的贴图（day ≈ 4.4 MB / night ≈ 2.1 MB），
// 正常克隆后无需运行本脚本。只有在想换回 NASA 原始母版或自行重制贴图时才执行：
//   npm run fetch:textures
// 注意：母版文件很大（day 约 28 MB，night 约 8 MB），下载与后续构建都会明显变慢。
const SOURCES = [
  {
    file: 'public/textures/earth-day.jpg',
    // NASA Visible Earth "Blue Marble" 地形+海深版本，21600x10800 等距圆柱投影（约 28 MB，下载后可供高倍放大观看）
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x21600x10800.jpg',
  },
  {
    file: 'public/textures/earth-night.jpg',
    // NASA 地球夜间灯光（VIIRS 2012），13500x6750
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.13500x6750.jpg',
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
