/* =========================================================================
   IDLE QUEST — 07 GAME
   Entities, capsule physics, the combat model (auto-balanced at any level),
   mob & boss AI, visible AI adventurers, camera, loot and the render bridge.
   ========================================================================= */

const G = {
  t: 0, dt: 0, tod: 0.30, started: false, paused: false,
  player: null, ents: [], proj: [], gfx: [], dmg: [],
  target: null, hover: null,
  combat: 0, combatT: 0, musicState: '',
  nextId: 1, spawnT: 0, aiSyncT: 0,
  camYaw: 0, camPitch: 0.42, camDist: 8.2, camShake: 0,
  cam: { x: 0, y: 12, z: 12, tx: 0, ty: 1, tz: 0 },
  zone: null, lastZone: -1,
  inRaid: null, raidStage: 0, raidT: 0,
  deathT: 0, resT: 0,
  toastQ: [],
};

/* ------------------------------ POWER CURVES ------------------------------ */
/* Everything below scales continuously with level, so there is no cap: mobs,
   bosses and rewards are all derived from the same reference power curve. */
function refIlvl(level) { return 8 + level * 2.45; }
function refPrimary(level) {
  const ilvl = refIlvl(level);
  let s = 22 + 2.6 * level;
  for (const sl of SLOTS) s += ilvl * 1.15 * sl.w * 1.55 * 0.42;
  return s;
}
function refWdps(level) { return (4 + refIlvl(level) * 1.35) * 1.55; }
function refDPS(level) {
  const prim = refPrimary(level), w = refWdps(level);
  return (w * 1.4 + prim * 2.4 * 0.22) / 1.45;
}
function refHP(level) {
  const ilvl = refIlvl(level);
  let sta = 21 + 2.4 * level;
  for (const sl of SLOTS) sta += ilvl * 1.15 * sl.w * 1.55 * 0.34;
  return 90 + sta * 11 + level * 16;
}
function mobHP(level, rank) { return Math.round(refDPS(level) * (rank === 2 ? 60 : rank === 1 ? 8 : 2.4)); }
/* Incoming damage is a fraction of the player's ACTUAL max health rather than an
   absolute number. A fresh level-1 with no gear and a fully-kitted level-800 both
   get a fair fight, and no amount of gear inflation ever trivialises a zone. */
function mobHitFrac(rank) { return rank === 2 ? 0.075 : rank === 1 ? 0.062 : 0.036; }
function mobDamage(e, p) {
  const adj = clamp(1 + (e.level - p.level) * 0.05, 0.35, 2.6);
  return Math.max(1, p.st.hpMax * (e.dmgFrac || 0.036) * adj);
}
function xpNeed(level) { return Math.round(90 * Math.pow(level, 1.58) + 55 * level + 60); }
/* XP per kill decays relative to the level requirement, so levelling stays
   brisk early and becomes a real climb later — without ever capping. */
function mobXP(level, rank) {
  return Math.round(xpNeed(level) * 0.22 / (1 + level / 25) * (rank === 2 ? 26 : rank === 1 ? 5.5 : 1));
}
function mobGold(level, rank) { return Math.round((5 + level * 2.4) * (rank === 2 ? 40 : rank === 1 ? 7 : 1) * (0.7 + Math.random() * 0.8)); }

/* ------------------------------ STATS ------------------------------ */
function ratingPct(r, level, k) { return r / (r + (level * 14 + 90) * (k || 1)); }
function emptyStats() {
  return { str: 0, agi: 0, int: 0, sta: 0, crit: 0, haste: 0, mast: 0, vers: 0, arm: 0, leech: 0, speed: 0 };
}
function calcStats(p) {
  const c = CLASS_BY[p.cls] || CLASSES[0];
  const s = emptyStats();
  s.str = c.base.str + c.grow.str * (p.level - 1);
  s.agi = c.base.agi + c.grow.agi * (p.level - 1);
  s.int = c.base.int + c.grow.int * (p.level - 1);
  s.sta = c.base.sta + c.grow.sta * (p.level - 1);
  const af = {};
  let wdps = 3 + p.level * .7;
  for (const k of SLOT_KEYS) {
    const it = p.gear[k]; if (!it) continue;
    for (const sk in it.st) s[sk] = (s[sk] || 0) + it.st[sk];
    if (it.w) wdps = it.w;
    for (const a of it.af) af[a.k] = (af[a.k] || 0) + a.v;
  }
  s.arm += c.armor * (14 + p.level * 3.2);
  p.af = af;
  p.wdps = wdps;
  const prim = s[c.prim];
  s.ap = prim * 2.4;
  s.critP = 0.05 + ratingPct(s.crit, p.level) * 0.62;
  s.hasteP = ratingPct(s.haste, p.level) * 0.55;
  s.mastP = ratingPct(s.mast, p.level) * 0.70;
  s.versP = ratingPct(s.vers, p.level) * 0.42;
  s.leechP = ratingPct(s.leech, p.level, 1.6) * 0.32 + (af.vamp || 0) * 0.01;
  s.speedP = ratingPct(s.speed, p.level, 2.2) * 0.30 + (af.swift || 0) * 0.01;
  s.drP = ratingPct(s.arm, p.level, 2.4) * 0.68 + (af.bul || 0) * 0.01;
  s.hpMax = Math.round(90 + s.sta * 11 + p.level * 16);
  s.dps = (wdps * 1.4 + s.ap * 0.22) * (1 + s.versP) * (1 + s.mastP * .5);
  s.gs = gearScoreOf(p.gear);
  return s;
}
function playerDamage(p, mult, isCrit) {
  const s = p.st;
  let d = (p.wdps * 1.4 + s.ap * 0.22) * mult;
  d *= (1 + s.versP) * (1 + s.mastP * 0.5);
  d *= 0.88 + Math.random() * 0.24;
  if (p.buffDmg) d *= (1 + p.buffDmg);
  return d;
}
function resourceMax(p) {
  const c = CLASS_BY[p.cls];
  if (c.res === 'rage') return 100;
  if (c.res === 'energy') return 100;
  return Math.round(120 + p.level * 22 + (p.st ? p.st.int * 2.2 : 0));
}

