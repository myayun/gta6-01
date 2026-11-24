// config.js — all tunable numbers, places and story data for Solmar Bay.
// One job: hold the game's constants so every other module agrees on them.

export const WORLD = {
  PITCH: 80, // distance between street centrelines, metres
  STREETS: 9, // streets per axis, at x/z = 0, 80, ... 640
  STREET_W: 16, // road width
  SIZE: 640, // city spans 0..640 on both axes
  BEACH_Z: 640, // sand starts here
  OCEAN_Z: 712, // waterline; movement blocked past this except the pier
  LIMIT: 712, // hard world bound
};

export const COLOURS = {
  sky: 0x87b5d9,
  fog: 0xd8cdb2,
  sun: 0xffe3b3,
  ground: 0x9aa08b,
  road: 0x3a3f44,
  sidewalk: 0xb8b0a0,
  sand: 0xe6cf9e,
  ocean: 0x2e7fa8,
  building: [0xe8dcc8, 0xd9a066, 0x7fb3a3, 0xc97b6b, 0xf2e3c6, 0x8fa8c8],
  roof: 0x5b5348,
  palmTrunk: 0x8a6b4a,
  palmLeaf: 0x3f8f4f,
};

export const CAR_MODELS = {
  viento: { name: 'Viento GT', colour: 0xd21f3c, length: 4.4, maxSpeed: 46, accel: 16, reverse: 11 },
  brisa: { name: 'Brisa Coupe', colour: 0x2e86de, length: 4.2, maxSpeed: 40, accel: 13, reverse: 10 },
  coral: { name: 'Coral Van', colour: 0xe67e22, length: 4.9, maxSpeed: 33, accel: 10, reverse: 9 },
  marlin: { name: 'Marlin Pickup', colour: 0x27ae60, length: 5.0, maxSpeed: 36, accel: 11, reverse: 10 },
  taxi: { name: 'Solmar Taxi', colour: 0xf1c40f, length: 4.3, maxSpeed: 38, accel: 12, reverse: 10 },
  police: { name: 'SBPD Interceptor', colour: 0xf5f6fa, length: 4.5, maxSpeed: 44, accel: 17, reverse: 12 },
};

// Named places. Streets run at x/z = 0,80,...,640; block (bx,bz) centres at
// ((bx+0.5)*80, (bz+0.5)*80).
export const LOCATIONS = {
  spawn: { x: 88, z: 128 },
  garage: { x: 120, z: 120, name: "Dante's Garage" },
  vientoParked: { x: 89, z: 200 },
  bank: { x: 360, z: 360, name: 'Solmar Bank' },
  hideout: { x: 600, z: 520, name: 'Hideout — Coral Court' },
  packagePickup: { x: 200, z: 440, name: 'Package — Palm Row' },
  marina: { x: 600, z: 688, name: 'Marina — Bayfront Drop' },
};

export const MISSIONS = [
  {
    id: 'm1', title: 'First Wheels', payout: 500,
    briefing: "Dante: 'Mara, you're back. Prove it. There's a red Viento GT parked on Palm Row — take it and bring it to my garage. Don't scratch it.'",
    speaker: 'Dante Reyes', role: 'Fixer',
    line: "Mara, you're back. Prove it. There's a red Viento GT parked on Palm Row — take it and bring it to my garage. Don't scratch it.",
    complete: "First Wheels done. The Viento's in my garage, Mara. You're hired.",
    steps: [
      { type: 'steal', carId: 'viento', text: 'Steal the Viento GT on Palm Row' },
      { type: 'goto', target: 'garage', radius: 14, text: "Drive it to Dante's Garage" },
    ],
  },
  {
    id: 'm2', title: 'Bayfront Drop', payout: 1200,
    briefing: "Dante: 'A package needs to reach the marina. Grab it on Palm Row, then run the Bayfront — ninety seconds, and the Bay PD will be on you the moment you pick it up.'",
    speaker: 'Dante Reyes', role: 'Fixer',
    line: "A package needs to reach the marina. Grab it on Palm Row, then run the Bayfront — ninety seconds, and the Bay PD will be on you the moment you pick it up.",
    complete: 'Package delivered. The marina run was clean, Mara. One more job and we are rich.',
    steps: [
      { type: 'goto', target: 'packagePickup', radius: 16, text: 'Pick up the package on Palm Row' },
      { type: 'goto', target: 'marina', radius: 12, text: 'Deliver to the Marina — 90 seconds', timer: 90, wanted: 2 },
    ],
  },
  {
    id: 'm3', title: 'The Solmar Job', payout: 5000,
    briefing: "Dante: 'The big one. Solmar Bank, midday, three stars the second you touch the cash. Get to Coral Court and we are rich, Mara. Don't get caught.'",
    speaker: 'Dante Reyes', role: 'Fixer',
    line: "The big one. Solmar Bank, midday, three stars the second you touch the cash. Get to Coral Court and we are rich, Mara. Don't get caught.",
    complete: 'The Solmar Job is done. Solmar Bay is yours, Mara.',
    steps: [
      { type: 'goto', target: 'bank', radius: 20, text: 'Grab the cash at Solmar Bank' },
      { type: 'goto', target: 'hideout', radius: 16, text: 'Escape to the Hideout — lose the heat', wanted: 3 },
    ],
  },
];

// Reputation ranks, by total mission payout earned (RP).
export const RANKS = [
  { min: 0, name: 'ROOKIE' },
  { min: 500, name: 'DRIVER' },
  { min: 1700, name: 'FIXER' },
  { min: 6700, name: 'KINGPIN' },
];

export const RADIO = 'SOLMAR FM 101.2 — Golden Hour';

export const GAME = {
  startCash: 250,
  startHour: 17, // golden hour
  startMinute: 20,
  playerWalk: 6,
  playerRun: 10,
  playerHp: 100,
  trafficCount: 14,
  pedCount: 22,
  parkedCount: 8,
  wantedDecaySeconds: 20,
  bustedHoldSeconds: 2,
};
