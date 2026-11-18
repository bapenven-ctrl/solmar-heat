// World layout and tuning constants for Solmar Heat.
// The city is laid out on a metre grid: downtown avenues run north-south at
// fixed x positions, streets run east-west at fixed z positions, the harbour
// fills the south shore, and Bukit Cemara rises to the north.

export const WORLD = {
  // Downtown flat district.
  downtown: { minX: -150, maxX: 150, minZ: -24, maxZ: 228 },
  avenueX: [-120, -80, -40, 0, 40, 80, 120],
  streetZ: [8, 52, 96, 140, 184, 224],
  roadHalf: 7, // half width of a road surface
  laneOffset: 3.4, // distance of a driving lane from the road centre line
  blockGap: 15, // building lots start this far from a road centre line

  // Harbour: water south of the quay line, piers reaching into it.
  quayZ: -24,
  waterZ: -260,

  // Airstrip along the eastern edge.
  strip: { minX: 168, maxX: 196, minZ: 8, maxZ: 224 },

  // Bukit Cemara hill district: ramp corridor then a flat plateau.
  hill: {
    rampStartZ: 228,
    rampTopZ: 316,
    plateauZ: 316,
    plateauHeight: 26,
    minX: -130,
    maxX: 130,
    maxZ: 430,
    roadHalf: 8,
  },
};

export const TUNING = {
  playerWalkSpeed: 5.2,
  playerRunSpeed: 8.6,
  playerRadius: 0.55,
  enterCarRange: 3.4,
  carMaxSpeed: 34, // m/s, ~122 km/h
  carMaxReverse: 9,
  carAccel: 13.5,
  carBrake: 26,
  carDrag: 0.55,
  carTurnRate: 1.55,
  trafficCount: 26,
  parkedCount: 22,
  pedCount: 34,
  copMaxSpeed: 36,
  wantedDecaySeconds: 26, // unseen time for one star to fade
  dayLengthSeconds: 600, // a full in-game day in free play
};

export const PALETTE = {
  skyDay: 0x8ec9e8,
  sea: 0x1d6f8e,
  sand: 0xd9c08a,
  asphalt: 0x4a5058,
  sidewalk: 0x9aa0a3,
  grass: 0x69a24b,
  hillRock: 0x8a7355,
  roofTerracotta: 0xb5563c,
  roofSlate: 0x4d5a68,
  gold: 0xffb340,
  policeBlue: 0x1d4ed8,
  carColors: [
    0xd94f30, 0x2e6fd8, 0xf2b035, 0x39b56a, 0xe8e6df, 0x22262b, 0x8e44ad,
    0xd6336c, 0x1abc9c, 0x7f8c9b, 0xc0c6cc, 0x935116,
  ],
  buildingTones: [0xe8dcc4, 0xd9c8a9, 0xcfe0e8, 0xe6b8a2, 0xf0ead8, 0xbccdd6, 0xd8b4b0, 0xf2e3c6],
};