/* ------------------------------ ENTITY FACTORY ------------------------------ */
function newAnim() { return { t: Math.random() * 10, spd: 0, run: 0, atk: 0, cast: 0, dead: 0, air: 0 }; }
function rarityGlow(t) {
  if (t >= 5) return { g: 1.0, c: [1.0, .25, .38] };
  if (t === 4) return { g: 0.62, c: [1.0, .58, .12] };
  if (t === 3) return { g: 0.26, c: [.70, .35, .95] };
  return { g: 0, c: [1, 1, 1] };
}
function styleFromGear(e, gear, clsId) {
  const c = CLASS_BY[clsId] || CLASSES[0];
  const best = bestTierOf(gear);
  const rg = rarityGlow(best);
  const chest = gear.chest, wpn = gear.weapon;
  const ct = chest ? chest.t : 0;
  const base = RARITY[ct] ? hexToRgb(RARITY[ct].c) : [.5, .5, .5];
  e.gearCol = [lerp(c.col[0], base[0], .42), lerp(c.col[1], base[1], .42), lerp(c.col[2], base[2], .42)];
  e.gearCol2 = [e.gearCol[0] * .62, e.gearCol[1] * .62, e.gearCol[2] * .68];
  e.accent = c.col.slice();
  e.glow = rg.g; e.glowCol = rg.c;
  e.helm = !!gear.head; e.pads = !!gear.shoulder; e.cape = !!gear.back;
  e.shield = !!gear.offhand && (clsId === 'warrior' || clsId === 'paladin');
  e.wpn = true;
  const wt = wpn ? wpn.t : 0;
  const wc = RARITY[wt] ? hexToRgb(RARITY[wt].c) : [.62, .64, .68];
  e.wpnCol = [lerp(.70, wc[0], .55), lerp(.72, wc[1], .55), lerp(.78, wc[2], .55)];
  e.wpnGlow = wt >= 4 ? .8 : wt >= 3 ? .3 : 0;
  e.wpnLen = clsId === 'mage' || clsId === 'druid' ? 1.35 : clsId === 'rogue' ? .62 : 1.0;
}
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function randName(rng) {
  let n = rng.pick(NAME_A) + rng.pick(NAME_B);
  if (rng.chance(.28)) n += rng.pick(NAME_C);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function spawnMob(x, z, level, rank, famName, zoneId) {
  const y = groundH(x, z);
  const rng = new RNG((x * 1000 | 0) ^ (z * 977 | 0) ^ G.nextId);
  const hp = mobHP(level, rank);
  const e = {
    id: G.nextId++, kind: 'mob', rank,
    name: famName + (rank === 1 ? ' Champion' : ''),
    x, y, z, hx: x, hz: z, vy: 0, yaw: rng.f() * TAU, level,
    hp, hpMax: hp, dmgFrac: mobHitFrac(rank),
    an: newAnim(), scale: rank === 1 ? 1.34 : rank === 2 ? 2.1 : (0.92 + rng.f() * 0.22),
    st: 'idle', tt: 0, tgt: null, atkCd: 0, gcd: 0, aggro: rank === 1 ? 20 : 15, leash: 46,
    speed: 3.6 + rng.f() * 1.2, dead: 0, xp: mobXP(level, rank), gold: mobGold(level, rank),
    skin: rng.i(SKIN.length), hair: rng.i(HAIRC.length), zone: zoneId,
    isMob: 1, hitT: 0, ranged: rng.chance(.28),
  };
  // mobs are beasts / brigands: tint by zone biome
  const zn = DB.zones[zoneId] || DB.zones[0];
  const t = rng.r(.7, 1.15);
  e.gearCol = [zn.col[0] * t * .9 + .12, zn.col[1] * t * .7 + .10, zn.col[2] * t * .7 + .10];
  e.gearCol2 = [e.gearCol[0] * .7, e.gearCol[1] * .7, e.gearCol[2] * .7];
  e.accent = [.4, .2, .16]; e.wpnCol = [.5, .48, .46];
  e.glow = rank === 2 ? .35 : 0; e.glowCol = [1, .3, .2];
  e.wpn = rank > 0 || rng.chance(.5); e.helm = rank > 0; e.pads = rank === 2;
  e.wpnLen = 1; e.cape = rank === 2;
  G.ents.push(e);
  return e;
}
function spawnBoss(bdef) {
  const x = bdef.x, z = bdef.z2, y = groundH(x, z);
  const hp = Math.round(mobHP(bdef.lv, 2) * (bdef.hp / 14));
  const e = {
    id: G.nextId++, kind: 'boss', rank: 2, bossId: bdef.id,
    name: bdef.n, title: bdef.t,
    x, y, z, hx: x, hz: z, vy: 0, yaw: 0, level: bdef.lv,
    hp, hpMax: hp, dmgFrac: 0.055 * bdef.dmg,
    an: newAnim(), scale: 2.6, st: 'idle', tt: 0, tgt: null, atkCd: 0, gcd: 0,
    aggro: 26, leash: 70, speed: 3.9, dead: 0,
    xp: mobXP(bdef.lv, 2), gold: mobGold(bdef.lv, 2) * 2,
    skin: 2, hair: 0, zone: bdef.z, isMob: 1, hitT: 0,
    mech: bdef.mech, phase: 0, mechCd: 6, enraged: 0, lootTier: bdef.lootTier,
    gearCol: [.28, .13, .16], gearCol2: [.17, .08, .10], accent: [.8, .18, .12],
    wpnCol: [.85, .35, .15], glow: .8, glowCol: [1, .35, .15],
    helm: 1, pads: 1, cape: 1, wpn: 1, wpnLen: 1.6, shield: 0,
  };
  G.ents.push(e);
  return e;
}
/** A visible AI adventurer, driven by its roster record. */
function spawnAIAvatar(rec) {
  const y = groundH(rec.x, rec.z);
  const e = {
    id: G.nextId++, kind: 'ai', rec,
    name: rec.n, x: rec.x, y, z: rec.z, vy: 0, yaw: Math.random() * TAU, level: rec.lv,
    hp: 1, hpMax: 1, an: newAnim(), scale: 1, st: 'roam', tt: 0, tgt: null,
    atkCd: 0, gcd: 0, speed: 5.4, dead: 0, cls: rec.c, zone: rec.z2,
    skin: rec.sk, hair: rec.hr, guild: rec.g, isMob: 0, hitT: 0,
    dest: null, chatT: Math.random() * 30 + 10,
  };
  const g = {};
  for (const k of SLOT_KEYS) {
    const si = SLOT_BY[k].i;
    if (rec.gt[si]) g[k] = { t: rec.gt[si] - 1, il: rec.gi[si], sc: 1 };
  }
  styleFromGear(e, g, rec.c);
  e.hpMax = refHP(rec.lv); e.hp = e.hpMax;
  G.ents.push(e);
  rec.av = e;
  return e;
}

/* ------------------------------ PLAYER ------------------------------ */
function makePlayer(name, clsId) {
  const p = {
    kind: 'player', id: 0, name, cls: clsId, level: 1, xp: 0, gold: 0,
    x: 0, y: 0, z: 0, vy: 0, yaw: 0, an: newAnim(), scale: 1,
    gear: {}, bags: [], bagMax: 40,
    hp: 100, res: 0, gcd: 0, cds: {}, buffs: [], dots: [],
    skin: (Math.random() * SKIN.length) | 0, hair: (Math.random() * HAIRC.length) | 0,
    quests: [], done: {}, doneCount: 0, kills: 0, deaths: 0, bossKills: 0, raidKills: 0,
    guild: null, respect: 0, playtime: 0, mythic: 0,
    stats: { dmgDone: 0, dmgTaken: 0, healed: 0, goldEarned: 0, itemsFound: 0, questsDone: 0, bossesKilled: 0, raidsDone: 0, pvpWins: 0, distance: 0 },
    autoOn: false, autoMode: 'all', dead: 0, sprint: 1, swim: 0,
    lastTownVisit: 0, seenZones: {}, af: {},
  };
  const hub = POI.hubs[0];
  p.x = hub.x + 6; p.z = hub.z + 8; p.y = groundH(p.x, p.z);
  // starter kit: a plain weapon so the first swing feels like something
  const rng = new RNG(SEED ^ 0x51A27);
  p.gear.weapon = genItem(rng, 3, 0, 'weapon', clsId);
  p.st = calcStats(p);
  p.hp = p.st.hpMax;
  p.resMax = resourceMax(p);
  p.res = CLASS_BY[clsId].res === 'rage' ? 0 : p.resMax;
  styleFromGear(p, p.gear, clsId);
  return p;
}
function playerLevelUp(p) {
  p.level++;
  p.st = calcStats(p);
  p.resMax = resourceMax(p);
  p.hp = p.st.hpMax;
  if (CLASS_BY[p.cls].res !== 'rage') p.res = p.resMax;
  sfx('levelup', 1);
  banner('LEVEL ' + p.level, CLASS_BY[p.cls].n + ' — ' + fmt(p.st.gs) + ' gear score');
  burst(p.x, p.y + 1, p.z, 46, 3.4, 7, .5, 1, .82, .35, 0, 1.5);
  for (let i = 0; i < 20; i++) spawnPart(p.x + (Math.random() - .5) * 2, p.y + Math.random() * 3, p.z + (Math.random() - .5) * 2, 0, 3 + Math.random() * 3, 0, 1.4, .35, 1, .9, .5, 1, 1, -1, 0);
  R.flash = .55; R.flashCol = [1, .85, .5];
  metaOnPlayerLevel(p.level);
}
function giveXP(p, amount) {
  const bonus = 1 + (p.af.schol || 0) * 0.01;
  amount = Math.round(amount * bonus);
  p.xp += amount;
  let guard = 0;
  while (p.xp >= xpNeed(p.level) && guard++ < 200) { p.xp -= xpNeed(p.level); playerLevelUp(p); }
}
function giveGold(p, amount) {
  amount = Math.round(amount * (1 + (p.af.greed || 0) * 0.01));
  p.gold += amount; p.stats.goldEarned += amount;
  return amount;
}

/* ------------------------------ PHYSICS ------------------------------ */
const PLAYER_R = 0.42;
function moveEntity(e, wishX, wishZ, speed, dt, isPlayer) {
  const h = groundH(e.x, e.z);
  const inWater = h < WATER_Y - 0.7 && e.y < WATER_Y;
  const grounded = e.y <= h + 0.06;
  if (grounded) { e.y = h; if (e.vy < 0) { if (e.vy < -12 && isPlayer) { sfx('land', clamp(-e.vy / 26, .2, 1)); R.camShake = clamp(-e.vy / 40, 0, .5); } e.vy = 0; } }
  else e.vy -= 27 * dt;
  if (inWater) { e.vy += 16 * dt; e.vy *= 0.90; speed *= 0.62; }

  const wl = Math.hypot(wishX, wishZ);
  if (wl > 1e-4) {
    let nx = wishX / wl, nz = wishZ / wl;
    const step = speed * dt;
    let tx = e.x + nx * step, tz = e.z + nz * step;
    // slope rejection: refuse to climb near-vertical faces
    const th = groundH(tx, tz);
    if (th - groundH(e.x, e.z) > step * 2.4 + 0.55) {
      // slide along the contour instead of stopping dead
      const sx = -nz, sz = nx;
      const s1 = groundH(e.x + sx * step, e.z + sz * step);
      const s2 = groundH(e.x - sx * step, e.z - sz * step);
      if (s1 < s2) { tx = e.x + sx * step * .8; tz = e.z + sz * step * .8; }
      else { tx = e.x - sx * step * .8; tz = e.z - sz * step * .8; }
    }
    const rp = resolveProps(tx, tz, PLAYER_R * (e.scale || 1));
    tx = rp[0]; tz = rp[1];
    const rb = resolveBuildings(tx, tz, PLAYER_R * (e.scale || 1));
    tx = rb[0]; tz = rb[1];
    e.x = clamp(tx, -WORLD_HALF + 12, WORLD_HALF - 12);
    e.z = clamp(tz, -WORLD_HALF + 12, WORLD_HALF - 12);
    e.targetYaw = Math.atan2(nx, nz);
  }
  e.y += e.vy * dt;
  const nh = groundH(e.x, e.z);
  if (e.y < nh) { e.y = nh; if (e.vy < 0) e.vy = 0; }
  if (e.y < WATER_Y - 1.2 && nh < WATER_Y - 1.2) e.y = Math.max(e.y, nh);
  e.swim = (nh < WATER_Y - 0.9) ? 1 : 0;
  return { grounded: e.y <= nh + 0.06, inWater };
}
function faceToward(e, tx, tz, dt, rate) {
  const want = Math.atan2(tx - e.x, tz - e.z);
  e.yaw = e.yaw + angDelta(e.yaw, want) * damp(rate || 10, dt);
}

/* ------------------------------ COMBAT ------------------------------ */
function dmgNumber(x, y, z, val, kind) {
  G.dmg.push({ x, y, z, v: val, k: kind, t: 0, ox: (Math.random() - .5) * .8 });
  if (G.dmg.length > 60) G.dmg.shift();
}
function dealDamage(src, tgt, amount, kind, noText) {
  if (!tgt || tgt.dead) return 0;
  const p = G.player;
  let dmg = amount;
  let crit = false;
  if (src === p) {
    const cc = p.st.critP + (kind && kind.crit ? kind.crit : 0);
    if (Math.random() < cc) { dmg *= 2.0 + p.st.mastP * .4; crit = true; }
    if ((p.af.exec || 0) && tgt.hp / tgt.hpMax < .3) dmg *= 1 + p.af.exec * .01;
    if (p.surgeT > 0) dmg *= 1.15;
    if (crit && (p.af.surge || 0)) p.surgeT = 4;
  }
  dmg = Math.max(1, Math.round(dmg));
  tgt.hp -= dmg; tgt.hitT = 0.16;
  if (!noText) dmgNumber(tgt.x, tgt.y + (tgt.scale || 1) * 1.9, tgt.z, dmg, crit ? 'crit' : (src === p ? 'dmg' : 'in'));
  if (src === p) {
    p.stats.dmgDone += dmg;
    if (p.st.leechP > 0) healEntity(p, dmg * p.st.leechP, true);
    if ((p.af.burn || 0)) addDot(tgt, dmg * p.af.burn * .01 / 4, 4, p);
    if ((p.af.cleave || 0)) {
      for (const o of G.ents) {
        if (o === tgt || !o.isMob || o.dead) continue;
        if (V.dist2(o.x, o.z, tgt.x, tgt.z) < 25) dealDamage(src, o, dmg * p.af.cleave * .01, null, true);
      }
    }
    if (tgt.hp <= 0) onMobKilled(tgt, p);
  }
  burst(tgt.x, tgt.y + (tgt.scale || 1) * 1.2, tgt.z, crit ? 12 : 5, 2.2, 2.4, crit ? .3 : .19,
    crit ? 1 : .95, crit ? .7 : .35, crit ? .2 : .2, 1, .5);
  sfx(crit ? 'crit' : 'hit', src === p ? .8 : .5, .85 + Math.random() * .3);
  return dmg;
}
function healEntity(e, amount, silent) {
  const p = G.player;
  const maxHp = e === p ? p.st.hpMax : e.hpMax;
  const before = e.hp;
  e.hp = Math.min(maxHp, e.hp + amount);
  const gain = Math.round(e.hp - before);
  if (gain > 0 && !silent) {
    dmgNumber(e.x, e.y + 2.1, e.z, gain, 'heal');
    burst(e.x, e.y + 1, e.z, 8, 1.2, 2.2, .22, .35, 1, .5, 0, .8);
  }
  if (e === p) p.stats.healed += gain;
  return gain;
}
function addDot(tgt, dps, dur, src) {
  tgt.dots = tgt.dots || [];
  tgt.dots.push({ dps, t: dur, src });
}
function tickDots(e, dt) {
  if (!e.dots || !e.dots.length) return;
  for (let i = e.dots.length - 1; i >= 0; i--) {
    const d = e.dots[i];
    d.t -= dt;
    const amt = d.dps * dt;
    e.hp -= amt;
    if (Math.random() < dt * 3) dmgNumber(e.x, e.y + 2.2, e.z, Math.round(d.dps), 'dot');
    if (d.t <= 0) e.dots.splice(i, 1);
    if (e.hp <= 0 && e.isMob) { onMobKilled(e, G.player); break; }
  }
}

/* ------------------------------ ABILITIES ------------------------------ */
function abilityReady(p, ab) {
  if (p.gcd > 0 && ab.gcd) return false;
  if ((p.cds[ab.id] || 0) > 0) return false;
  const c = CLASS_BY[p.cls];
  if (ab.cost > 0 && p.res < ab.cost) return false;
  return true;
}
function castAbility(p, ab, target) {
  if (!abilityReady(p, ab)) return false;
  const c = CLASS_BY[p.cls];
  const needsTarget = ab.t === 'm' || ab.t === 'r' || ab.t === 's' || ab.t === 'dash';
  if (needsTarget && (!target || target.dead)) { sfx('error', .5); return false; }
  if (needsTarget) {
    const d = V.dist(p.x, p.z, target.x, target.z);
    if (d > ab.rng + (target.scale || 1) * .8) { sfx('error', .5); return false; }
  }
  if (ab.cast > 0) {
    p.casting = { ab, target, t: 0, dur: ab.cast / (1 + p.st.hasteP) };
    sfx('cast', .6);
    p.an.cast = 1;
    return true;
  }
  return execAbility(p, ab, target);
}
function execAbility(p, ab, target) {
  const c = CLASS_BY[p.cls];
  if (ab.cost > 0) p.res -= ab.cost;
  if (ab.gen && c.res === 'rage') p.res = Math.min(p.resMax, p.res + ab.gen);
  p.cds[ab.id] = ab.cd / (1 + p.st.hasteP * .5);
  if (ab.gcd) p.gcd = ab.gcd / (1 + p.st.hasteP);
  p.an.atk = 1; p.an.cast = 0;
  const face = target && !target.dead;
  if (face) faceToward(p, target.x, target.z, 1, 60);

  switch (ab.t) {
    case 'm': {
      sfx('swing', .8, .9 + Math.random() * .25);
      dealDamage(p, target, playerDamage(p, ab.dmg), ab);
      if (ab.dot) addDot(target, playerDamage(p, ab.dot.m), ab.dot.d, p);
      break;
    }
    case 'r': case 's': {
      sfx(ab.t === 's' ? 'cast' : 'swing', .7, 1.1);
      spawnProjectile(p, target, ab);
      break;
    }
    case 'aoe': {
      sfx(ab.id === 'blizz' || ab.id === 'nova' ? 'ice' : 'fire', .8);
      const rad = ab.rad || ab.rng;
      const cx = (ab.rad && target && !target.dead) ? target.x : p.x;
      const cz = (ab.rad && target && !target.dead) ? target.z : p.z;
      groundFx(cx, groundH(cx, cz), cz, rad, .6, ab.id === 'nova' || ab.id === 'blizz' || ab.id === 'trap' ? [.4, .7, 1] : [1, .5, .15]);
      let hit = 0;
      for (const e of G.ents) {
        if (!e.isMob || e.dead) continue;
        if (V.dist2(e.x, e.z, cx, cz) > rad * rad) continue;
        dealDamage(p, e, playerDamage(p, ab.dmg), ab); hit++;
        if (ab.dot) addDot(e, playerDamage(p, ab.dot.m), ab.dot.d, p);
        if (ab.slow) e.slowT = ab.dur || 4;
        if (ab.root) e.rootT = ab.root;
        if (hit > 28) break;
      }
      break;
    }
    case 'heal': {
      sfx('heal', .8);
      healEntity(p, (p.st.ap * 0.30 + p.level * 6) * ab.heal * (1 + p.st.versP));
      if (ab.hot) p.hot = { m: (p.st.ap * .3) * ab.hot.m, t: ab.hot.d };
      break;
    }
    case 'buff': {
      sfx('heal', .7, 1.4);
      p.buffs.push({ id: ab.id, n: ab.n, ic: ab.ic, t: ab.buff.d, max: ab.buff.d, b: ab.buff });
      burst(p.x, p.y + 1, p.z, 24, 2, 4, .34, 1, .85, .4, 0, 1.1);
      break;
    }
    case 'dash': {
      if (!target || target.dead) break;
      sfx('jump', .8, .7);
      const d = V.dist(p.x, p.z, target.x, target.z);
      const nx = (target.x - p.x) / d, nz = (target.z - p.z) / d;
      const land = Math.max(0, d - 2.4);
      p.x += nx * land; p.z += nz * land; p.y = groundH(p.x, p.z);
      burst(p.x, p.y + .5, p.z, 16, 3, 1.5, .3, .8, .8, .9, 1, .5);
      if (ab.dmg) dealDamage(p, target, playerDamage(p, ab.dmg), ab);
      if (ab.stun) target.stunT = ab.stun;
      break;
    }
    case 'blink': {
      sfx('portal', .6);
      const a = p.yaw;
      const d = ab.rng;
      const nx = clamp(p.x + Math.sin(a) * d, -WORLD_HALF + 12, WORLD_HALF - 12);
      const nz = clamp(p.z + Math.cos(a) * d, -WORLD_HALF + 12, WORLD_HALF - 12);
      burst(p.x, p.y + 1, p.z, 22, 2.4, 2, .3, .4, .6, 1, 1, .7);
      p.x = nx; p.z = nz; p.y = groundH(nx, nz);
      burst(p.x, p.y + 1, p.z, 22, 2.4, 2, .3, .4, .6, 1, 1, .7);
      break;
    }
    case 'dodge': {
      sfx('jump', .7, 1.3);
      const a = p.yaw + PI;
      p.x = clamp(p.x + Math.sin(a) * 9, -WORLD_HALF + 12, WORLD_HALF - 12);
      p.z = clamp(p.z + Math.cos(a) * 9, -WORLD_HALF + 12, WORLD_HALF - 12);
      p.y = groundH(p.x, p.z) + 1.2; p.vy = 5;
      break;
    }
  }
  return true;
}
function spawnProjectile(src, tgt, ab) {
  const isSpell = ab.t === 's';
  G.proj.push({
    x: src.x, y: src.y + 1.35, z: src.z, tgt, ab, src,
    spd: isSpell ? 34 : 52, t: 0,
    col: isSpell ? (ab.id === 'fire' || ab.id === 'pyro' ? [1, .5, .15] : ab.id === 'moon' || ab.id === 'wrath' ? [.5, 1, .5] : [.45, .65, 1]) : [.85, .8, .6],
    size: isSpell ? .42 : .2, kind: isSpell ? 0 : 1,
  });
}
function updateProjectiles(dt) {
  for (let i = G.proj.length - 1; i >= 0; i--) {
    const pr = G.proj[i];
    pr.t += dt;
    const t = pr.tgt;
    if (!t || t.dead || pr.t > 3.5) { G.proj.splice(i, 1); continue; }
    const ty = t.y + (t.scale || 1) * 1.1;
    let dx = t.x - pr.x, dy = ty - pr.y, dz = t.z - pr.z;
    const d = Math.hypot(dx, dy, dz);
    const step = pr.spd * dt;
    if (d <= step + .5) {
      const ab = pr.ab;
      dealDamage(pr.src, t, playerDamage(pr.src, ab.dmg), ab);
      if (ab.dot) addDot(t, playerDamage(pr.src, ab.dot.m), ab.dot.d, pr.src);
      burst(t.x, ty, t.z, 14, 2.6, 2.6, .3, pr.col[0], pr.col[1], pr.col[2], 0, .6);
      sfx(pr.kind === 0 ? 'fire' : 'hit', .7);
      G.proj.splice(i, 1); continue;
    }
    pr.x += dx / d * step; pr.y += dy / d * step; pr.z += dz / d * step;
    spawnPart(pr.x, pr.y, pr.z, 0, 0, 0, .28, pr.size * 1.5, pr.col[0], pr.col[1], pr.col[2], .9, pr.kind, 0, 0);
  }
}
function groundFx(x, y, z, r, dur, col) {
  G.gfx.push({ x, y, z, r, t: 0, dur, col });
}

/* ------------------------------ LOOT ------------------------------ */
function rollLoot(p, srcLevel, quality, count) {
  const rng = new RNG((Math.random() * 1e9) | 0);
  const out = [];
  const luck = (p.af.lucky || 0) * 0.01;
  for (let i = 0; i < (count || 1); i++) {
    let tier = rollTier(rng, quality, luck);
    if (tier === 5 && (p.level < MYTHIC_MIN_LEVEL || quality < MYTHIC_MIN_SOURCE || !metaCanMythic(p))) tier = 4;
    const ilvl = Math.max(1, Math.round(srcLevel * 2.45 + rng.r(-4, 8) + tier * 3));
    const it = genItem(rng, ilvl, tier, rng.pick(SLOT_KEYS), p.cls);
    out.push(it);
  }
  return out;
}
function giveItem(p, it, quiet) {
  if (p.bags.length >= p.bagMax) {
    // auto-sell the worst thing in the bag to make room
    let worst = 0;
    for (let i = 1; i < p.bags.length; i++) if (p.bags[i].sc < p.bags[worst].sc) worst = i;
    const sold = p.bags.splice(worst, 1)[0];
    giveGold(p, sold.val);
    toast('Bag full — sold ' + sold.n + ' for ' + fmt(sold.val) + 'g', 'sys');
  }
  p.bags.push(it);
  p.stats.itemsFound++;
  if (it.t >= 5) { p.mythic = 1; metaClaimMythic(p); }
  if (!quiet) {
    sfx('loot', .9, it.t + 1);
    toast('<span class="q' + it.t + '">' + esc(it.n) + '</span> <span class="tiny">(' + RARITY[it.t].n + ' · ilvl ' + it.il + ')</span>', 'loot');
    if (it.t >= 3) {
      chatPush('loot', p.name + ' has looted [' + it.n + ']!');
      burst(p.x, p.y + 1.4, p.z, 26, 2.4, 3.4, .34, ...hexToRgb(RARITY[it.t].c), 0, 1.3);
    }
    if (it.t >= 4) { R.flash = .5; R.flashCol = hexToRgb(RARITY[it.t].c); banner(RARITY[it.t].n.toUpperCase() + '!', it.n); }
  }
  return it;
}
function equipItem(p, idx) {
  const it = p.bags[idx]; if (!it) return;
  let slot = it.sl;
  if (slot === 'ring1' && p.gear.ring1 && !p.gear.ring2) slot = 'ring2';
  else if (slot === 'ring2' && p.gear.ring2 && !p.gear.ring1) slot = 'ring1';
  else if (slot === 'ring1' && p.gear.ring1 && p.gear.ring2) {
    slot = (p.gear.ring1.sc <= p.gear.ring2.sc) ? 'ring1' : 'ring2';
  }
  const old = p.gear[slot];
  p.gear[slot] = it;
  p.bags.splice(idx, 1);
  if (old) p.bags.push(old);
  p.st = calcStats(p); p.resMax = resourceMax(p);
  p.hp = Math.min(p.hp, p.st.hpMax);
  styleFromGear(p, p.gear, p.cls);
  sfx('ui', .8, 1.2);
  return true;
}
/** Equip anything in the bag that beats what is worn (used by auto-play). */
function autoEquipBest(p) {
  let changed = 0;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = p.bags.length - 1; i >= 0; i--) {
      const it = p.bags[i];
      let slot = it.sl;
      if (slot === 'ring1' || slot === 'ring2') {
        const r1 = p.gear.ring1, r2 = p.gear.ring2;
        if (!r1) slot = 'ring1'; else if (!r2) slot = 'ring2';
        else slot = r1.sc <= r2.sc ? 'ring1' : 'ring2';
      }
      const cur = p.gear[slot];
      if (!cur || it.sc > cur.sc) { equipItem(p, i); changed++; }
    }
  }
  if (changed) { p.st = calcStats(p); styleFromGear(p, p.gear, p.cls); }
  return changed;
}
function sellJunk(p, keepTier) {
  let g = 0, n = 0;
  for (let i = p.bags.length - 1; i >= 0; i--) {
    const it = p.bags[i];
    const cur = p.gear[it.sl === 'ring2' ? 'ring1' : it.sl];
    if (it.t >= (keepTier == null ? 4 : keepTier)) continue;
    if (cur && it.sc > cur.sc) continue;
    g += it.val; n++; p.bags.splice(i, 1);
  }
  if (n) { giveGold(p, g); sfx('coin', .8); }
  return { g, n };
}

