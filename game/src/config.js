// Solmar Heat v2 — tuning constants and world layout shared by every system.
export const STEP = 1 / 60;
export const WORLD = {
  grid: 60,
  mainMin: -240, mainMax: 240,
  hillMinX: -580, hillMaxX: -300,
  hillMinZ: -210, hillMaxZ: 210,
  seaX: 285,
  airportZ: 300,
};
export function groundHeight(x, z) {
  if (x >= -292) return 0;
  const t = Math.min(1, (-292 - x) / 270);
  return Math.floor(t * 6) * 3;
}
export const COLORS = {
  sky: 0x2c1e3f, fog: 0x59355a, sun: 0xffb36b,
  road: 0x4a4459, roadHill: 0x554a63, sand: 0xc9a06b, sea: 0x1d5f73,
  grass: 0x4c6a39, hillGround: 0x6b7a44,
  building: [0x8a6f5c, 0x746a7d, 0x9c7a52, 0x5f7086, 0xa0855e, 0x685a6e],
  villa: [0xd9c9a8, 0xcbb59a, 0xe3d3b8, 0xbfae90],
  police: 0xf2f4f6, gang: 0x7a1f2b, playerCar: 0xd9822b,
};
export const PLACES = {
  harbor:   { x: 228, z: -150, label: 'Pelabuhan Solmar' },
  drop1:    { x: -120, z: 120, label: 'Gudang Jalan Kenanga' },
  hideout:  { x: -228, z: -228, label: 'Persembunyian Gang Melati' },
  gangYard: { x: 180, z: 210, label: 'Markas Geng Karang' },
  garage:   { x: -60, z: -180, label: 'Garasi Sinar Auto' },
  lookout:  { x: -548, z: 78, label: 'Menara Pandang Bukit Cemara' },
  airport:  { x: 120, z: 318, label: 'Strip Bandara Solmar' },
  start:    { x: 204, z: -108, label: 'Dermaga' },
};
export const SAVE_KEY = 'solmar-heat-v2';
