// Fire: flames that flicker, smoke, spread to wooden water towers and nearby cars, set cars off in
// explosions, and burn whoever stands in them. Hydrant spray and rain put them out.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _a = new THREE.Vector3();
const WOOD = 19;

export class FireSystem {
  constructor(g) {
    this.g = g; // { fx, vox, smash, blastAll, cars, dummy, props, sfx, hurtPlayer, playerChest, camera, scene }
    this.fires = [];
    this.lights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xff7a2a, 0, 18, 1.6); g.scene.add(l); return l; });
    this.spreadT = 0;
  }

  // Start (or feed) a fire at p. Fires close together merge.
  ignite(p, { life = 7, size = 1, car = null, wood = false } = {}) {
    if (this.fires.length > 70) return null;
    for (const f of this.fires) if (!f.car && !car && f.p.distanceToSquared(p) < 2.2) { f.life = Math.max(f.life, life); f.size = Math.min(2, f.size + 0.2); return f; }
    const f = { p: p.clone(), life, max: life, size, car, wood, t: 0 };
    this.fires.push(f);
    return f;
  }

  igniteCar(c) {
    if (c.burning || c.burnt) return;
    c.burning = true; c.burnT = 0;
    this.ignite(c.p, { life: 999, size: 1.6, car: c });
  }

  // Heat builds on a car under a laser or lightning; enough and it catches.
  heatCar(c, amount) { c.heat = (c.heat || 0) + amount; if (c.heat > 1) this.igniteCar(c); }

  _explodeCar(c) {
    const g = this.g;
    c.burning = false; c.burnt = true;
    this.explode(c.p.clone(), c);
  }

  // A fuel explosion at p (burning car, petrol pump): blast, fireball, burning wreckage, chain reactions.
  explode(p, c = null) {
    const g = this.g;
    g.smash(p, 2.4, { outward: 10, up: 5, max: 500 });
    g.blastAll(p, 14, 36, null, 0.7);
    if (c) g.cars.hit(c, p.clone().add(_v.set((Math.random() - 0.5) * 2, -0.6, (Math.random() - 0.5) * 2)), _a.set((Math.random() - 0.5) * 6, 20, (Math.random() - 0.5) * 6));
    g.fx.wave(p, 9, 0.45, new THREE.Color(3.2, 1.6, 0.5)); g.fx.wave(p, 4, 0.25, new THREE.Color(4, 3, 2));
    g.fx.punchLight.position.copy(p); g.fx.punchLight.intensity = 180;
    for (let i = 0; i < 60; i++) g.fx.sparks.emit(p, _v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(18 + Math.random() * 24), new THREE.Color(5, 2.2, 0.5), 0.5 + Math.random() * 0.6, 0.9, 0.03);
    for (let i = 0; i < 20; i++) g.fx.dust.emit(p, _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(10), i < 10 ? new THREE.Color(2.6, 1.0, 0.25) : new THREE.Color(0.18, 0.16, 0.15), 2.5 + Math.random() * 2, 1.5 + Math.random() * 2, 3, 0.6);
    const dc = g.dummy.chest(_a); const dd = dc.distanceTo(p);
    if (dd < 9) g.dummy.hit(dc, 3, dc.clone().sub(p).normalize().multiplyScalar(40 * (1 - dd / 10)).add(_v.set(0, 10, 0)), 0.8);
    const pc = g.playerChest(); const pd = pc.distanceTo(p);
    if (pd < 8) { g.knockPlayer(pc.clone().sub(p), 30 * (1 - pd / 9)); g.hurtPlayer(25 * (1 - pd / 9)); }
    g.shake(0.45); g.sfx.boom(1.4);
    for (let i = 0; i < 3; i++) this.ignite(p.clone().add(_v.set((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)).setY(0.3), { life: 6 + Math.random() * 4 });
    // chain reaction: nearby cars catch
    for (const o of g.cars.cars) if (o !== c && !o.burnt && o.p.distanceTo(p) < 7) this.heatCar(o, 0.7);
    // and nearby pumps go up too
    for (const pr of g.props.props) if (pr.type === 'pump' && !pr.exploded && pr.p.distanceTo(p) < 9) { pr.exploded = true; setTimeout(() => this.explode(pr.p.clone()), 250 + Math.random() * 400); }
  }

  update(dt, rain) {
    const g = this.g;
    const geysers = g.props.geysers;
    const pc = g.playerChest(), dc = g.dummy.chest(new THREE.Vector3());
    for (const f of this.fires) {
      f.t += dt;
      if (f.car) {
        f.p.copy(f.car.p).add(_v.set(0, 0.6, 0));
        f.car.burnT += dt;
        if (f.car.burnT > 6.5 || !f.car.burning) { if (f.car.burning) this._explodeCar(f.car); f.life = 0; }
      }
      // water puts it out
      let douse = rain ? 0.7 : 0;
      for (const ge of geysers) if (ge.t > 0 && ge.p.distanceToSquared(f.p) < 49) douse += 4;
      f.life -= dt * (1 + douse);
      if (douse > 1 && Math.random() < dt * 6) g.fx.dust.emit(f.p, _v.set(0, 3, 0), new THREE.Color(0.85, 0.85, 0.85), 1.6, 1.4, 2, 0.4); // steam
      const k = Math.max(0, Math.min(1, f.life / 2)) * f.size;
      // flames: bright, fast, flickering; smoke: slow, dark, big
      const n = Math.random() < k * 2.5 ? 2 : Math.random() < k ? 1 : 0;
      for (let i = 0; i < n; i++) {
        g.fx.dust.emit(_a.copy(f.p).add(_v.set((Math.random() - 0.5) * 0.9 * f.size, Math.random() * 0.4, (Math.random() - 0.5) * 0.9 * f.size)), _v.set((Math.random() - 0.5) * 0.6, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 0.6),
          Math.random() < 0.5 ? new THREE.Color(3.2, 1.3, 0.25) : new THREE.Color(2.6, 2.0, 0.6), 0.5 + Math.random() * 0.5 * f.size, 0.45 + Math.random() * 0.3, 0.6, 0.8);
      }
      if (Math.random() < k * 0.8) g.fx.dust.emit(_a.copy(f.p).add(_v.set(0, 1.2 * f.size, 0)), _v.set((Math.random() - 0.5) * 0.8, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8), new THREE.Color(0.14, 0.13, 0.12), 1.4 * f.size, 3 + Math.random() * 2, 2.2, 0.5);
      // burns: wood blocks char away, the dummy and the player get scorched
      if (f.wood && f.t > 3 && Math.random() < dt * 0.8) { g.smash(f.p, 0.6, { outward: 1, up: 1, noDust: true }); }
      if (dc.distanceToSquared(f.p) < 5 * f.size) { g.dummy.burn += dt * 0.4; g.dummy.hp -= dt * 10; if (g.dummy.hp <= 0 && !g.dummy.ko) g.dummy.hit(dc, 2, _v.set(0, 3, 0)); if (Math.random() < dt * 0.4) g.dummy.say(['HOT HOT HOT!', 'I am ON FIRE!', 'Stop, drop and— OW!']); }
      if (pc.distanceToSquared(f.p) < 4 * f.size) g.hurtPlayer(dt * 12);
    }
    this.fires = this.fires.filter((f) => f.life > 0);
    // spread: fire jumps to wood and to cars close by
    if ((this.spreadT -= dt) <= 0 && this.fires.length) {
      this.spreadT = 0.6;
      for (const f of this.fires.slice(0, 30)) {
        if (rain && Math.random() < 0.6) continue;
        for (let i = 0; i < 2; i++) {
          _v.set((Math.random() - 0.5) * 6, (Math.random() - 0.3) * 4, (Math.random() - 0.5) * 6).add(f.p);
          if (g.vox.solidAt(_v.x, _v.y, _v.z) === WOOD) this.ignite(_v, { life: 8, wood: true });
        }
        for (const c of g.cars.cars) if (!c.burnt && !c.burning && c.p.distanceToSquared(f.p) < 12) this.heatCar(c, 0.25);
        for (const pr of g.props.props) if (pr.type === 'pump' && !pr.exploded && pr.p.distanceToSquared(f.p) < 9) { pr.exploded = true; this.explode(pr.p.clone()); }
      }
    }
    // the four fires nearest the camera cast flickering light
    const cam = g.camera.position;
    const near = this.fires.length > 4 ? [...this.fires].sort((a, b) => a.p.distanceToSquared(cam) - b.p.distanceToSquared(cam)) : this.fires;
    this.lights.forEach((l, i) => {
      const f = near[i];
      if (!f) { l.intensity = 0; return; }
      l.position.copy(f.p).add(_v.set(0, 0.8, 0));
      l.intensity = (12 + Math.random() * 10) * Math.min(1, f.life) * f.size;
    });
  }
}