/* ------------------------------ KILL / DEATH ------------------------------ */
function onMobKilled(m, p) {
  if (m.dead) return;
  m.dead = 1; m.an.dead = 1; m.deadT = 0;
  p.kills++;
  const isBoss = m.kind === 'boss';
  giveXP(p, m.xp * (isBoss ? 1 : 1));
  const g = giveGold(p, m.gold);
  burst(m.x, m.y + 1, m.z, isBoss ? 60 : 14, 3, 3, isBoss ? .5 : .25, .9, .5, .25, 0, isBoss ? 2 : .8);
  sfx('death', isBoss ? 1 : .5);
  if (isBoss) {
    p.bossKills++; p.stats.bossesKilled++;
    const bd = DB.bosses[m.bossId];
    banner('SLAIN', m.name + ', ' + m.title);
    chatPush('kill', p.name + ' has slain ' + m.name + ', ' + m.title + '!');
    R.flash = .7; R.flashCol = [1, .8, .5];
    R.camShake = .9;
    const loot = rollLoot(p, m.level, bd ? bd.lootTier : 3, 2 + ((Math.random() * 2) | 0));
    for (const it of loot) giveItem(p, it);
    metaBossKilled(p, bd);
    questProgress(p, 'boss', m.name, 1);
    BOSS_STATE[m.bossId] = G.t + (bd ? bd.respawn : 120);
  } else {
    if (Math.random() < (m.rank === 1 ? .85 : .34) + (p.af.lucky || 0) * .004) {
      const loot = rollLoot(p, m.level, m.rank === 1 ? 2 : 1, 1);
      for (const it of loot) giveItem(p, it);
    }
  }
  questProgress(p, 'kill', m.name, 1);
  if (m.rank === 1) questProgress(p, 'elite', m.name, 1);
  questProgress(p, 'collect', null, 1);
  if ((p.af.arc || 0)) p.res = Math.min(p.resMax, p.res + p.af.arc);
  if (G.target === m) G.target = null;
}
function killPlayer(p) {
  if (p.dead) return;
  p.dead = 1; p.an.dead = 1; p.deaths++;
  G.deathT = 0;
  sfx('death', 1);
  R.dmgVig = 1;
  banner('YOU DIED', 'Reviving at ' + (nearestPOI(p.x, p.z, 'hubs') || { n: 'the keep' }).n);
  chatPush('sys', 'You have been slain.');
  // a death costs some gold, never levels — seasons are short
  const loss = Math.round(p.gold * 0.04);
  p.gold = Math.max(0, p.gold - loss);
}
function revivePlayer(p) {
  const hub = nearestPOI(p.x, p.z, 'hubs') || POI.hubs[0];
  p.x = hub.x + (Math.random() - .5) * 10; p.z = hub.z + (Math.random() - .5) * 10;
  p.y = groundH(p.x, p.z);
  p.dead = 0; p.an.dead = 0; p.hp = p.st.hpMax; p.safeT = 5;
  p.res = CLASS_BY[p.cls].res === 'rage' ? 0 : p.resMax;
  p.dots = []; p.buffs.length = 0;
  R.dmgVig = 0;
  sfx('portal', .8);
  burst(p.x, p.y + 1, p.z, 30, 2.5, 4, .35, .5, .8, 1, 0, 1.2);
  G.target = null;
}

