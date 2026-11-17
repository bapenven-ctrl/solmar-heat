// SOLMAR HEAT — every tuning number and colour in one place.
// The city is a grid of straight roads 40 units apart, from -80 to +80 on
// both axes; the playable half-width is 110, with a beach and the sea east
// of x = 100. All speeds are units per second, all money in dollars.

// The simulation's fixed step, in seconds: 60 updates a second whatever the
// display's rate.
export const STEP = 1 / 60;

export const CITY = {
  roadSpacing: 40,
  roadMin: -80,
  roadMax: 80,
  roadWidth: 10,
  halfSize: 110,
  beachX: 100,
  seaX: 118,
  towerHeight: 92,
};

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 8.5,
  radius: 0.7,
  spawn: { x: 0, z: 40 },
  maxHealth: 100,
};

export const CAR = {
  accel: 15,
  brake: 30,
  reverseAccel: 9,
  maxSpeed: 30,
  maxReverse: 9,
  turnRate: 1.9,
  radius: 2.4,
  // An autopilot (and a careful player) never floors it through a bend.
  turnSpeed: 7,
  fastSpeed: 20,
};

export const TRAFFIC = {
  cars: 14,
  parked: 10,
  speedMin: 8,
  speedMax: 12,
  pedestrians: 24,
  pedSpeedMin: 1.1,
  pedSpeedMax: 2.1,
  fleeSpeed: 5.5,
};

export const POLICE = {
  maxActive: 3,
  chaseSpeed: 21,
  ramDamage: 5,
  ramCooldown: 2,
  ramRange: 4.2,
  evadeDistance: 55,
  evadeSeconds: 8,
};

export const COMBAT = {
  punchRange: 2.6,
  punchDamage: 30,
  punchCooldown: 0.4,
  pistolRange: 42,
  pistolDamage: 34,
  gangHealth: 100,
  gangPunchDamage: 8,
  gangPunchCooldown: 1.2,
  gangAggroRange: 26,
};

export const MISSIONS = [
  {
    id: 'docks',
    name: 'Paket Pelabuhan',
    reward: 150,
    pickup: { x: 104, z: 68 },
    dropoff: { x: 104, z: -68 },
    pickupText: 'Ambil paket di pelabuhan (timur, dekat laut)',
    deliverText: 'Antar paket ke marina di utara pantai',
  },
  {
    id: 'escape',
    name: 'Pelarian',
    reward: 200,
    hideout: { x: -80, z: -80 },
    hideoutText: 'Kabur ke tempat persembunyian di barat daya — lolos dari polisi!',
  },
  {
    id: 'steal',
    name: 'Curi dan Antar',
    reward: 400,
    targetCar: { x: 40, z: -36 },
    garage: { x: -40, z: 60 },
    stealText: 'Curi mobil emas target di persimpangan (40, -40) — awas geng rival!',
    deliverText: 'Antar mobil curian ke garasi di (-40, 60)',
  },
];

export const CLOCK = {
  // The game clock starts at sunset and runs 1 game-hour per 4 real minutes.
  startHour: 17.5,
  hoursPerSecond: 1 / 240,
};

export const SAVE_KEY = 'solmar-heat.save.v1';

export const PALETTE = {
  skyTop: '#2b3a6b',
  skyMid: '#e2703a',
  skyLow: '#ffb347',
  fog: '#e88a4f',
  sun: '#ffd27a',
  ground: '#8a8f7a',
  road: '#33363d',
  sidewalk: '#9a9a92',
  sand: '#e8cf9a',
  sea: '#2e6f8e',
  buildingA: '#b98a5e',
  buildingB: '#7d8aa0',
  buildingC: '#a06a6a',
  tower: '#5e6b8a',
  hudText: '#ffffff',
  hudGold: '#ffd24a',
  hudRed: '#ff5a4e',
  hudBlue: '#4ea8ff',
  minimapRoad: '#3a3d44',
  minimapBuilding: '#6d6f78',
  minimapSea: '#2e6f8e',
  minimapSand: '#e8cf9a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
