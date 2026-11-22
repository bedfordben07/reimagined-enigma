// Run upgrades: after every knockout you pick one of three. They stack and last for the whole run.
export function newStats() {
  return {
    dmg: 1, armor: 1, hpAdd: 0, regen: 1, regenDelay: 3.5, lifesteal: 0, thorns: 0, secondWind: 0, charge: 1,
    ult: 1, adrenaline: 0, poise: 1, drones: 0, shieldMax: 1, speed: 1, picked: [],
  };
}

export const UPGRADES = [
  { id: 'plating', name: 'Reinforced Plating', desc: '+60 max armour, fully repaired', icon: '🛡', apply: (s) => { s.hpAdd += 60; } },
  { id: 'heavy', name: 'Heavy Hitter', desc: '+25% damage from everything you do', icon: '👊', apply: (s) => { s.dmg *= 1.25; } },
  { id: 'nanite', name: 'Nanite Repair', desc: 'Armour regenerates 70% faster and starts sooner', icon: '✚', apply: (s) => { s.regen *= 1.7; s.regenDelay = Math.max(1, s.regenDelay - 0.8); } },
  { id: 'deflector', name: 'Deflector Field', desc: 'Take 18% less damage', icon: '◈', apply: (s) => { s.armor *= 0.82; } },
  { id: 'leech', name: 'Power Siphon', desc: 'Heal 12% of the damage you deal', icon: '♥', apply: (s) => { s.lifesteal += 0.12; } },
  { id: 'thorns', name: 'Reactive Armour', desc: 'When you are hit, a shockwave throws the attacker back', icon: '✸', apply: (s) => { s.thorns += 1; } },
  { id: 'wind', name: 'Second Wind', desc: 'Once per wave, survive a knockout and blast out a nova', icon: '↺', apply: (s) => { s.secondWind += 1; } },
  { id: 'quick', name: 'Quick Charge', desc: 'Punches charge 45% faster', icon: '⚡', apply: (s) => { s.charge *= 1.45; } },
  { id: 'reactor', name: 'Overcharged Reactor', desc: 'Ultimate (4) fills 50% faster', icon: '☢', apply: (s) => { s.ult *= 1.5; } },
  { id: 'adrenaline', name: 'Adrenaline', desc: 'Below 35% armour: +60% damage and faster', icon: '❗', apply: (s) => { s.adrenaline += 1; } },
  { id: 'breaker', name: 'Guard Breaker', desc: 'Your hits break its guard twice as fast: more knockdowns', icon: '⤓', apply: (s) => { s.poise *= 2; } },
  { id: 'swarm', name: 'Drone Swarm', desc: 'Combat drones (6): +1 drone and they hit harder', icon: '✦', apply: (s) => { s.drones += 1; } },
  { id: 'aegis', name: 'Aegis Capacitor', desc: 'Shield (5) lasts twice as long', icon: '◎', apply: (s) => { s.shieldMax *= 2; } },
  { id: 'thrust', name: 'Afterburners', desc: '+20% movement and flight speed', icon: '➶', apply: (s) => { s.speed *= 1.2; } },
];

export function rollUpgrades(n = 3) {
  const pool = [...UPGRADES];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