/* ------------------------------ MOB AI ------------------------------ */
const BOSS_STATE = {};
function updateMob(e, dt, p) {
  if (e.dead) {
    e.deadT += dt;
    e.an.t += dt;
    if (e.deadT > 6) e.remove = 1;
    return;
  }
  tickDots(e, dt);
  if (e.hp <= 0) { onMobKilled(e, p); return; }
  e.hitT = Math.max(0, e.hitT - dt);
  e.stunT = Math.max(0, (e.stunT || 0) - dt);
  e.rootT = Math.max(0, (e.rootT || 0) - dt);
  e.slowT = Math.max(0, (e.slowT || 0) - dt);
  e.atkCd = Math.max(0, e.atkCd - dt);
  e.an.atk = Math.max(0, e.an.atk - dt * 2.6);
  e.an.t += dt;

  const dp = V.dist(e.x, e.z, p.x, p.z);
  const canSee = !p.dead && dp < e.aggro;
  if (e.st === 'idle' && canSee) { e.st = 'chase'; if (e.kind === 'boss') { sfx('roar', 1); banner(e.name, e.title || 'Boss Encounter'); musicSet('boss'); } }
  if (e.st === 'chase' && (p.dead || V.dist(e.x, e.z, e.hx, e.hz) > e.leash)) e.st = 'return';
  if (e.st === 'return' && V.dist(e.x, e.z, e.hx, e.hz) < 3) { e.st = 'idle'; e.hp = e.hpMax; }

  let wx = 0, wz = 0, spd = 0;
  if (e.stunT > 0) { e.an.spd = 0; moveEntity(e, 0, 0, 0, dt); return; }

  if (e.st === 'chase') {
    const reach = (e.ranged ? 18 : 2.6 + (e.scale || 1) * .9);
    if (dp > reach) {
      if (e.rootT <= 0) {
        const nv = [0, 0]; navStep(e.x, e.z, p.x, p.z, nv);
        wx = nv[0]; wz = nv[1]; spd = e.speed * (e.slowT > 0 ? .5 : 1);
      }
    } else if (e.atkCd <= 0) {
      e.atkCd = e.kind === 'boss' ? 1.6 : 2.1;
      e.an.atk = 1;
      faceToward(e, p.x, p.z, dt, 30);
      const dmg = mobDamage(e, p) * (0.85 + Math.random() * 0.3) * (e.enraged ? 1.7 : 1);
      applyDamageToPlayer(p, dmg, e);
      sfx('swing', .5, .7);
    }
    faceToward(e, p.x, p.z, dt, 8);
  } else if (e.st === 'return') {
    const nv = [0, 0]; navStep(e.x, e.z, e.hx, e.hz, nv);
    wx = nv[0]; wz = nv[1]; spd = e.speed * 1.3;
  } else {
    e.tt -= dt;
    if (e.tt <= 0) {
      e.tt = 3 + Math.random() * 5;
      e.wanderA = Math.random() * TAU;
      e.wandering = Math.random() < .55;
    }
    if (e.wandering) {
      const tx = e.hx + Math.cos(e.wanderA) * 9, tz = e.hz + Math.sin(e.wanderA) * 9;
      const nv = [0, 0]; navStep(e.x, e.z, tx, tz, nv);
      wx = nv[0]; wz = nv[1]; spd = e.speed * .35;
    }
  }
  // boss mechanics
  if (e.kind === 'boss' && e.st === 'chase') updateBossMechanics(e, dt, p);

  moveEntity(e, wx, wz, spd, dt);
  e.an.spd = clamp(spd / 5.5, 0, 1);
  e.an.run = clamp(spd / 9, 0, 1);
  if (e.targetYaw != null && spd > 0) e.yaw += angDelta(e.yaw, e.targetYaw) * damp(9, dt);
}
function updateBossMechanics(e, dt, p) {
  const frac = e.hp / e.hpMax;
  if (frac < .25 && !e.enraged && e.mech.some(m => m.k === 'enrage')) {
    e.enraged = 1; banner('ENRAGE', e.name + ' is enraged!'); sfx('roar', 1); chatPush('kill', e.name + ' has enraged!');
  }
  e.mechCd -= dt;
  if (e.mechCd > 0) return;
  e.mechCd = 7 + Math.random() * 5;
  const m = e.mech[(Math.random() * e.mech.length) | 0];
  switch (m.k) {
    case 'aoe': case 'meteor': {
      const n = m.k === 'meteor' ? 4 : 1;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * TAU, r = m.k === 'meteor' ? Math.random() * 16 : 0;
        const x = (m.k === 'meteor' ? p.x : e.x) + Math.cos(ang) * r;
        const z = (m.k === 'meteor' ? p.z : e.z) + Math.sin(ang) * r;
        telegraph(x, z, m.k === 'meteor' ? 5 : 11, 1.8, mobDamage(e, p) * 2.2, e);
      }
      chatPush('kill', e.name + ' casts ' + m.n + '!');
      break;
    }
    case 'void': {
      for (let i = 0; i < 3; i++) {
        const ang = Math.random() * TAU;
        telegraph(e.x + Math.cos(ang) * 9, e.z + Math.sin(ang) * 9, 6, 2.4, mobDamage(e, p) * 1.4, e, [.6, .2, .9]);
      }
      break;
    }
    case 'charge': {
      const d = V.dist(e.x, e.z, p.x, p.z);
      if (d > 6) {
        const nx = (p.x - e.x) / d, nz = (p.z - e.z) / d;
        e.x += nx * (d - 3); e.z += nz * (d - 3); e.y = groundH(e.x, e.z);
        burst(e.x, e.y + 1, e.z, 20, 4, 2, .4, .9, .5, .2, 1, .7);
        applyDamageToPlayer(p, mobDamage(e, p) * 1.5, e);
        sfx('roar', .7); R.camShake = .6;
      }
      break;
    }
    case 'adds': {
      const zn = DB.zones[e.zone];
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU;
        spawnMob(e.x + Math.cos(a) * 7, e.z + Math.sin(a) * 7, Math.max(1, e.level - 3), 0, zn.mobs[0], e.zone);
      }
      chatPush('kill', e.name + ' summons thralls!');
      break;
    }
    case 'heal': { e.hp = Math.min(e.hpMax, e.hp + e.hpMax * .05); dmgNumber(e.x, e.y + 3, e.z, Math.round(e.hpMax * .05), 'heal'); break; }
    case 'shield': { e.shieldT = 6; dmgNumber(e.x, e.y + 3, e.z, 0, 'shield'); break; }
    case 'fear': {
      if (V.dist(e.x, e.z, p.x, p.z) < 14) { p.fearT = 2.4; chatPush('kill', e.name + ' bellows — you are terrified!'); sfx('roar', .9); }
      break;
    }
    case 'drain': { const d = mobDamage(e, p) * 1.1; applyDamageToPlayer(p, d, e); e.hp = Math.min(e.hpMax, e.hp + e.hpMax * .02); break; }
    case 'cleave': {
      if (V.dist(e.x, e.z, p.x, p.z) < 9) { applyDamageToPlayer(p, mobDamage(e, p) * 1.9, e); sfx('crit', .7); }
      break;
    }
    case 'phase': { e.phaseT = 2.5; break; }
  }
}
function telegraph(x, z, r, delay, dmg, src, col) {
  G.gfx.push({ x, y: groundH(x, z), z, r, t: 0, dur: delay, tele: 1, dmg, src, col: col || [1, .25, .12] });
}
function applyDamageToPlayer(p, amount, src) {
  if (p.dead || (p.safeT || 0) > 0) return;
  let dmg = amount * (1 - p.st.drP);
  for (const b of p.buffs) if (b.b.dr) dmg *= (1 - b.b.dr);
  dmg = Math.max(1, Math.round(dmg));
  p.hp -= dmg;
  p.stats.dmgTaken += dmg;
  dmgNumber(p.x, p.y + 2.2, p.z, dmg, 'in');
  R.dmgVig = Math.min(1, R.dmgVig + dmg / p.st.hpMax * 1.6);
  R.camShake = Math.min(.6, R.camShake + dmg / p.st.hpMax * 1.2);
  if ((p.af.thorns || 0) && src && src.isMob) dealDamage(p, src, dmg * p.af.thorns * .01, null, true);
  if (CLASS_BY[p.cls].res === 'rage') p.res = Math.min(p.resMax, p.res + 8);
  G.combat = 6;
  if (p.hp <= 0) killPlayer(p);
}

