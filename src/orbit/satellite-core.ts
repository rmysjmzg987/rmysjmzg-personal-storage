// satellite.js 的轻量入口：只导出纯 JS 版 SGP4 与坐标变换，
// 避免把同包的 WASM 传播器（体积大、且带顶层 await）打进浏览器包。
export { twoline2satrec } from 'satellite.js/dist/io.js';
export { propagate } from 'satellite.js/dist/propagation/propagate.js';
export type { SatRec } from 'satellite.js/dist/propagation/SatRec.js';