/* ------------------------------ AI ADVENTURER AVATARS ------------------------------ */
const AI_CHAT = [
  'anyone for {r}?', 'LFM {r} need heals', 'WTS [{i}] 500g', 'grats!!', 'this zone is brutal',
  'wts mats cheap', 'anyone seen {b}?', 'ding {l}!', 'guild recruiting, whisper me', 'that drop rate is criminal',
  'wtb enchant', 'need 2 more for {r}', 'gz on the drop', 'lol nice', 'brb repairing',
  'first try!', 'omw', 'wipe. again.', 'my luck is unreal today', 'anyone want to duo quests?',
  'server is popping today', 'best season yet', '{b} down!', 'who needs a port', 'inv me',
];
function aiSay(e) {
  const r = DB.raids[(Math.random() * DB.raids.length) | 0];
  const b = DB.bosses[(Math.random() * DB.bosses.length) | 0];
  let s = AI_CHAT[(Math.random() * AI_CHAT.length) | 0];
  s = s.replace('{r}', r.n).replace('{b}', b.n).replace('{l}', '' + e.level)
    .replace('{i}', ITEM_PREFIX[(Math.random() * ITEM_PREFIX.length) | 0] + 'blade of the Bear');
  e.bubble = s; e.bubbleT = 4.5;
  const ch = Math.random() < .3 ? 'guild' : Math.random() < .5 ? 'trade' : 'say';
  chatPush(ch, '[' + e.name + ']: ' + s);
}
function updateAIAvatar(e, dt, p) {
  e.an.t += dt;
  e.an.atk = Math.max(0, e.an.atk - dt * 2.6);
  e.atkCd = Math.max(0, e.atkCd - dt);
  e.hitT = Math.max(0, e.hitT - dt);
  if (e.bubbleT > 0) e.bubbleT -= dt;
  e.chatT -= dt;
  if (e.chatT <= 0) { e.chatT = 26 + Math.random() * 50; if (V.dist(e.x, e.z, p.x, p.z) < 60) aiSay(e); }

  const rec = e.rec;
  e.level = rec.lv;
  // pick a fight if a mob is close, otherwise travel toward the roster goal
  if (!e.foe || e.foe.dead || V.dist2(e.x, e.z, e.foe.x, e.foe.z) > 900) {
    e.foe = null;
    let bd = 26 * 26;
    for (const o of G.ents) {
      if (!o.isMob || o.dead) continue;
      const d = V.dist2(e.x, e.z, o.x, o.z);
      if (d < bd) { bd = d; e.foe = o; }
    }
  }
  let wx = 0, wz = 0, spd = 0;
  if (e.foe && !e.foe.dead) {
    const d = V.dist(e.x, e.z, e.foe.x, e.foe.z);
    const reach = (rec.c === 'mage' || rec.c === 'ranger' || rec.c === 'druid') ? 17 : 3.0;
    if (d > reach) {
      const nv = [0, 0]; navStep(e.x, e.z, e.foe.x, e.foe.z, nv);
      wx = nv[0]; wz = nv[1]; spd = e.speed;
    } else if (e.atkCd <= 0) {
      e.atkCd = 1.5 + Math.random() * .8;
      e.an.atk = 1;
      faceToward(e, e.foe.x, e.foe.z, dt, 30);
      const dmg = refDPS(rec.lv) * (0.55 + rec.gs / (refPrimary(rec.lv) * 9)) * 1.4;
      e.foe.hp -= dmg;
      e.foe.hitT = .16;
      dmgNumber(e.foe.x, e.foe.y + (e.foe.scale || 1) * 1.9, e.foe.z, Math.round(dmg), 'ally');
      burst(e.foe.x, e.foe.y + 1, e.foe.z, 4, 1.8, 2, .16, .8, .8, .95, 1, .4);
      if (e.foe.hp <= 0 && !e.foe.dead) {
        e.foe.dead = 1; e.foe.an.dead = 1; e.foe.deadT = 0;
        burst(e.foe.x, e.foe.y + 1, e.foe.z, 10, 2.4, 2.4, .22, .9, .5, .25, 0, .7);
      }
    }
    faceToward(e, e.foe.x, e.foe.z, dt, 8);
  } else {
    if (!e.dest || V.dist2(e.x, e.z, e.dest[0], e.dest[1]) < 36) {
      e.dest = [rec.tx, rec.tz];
      if (Math.random() < .25) {
        const poi = POI.all[(Math.random() * POI.all.length) | 0];
        e.dest = [poi.x + (Math.random() - .5) * 16, poi.z + (Math.random() - .5) * 16];
      }
    }
    const nv = [0, 0]; navStep(e.x, e.z, e.dest[0], e.dest[1], nv);
    wx = nv[0]; wz = nv[1]; spd = e.speed * (rec.st === 'raid' || rec.st === 'boss' ? 1.15 : .92);
  }
  moveEntity(e, wx, wz, spd, dt);
  e.an.spd = clamp(spd / 5.5, 0, 1);
  e.an.run = clamp(spd / 8, 0, 1);
  if (e.targetYaw != null && spd > 0) e.yaw += angDelta(e.yaw, e.targetYaw) * damp(9, dt);
  rec.x = e.x; rec.z = e.z;
}

/* ------------------------------ SPAWNING ------------------------------ */
const MAX_MOBS = 44, MAX_AI = 34;
function updateSpawns(dt, p) {
  G.spawnT -= dt;
  if (G.spawnT > 0) return;
  G.spawnT = 0.6;
  let mobs = 0, ais = 0;
  for (let i = G.ents.length - 1; i >= 0; i--) {
    const e = G.ents[i];
    if (e.remove) { if (e.rec) e.rec.av = null; G.ents.splice(i, 1); continue; }
    const d = V.dist(e.x, e.z, p.x, p.z);
    if (d > 260) {
      if (e.kind === 'boss') { if (d > 320) { e.remove = 1; } }
      else { if (e.rec) e.rec.av = null; G.ents.splice(i, 1); continue; }
    }
    if (e.isMob) mobs++; else if (e.kind === 'ai') ais++;
  }
  const zn = zoneAt(p.x, p.z);
  // ---- mobs ----
  let tries = 0;
  const nearCamps = POI.camps.filter(c => V.dist2(c.x, c.z, p.x, p.z) < 170 * 170);
  while (mobs < MAX_MOBS && tries++ < 24) {
    let x, z;
    if (nearCamps.length && Math.random() < .58) {
      // most spawns belong to a camp, so cleared ground stays cleared for a while
      const c = nearCamps[(Math.random() * nearCamps.length) | 0];
      const ca = Math.random() * TAU, cr = Math.sqrt(Math.random()) * 24;
      x = c.x + Math.cos(ca) * cr; z = c.z + Math.sin(ca) * cr;
      if (V.dist2(x, z, p.x, p.z) < 26 * 26) continue;
    } else {
      const a = Math.random() * TAU, r = 30 + Math.random() * 120;
      x = p.x + Math.cos(a) * r; z = p.z + Math.sin(a) * r;
    }
    if (Math.abs(x) > WORLD_HALF - 20 || Math.abs(z) > WORLD_HALF - 20) continue;
    const h = groundH(x, z);
    if (h < WATER_Y + .8 || slopeAt(x, z) > .45) continue;
    let inTown = false;
    for (const hub of POI.hubs) if (V.dist2(x, z, hub.x, hub.z) < 62 * 62) { inTown = true; break; }
    if (inTown) continue;
    const z2 = zoneAt(x, z);
    const camp = nearestPOI(x, z, 'camps', 34);
    const lv = clamp(Math.round(lerp(z2.lvMin, z2.lvMax, Math.random())), 1, 9999);
    const rank = Math.random() < .09 ? 1 : 0;
    const fam = camp ? z2.mobs[camp.fam] : z2.mobs[(Math.random() * z2.mobs.length) | 0];
    spawnMob(x, z, lv, rank, fam, z2.id);
    mobs++;
  }
  // ---- boss lairs near the player ----
  for (const l of POI.lairs) {
    const d = V.dist(p.x, p.z, l.x, l.z);
    if (d > 150) continue;
    const bd = DB.bosses[l.boss];
    if ((BOSS_STATE[bd.id] || 0) > G.t) continue;
    let exists = false;
    for (const e of G.ents) if (e.kind === 'boss' && e.bossId === bd.id) { exists = true; break; }
    if (!exists) spawnBoss(bd);
  }
  // ---- visible AI adventurers ----
  if (ROSTER.length) {
    let guard = 0;
    while (ais < MAX_AI && guard++ < 40) {
      const rec = ROSTER[(Math.random() * ROSTER.length) | 0];
      if (rec.av || rec.dead) continue;
      const d = V.dist(rec.x, rec.z, p.x, p.z);
      if (d > 170 || d < 6) continue;
      spawnAIAvatar(rec); ais++;
    }
  }
}

/* ------------------------------ CAMERA ------------------------------ */
function updateCamera(dt, p) {
  const c = G.cam;
  const tgtY = p.y + 1.55 * (p.scale || 1);
  let dist = G.camDist;
  const pitch = G.camPitch;
  const yaw = G.camYaw;
  const ox = Math.sin(yaw) * Math.cos(pitch), oz = Math.cos(yaw) * Math.cos(pitch), oy = Math.sin(pitch);
  // pull the camera in when terrain would clip it
  let dsafe = dist;
  for (let s = 0.25; s <= 1.0; s += 0.15) {
    const tx = p.x - ox * dist * s, tz = p.z - oz * dist * s, ty = tgtY + oy * dist * s;
    const gh = groundH(tx, tz) + 0.9;
    if (ty < gh) { dsafe = Math.min(dsafe, dist * s * 0.92); }
  }
  const shake = G.camShake;
  const sx = shake ? (Math.random() - .5) * shake * .7 : 0;
  const sy = shake ? (Math.random() - .5) * shake * .7 : 0;
  const wantX = p.x - ox * dsafe + sx, wantZ = p.z - oz * dsafe, wantY = tgtY + oy * dsafe + 0.9 + sy;
  const k = damp(18, dt);
  c.x += (wantX - c.x) * k; c.y += (wantY - c.y) * k; c.z += (wantZ - c.z) * k;
  const minY = groundH(c.x, c.z) + 0.55;
  if (c.y < minY) c.y = minY;
  c.tx = p.x; c.ty = tgtY + 0.25; c.tz = p.z;
  G.camShake = Math.max(0, G.camShake - dt * 2.4);
}

/* ------------------------------ TARGETING ------------------------------ */
function pickTarget(p, maxD) {
  let best = null, bs = -1;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  for (const e of G.ents) {
    if (!e.isMob || e.dead) continue;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > (maxD || 34)) continue;
    const dot = (dx / d) * fx + (dz / d) * fz;
    const s = dot * 2.2 - d / 34 + (e.st === 'chase' ? .8 : 0) + (e.kind === 'boss' ? .5 : 0);
    if (s > bs) { bs = s; best = e; }
  }
  return best;
}
function nearestEnemy(p, maxD, preferBoss) {
  let best = null, bd = (maxD || 200) ** 2;
  for (const e of G.ents) {
    if (!e.isMob || e.dead) continue;
    let d = V.dist2(e.x, e.z, p.x, p.z);
    if (preferBoss && e.kind === 'boss') d *= .25;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/* ------------------------------ PLAYER TICK ------------------------------ */
function updatePlayer(dt, input) {
  const p = G.player;
  const c = CLASS_BY[p.cls];
  p.playtime += dt;
  p.an.t += dt;
  p.gcd = Math.max(0, p.gcd - dt);
  p.surgeT = Math.max(0, (p.surgeT || 0) - dt);
  p.safeT = Math.max(0, (p.safeT || 0) - dt);
  p.fearT = Math.max(0, (p.fearT || 0) - dt);
  for (const k in p.cds) if (p.cds[k] > 0) p.cds[k] = Math.max(0, p.cds[k] - dt);
  p.an.atk = Math.max(0, p.an.atk - dt * 2.6);

  if (p.dead) {
    G.deathT += dt;
    p.an.spd = 0;
    if (G.deathT > 3.2) revivePlayer(p);
    return;
  }
  R.dmgVig = Math.max(0, R.dmgVig - dt * 0.85);

  // buffs
  p.buffDmg = 0; let hasteBuff = 0;
  for (let i = p.buffs.length - 1; i >= 0; i--) {
    const b = p.buffs[i]; b.t -= dt;
    if (b.t <= 0) { p.buffs.splice(i, 1); continue; }
    if (b.b.dmg) p.buffDmg += b.b.dmg;
    if (b.b.hst) hasteBuff += b.b.hst;
  }
  if (p.hot) { p.hot.t -= dt; healEntity(p, p.hot.m * dt, true); if (p.hot.t <= 0) p.hot = null; }
  tickDots(p, dt);
  if (p.hp <= 0) { killPlayer(p); return; }

  // resource regen
  if (c.res === 'energy') p.res = Math.min(p.resMax, p.res + 13 * dt * (1 + p.st.hasteP));
  else if (c.res === 'mana') p.res = Math.min(p.resMax, p.res + p.resMax * 0.045 * dt * (G.combat > 0 ? .5 : 2.2));
  else if (G.combat <= 0) p.res = Math.max(0, p.res - 6 * dt);

  // out of combat health regen
  G.combat = Math.max(0, G.combat - dt);
  if (G.combat <= 0 && p.hp < p.st.hpMax) healEntity(p, p.st.hpMax * 0.13 * dt, true);

  // casting
  if (p.casting) {
    p.casting.t += dt;
    p.an.cast = 1;
    if (p.fearT > 0) { p.casting = null; p.an.cast = 0; }
    else if (p.casting.t >= p.casting.dur) {
      const cst = p.casting; p.casting = null; p.an.cast = 0;
      execAbility(p, cst.ab, cst.target);
    }
  } else p.an.cast = Math.max(0, p.an.cast - dt * 3);

  // movement
  let wx = input.mx, wz = input.mz;
  if (p.fearT > 0) { const a = G.t * 3; wx = Math.sin(a); wz = Math.cos(a); }
  if (p.casting && (wx || wz)) { p.casting = null; p.an.cast = 0; }
  const sprint = input.sprint ? 1.55 : 1;
  const speed = (6.4 * sprint) * (1 + p.st.speedP);
  const prevX = p.x, prevZ = p.z;
  const st = moveEntity(p, wx, wz, speed, dt, true);
  p.stats.distance += Math.hypot(p.x - prevX, p.z - prevZ);
  const moving = Math.hypot(wx, wz) > .05;
  p.an.spd = clamp(Math.hypot(p.x - prevX, p.z - prevZ) / dt / 6.4, 0, 1);
  p.an.run = input.sprint ? 1 : 0;
  p.an.air = st.grounded ? 0 : 1;
  if (moving) p.yaw += angDelta(p.yaw, p.targetYaw) * damp(14, dt);
  // footstep audio
  if (moving && st.grounded) {
    p.stepT = (p.stepT || 0) + dt * (2.6 + p.an.spd * 3.2) * sprint;
    if (p.stepT > 1) { p.stepT = 0; sfx('step', .5, p.swim ? .5 : .9 + Math.random() * .3); }
  }
  if (input.jump && st.grounded && !p.dead) { p.vy = 10.4; sfx('jump', .7); input.jump = false; }

  // auto attack
  const t = G.target;
  if (t && !t.dead) {
    const d = V.dist(p.x, p.z, t.x, t.z);
    const auto = c.ab.find(a => a.auto);
    if (d <= auto.rng + (t.scale || 1) * .8 && p.autoAttack !== false) {
      p.aaT = (p.aaT || 0) - dt * (1 + p.st.hasteP);
      if (p.aaT <= 0) { p.aaT = 1.9; if (p.gcd <= 0) { castAbility(p, auto, t); G.combat = 6; } }
    }
  }
  if (t && (t.dead || V.dist(p.x, p.z, t.x, t.z) > 78)) G.target = null;

  // zone tracking
  const zn = zoneAt(p.x, p.z);
  if (zn && zn.id !== G.lastZone) {
    G.lastZone = zn.id; G.zone = zn;
    p.seenZones[zn.id] = 1;
    toast('<b style="color:var(--gold)">' + esc(zn.n) + '</b><div class="tiny">Levels ' + zn.lvMin + '–' + zn.lvMax + '</div>', 'zone');
    $('mmz').textContent = zn.n;
    questProgress(p, 'explore', zn.n, 1);
  }
  const hub = nearestPOI(p.x, p.z, 'hubs', 55);
  if (hub) { p.lastTownVisit = G.t; p.inTown = hub; } else p.inTown = null;
  const ruin = nearestPOI(p.x, p.z, 'ruins', 22);
  if (ruin) questProgress(p, 'explore', ruin.n, 1);
}

/* ------------------------------ WORLD TICK ------------------------------ */
function updateWorld(dt) {
  const p = G.player;
  // ground effects & telegraphs
  for (let i = G.gfx.length - 1; i >= 0; i--) {
    const g = G.gfx[i];
    g.t += dt;
    if (g.tele) {
      if ((R.frame + i) % 2 === 0) {
        const a = Math.random() * TAU, r = g.r * Math.sqrt(Math.random());
        spawnPart(g.x + Math.cos(a) * r, g.y + .1, g.z + Math.sin(a) * r, 0, .5, 0, .4, .22, g.col[0], g.col[1], g.col[2], .8, 0, 0, 0);
      }
      if (g.t >= g.dur) {
        if (V.dist2(p.x, p.z, g.x, g.z) < g.r * g.r) applyDamageToPlayer(p, g.dmg, g.src);
        burst(g.x, g.y + .3, g.z, 30, g.r * .7, 5, .5, g.col[0], g.col[1], g.col[2], 0, 1);
        sfx('fire', .9); R.camShake = .4;
        G.gfx.splice(i, 1); continue;
      }
    } else if (g.t >= g.dur) { G.gfx.splice(i, 1); continue; }
  }
  // entities
  for (let i = G.ents.length - 1; i >= 0; i--) {
    const e = G.ents[i];
    if (e.remove) { if (e.rec) e.rec.av = null; G.ents.splice(i, 1); continue; }
    if (e.isMob) updateMob(e, dt, p); else if (e.kind === 'ai') updateAIAvatar(e, dt, p);
  }
  updateProjectiles(dt);
  updateSpawns(dt, p);
  // floating combat text
  for (let i = G.dmg.length - 1; i >= 0; i--) { G.dmg[i].t += dt; if (G.dmg[i].t > 1.5) G.dmg.splice(i, 1); }
  // music director
  const boss = G.ents.find(e => e.kind === 'boss' && e.st === 'chase' && !e.dead);
  let want = 'explore';
  if (G.inRaid) want = 'raid';
  else if (boss) want = 'boss';
  else if (G.combat > 0) want = 'combat';
  else if (p.inTown) want = 'town';
  else if (R.sky && R.sky.night > .55) want = 'night';
  else if (G.zone && G.zone.order >= 4) want = 'wilds';
  if (want !== G.musicState) { G.musicState = want; musicSet(want); }
  musicIntensity(G.combat > 0 ? (boss ? 1 : .78) : (p.inTown ? .25 : .45));
}

/* ------------------------------ RENDER BRIDGE ------------------------------ */
function sceneDrawEntities() {
  const p = G.player;
  if (!p) return;
  const cx = G.cam.tx, cz = G.cam.tz;
  for (const e of G.ents) {
    const d2 = V.dist2(e.x, e.z, cx, cz);
    if (d2 > 260 * 260) continue;
    if (!sphereInFrustum(e.x, e.y + 1.2 * (e.scale || 1), e.z, 2.6 * (e.scale || 1))) continue;
    e.lodv = d2 > 90 * 90 ? 1 : 0;
    drawCharacter(e, e.lodv);
    if (e.hitT > 0) {
      M4.trs(_m, e.x, e.y + (e.scale || 1) * .95, e.z, 0, e.yaw, 0, 1.6 * (e.scale || 1), 1.9 * (e.scale || 1), 1.6 * (e.scale || 1));
      pushInst(M.sph, _m, 1, .5, .4, e.hitT * 3.4, 0, .3);
    }
  }
  drawCharacter(p, 0);
  // selection ring under the current target so it reads at a glance
  const tg = G.target;
  if (tg && !tg.dead) {
    const r = 1.5 * (tg.scale || 1);
    const pulse = .55 + Math.sin(R.time * 4) * .25;
    M4.trs(_m, tg.x, groundH(tg.x, tg.z) + .09, tg.z, 0, R.time * .8, 0, r * 2.1, .1, r * 2.1);
    pushInst(M.sph, _m, 1, .78, .32, pulse * 1.6, 0, .2);
  }
  // ground decals for AoE / telegraphs
  for (const g of G.gfx) {
    const k = g.tele ? clamp(g.t / g.dur, 0, 1) : 1 - clamp(g.t / g.dur, 0, 1);
    M4.trs(_m, g.x, g.y + .08, g.z, 0, R.time * .4, 0, g.r * 2, .12, g.r * 2);
    pushInst(M.sph, _m, g.col[0], g.col[1], g.col[2], .6 + k * 1.4, 0, .2);
  }
  // projectiles get a solid core so they read at distance
  for (const pr of G.proj) {
    M4.trs(_m, pr.x, pr.y, pr.z, 0, 0, 0, pr.size * 1.6, pr.size * 1.6, pr.size * 1.6);
    pushInst(M.sph, _m, pr.col[0], pr.col[1], pr.col[2], 2.2, 0, .1);
  }
}
