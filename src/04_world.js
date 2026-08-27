/* =========================================================================
   IDLE QUEST — 04 WORLD
   The open world: continuous heightfield, biome blending, a road network
   linking twelve towns, deterministic prop scatter with collision, and all
   the points of interest the AI population navigates between.
   ========================================================================= */

const WORLD_SIZE = 2400;          // world is WORLD_SIZE x WORLD_SIZE units
const WORLD_HALF = WORLD_SIZE / 2;
const WATER_Y = 5.0;
const CHUNK = 60;                 // prop scatter chunk size

/* ------------------------------ HEIGHTFIELD ------------------------------ */
/* Layered: continent shelf, rolling hills, ridged mountains, fine detail.
   Everything is a pure function of (x,z) so the world is identical forever. */
function continentMask(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z)) / WORLD_HALF;
  return 1 - smoothstep(0.80, 1.02, d);      // fall into ocean at the rim
}
function mountainMask(x, z) {
  const m = fbm(x * 0.00052 + 91.3, z * 0.00052 - 44.7, 3);
  return smoothstep(0.02, 0.42, m);
}
function terrainH(x, z) {
  const cm = continentMask(x, z);
  if (cm <= 0.001) return -26;
  const hills = fbm(x * 0.00135, z * 0.00135, 5) * 30;
  const mid = fbm(x * 0.0052 + 12.7, z * 0.0052 + 5.1, 4) * 8.5;
  const mm = mountainMask(x, z);
  const rid = ridged(x * 0.00168 + 31.2, z * 0.00168 - 17.9, 5);
  const mount = Math.pow(rid, 2.35) * mm * 165;
  const detail = fbm(x * 0.021, z * 0.021, 3) * 1.5;
  let h = 16 + hills + mid + mount + detail;
  h *= cm; h -= (1 - cm) * 34;
  // river valleys: carve where a low-frequency "channel" noise crosses zero
  const rv = Math.abs(fbm(x * 0.00088 - 200.5, z * 0.00088 + 88.2, 3));
  const carve = (1 - smoothstep(0.0, 0.055, rv)) * 13 * cm;
  h -= carve;
  return h;
}
/* ---- flattening for towns and roads (applied on top of terrainH) ---- */
let FLATS = [];      // {x,z,r,h,soft}
let ROADS = [];      // {ax,az,bx,bz,len,dx,dz}
function addFlat(x, z, r, h) { FLATS.push({ x, z, r, h }); }
function buildRoads() {
  const hubs = DB.zones.map(z => ({ x: z.hx, z: z.hz, id: z.id }));
  const cols = 4, rows = 3;
  const link = (a, b) => {
    const A = hubs[a], B = hubs[b];
    if (!A || !B) return;
    const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
    // split long roads into segments that follow the terrain a little
    const segs = Math.max(2, Math.round(len / 130));
    let px = A.x, pz = A.z;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const wob = Math.sin(t * PI) * 46;
      const nx = A.x + dx * t + (-dz / len) * wob * Math.sin(a * 3.1 + b * 1.7 + i);
      const nz = A.z + dz * t + (dx / len) * wob * Math.sin(a * 2.3 + b * 2.9 + i);
      const sdx = nx - px, sdz = nz - pz, sl = Math.hypot(sdx, sdz) || 1;
      ROADS.push({ ax: px, az: pz, bx: nx, bz: nz, len: sl, dx: sdx / sl, dz: sdz / sl });
      px = nx; pz = nz;
    }
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) link(r * cols + c, r * cols + c + 1);
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows - 1; r++) link(r * cols + c, (r + 1) * cols + c);
}
function roadDistExact(x, z) {
  let best = 1e9;
  for (let i = 0; i < ROADS.length; i++) {
    const s = ROADS[i];
    let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz);
    if (t < 0) t = 0; else if (t > s.len) t = s.len;
    const px = s.ax + s.dx * t, pz = s.az + s.dz * t;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
/* roadDist is queried thousands of times per frame, so bake it into a coarse
   field once and bilinearly sample. Error is a metre or two — invisible. */
const RF_N = 320, RF_STEP = WORLD_SIZE / RF_N;
let ROAD_FIELD = null;
function buildRoadField() {
  ROAD_FIELD = new Float32Array((RF_N + 1) * (RF_N + 1));
  for (let j = 0; j <= RF_N; j++) {
    const z = -WORLD_HALF + j * RF_STEP;
    for (let i = 0; i <= RF_N; i++) {
      const x = -WORLD_HALF + i * RF_STEP;
      ROAD_FIELD[j * (RF_N + 1) + i] = Math.min(roadDistExact(x, z), 240);
    }
  }
}
function roadDist(x, z) {
  if (!ROAD_FIELD) return roadDistExact(x, z);
  const fx = (x + WORLD_HALF) / RF_STEP, fz = (z + WORLD_HALF) / RF_STEP;
  let i = fx | 0, j = fz | 0;
  if (i < 0) i = 0; else if (i >= RF_N) i = RF_N - 1;
  if (j < 0) j = 0; else if (j >= RF_N) j = RF_N - 1;
  const tx = fx - i, tz = fz - j, w = RF_N + 1;
  const a = ROAD_FIELD[j * w + i], b = ROAD_FIELD[j * w + i + 1];
  const c = ROAD_FIELD[(j + 1) * w + i], d = ROAD_FIELD[(j + 1) * w + i + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}
/** final ground height including town platforms and road grading */
function groundH(x, z) {
  let h = terrainH(x, z);
  for (let i = 0; i < FLATS.length; i++) {
    const f = FLATS[i];
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r) {
      const t = 1 - smoothstep(f.r * 0.45, f.r, d);
      h = lerp(h, f.h, t);
    }
  }
  const rd = roadDist(x, z);
  if (rd < 13) {
    // roads smooth the terrain toward a locally-averaged height
    const avg = (terrainH(x + 9, z) + terrainH(x - 9, z) + terrainH(x, z + 9) + terrainH(x, z - 9)) * 0.25;
    h = lerp(h, (h + avg) * 0.5, (1 - smoothstep(6, 13, rd)) * 0.85);
  }
  return h;
}
/** surface normal by central differences */
const _n = [0, 0, 0];
function groundN(x, z, out) {
  const e = 1.1;
  const hl = groundH(x - e, z), hr = groundH(x + e, z);
  const hd = groundH(x, z - e), hu = groundH(x, z + e);
  let nx = hl - hr, ny = 2 * e, nz = hd - hu;
  const l = Math.hypot(nx, ny, nz) || 1;
  out = out || _n; out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
  return out;
}
function slopeAt(x, z) { const n = groundN(x, z, _n); return 1 - n[1]; }

/* ------------------------------ BIOME ------------------------------ */
/* Biome comes from the zone grid, softened by moisture/temperature noise so
   borders interlock instead of looking like a chessboard. */
function moistureAt(x, z) { return fbm(x * 0.0017 + 300.1, z * 0.0017 - 120.4, 3) * .5 + .5; }
function tempAt(x, z) { return fbm(x * 0.0013 - 55.5, z * 0.0013 + 210.9, 3) * .5 + .5; }

const _col = [0, 0, 0];
function groundColor(x, z, h, slope, out) {
  const zn = zoneAt(x, z);
  const base = zn ? zn.col : [.4, .55, .3];
  const m = moistureAt(x, z), t = tempAt(x, z);
  let r = base[0], g = base[1], b = base[2];
  // moisture darkens & greens, dryness bleaches
  r = lerp(r * 1.22, r * .72, m); g = lerp(g * .92, g * 1.10, m); b = lerp(b * .82, b * .86, m);
  // temperature: cold -> pale blue-grey
  const cold = 1 - smoothstep(.32, .62, t);
  r = lerp(r, .70, cold * .32); g = lerp(g, .74, cold * .32); b = lerp(b, .80, cold * .38);
  // altitude: rock then snow
  const rock = smoothstep(62, 96, h) * .85 + smoothstep(.30, .62, slope) * .9;
  const rk = clamp(rock, 0, 1);
  r = lerp(r, .40 + fbm(x * .05, z * .05, 2) * .07, rk);
  g = lerp(g, .38 + fbm(x * .05 + 9, z * .05, 2) * .07, rk);
  b = lerp(b, .36, rk);
  const snow = smoothstep(104, 132, h - slope * 22);
  r = lerp(r, .95, snow); g = lerp(g, .96, snow); b = lerp(b, 1.0, snow);
  // beaches
  const beach = (1 - smoothstep(WATER_Y + .3, WATER_Y + 3.4, h)) * smoothstep(WATER_Y - 5.5, WATER_Y, h);
  r = lerp(r, .80, beach); g = lerp(g, .74, beach); b = lerp(b, .55, beach);
  // road
  const rd = roadDist(x, z);
  const road = 1 - smoothstep(3.2, 7.5, rd);
  r = lerp(r, .45, road * .8); g = lerp(g, .40, road * .8); b = lerp(b, .33, road * .8);
  // fine mottling for detail
  const v = fbm(x * .19, z * .19, 2) * .07 + fbm(x * .9, z * .9, 1) * .035;
  out = out || _col;
  out[0] = clamp(r + v, 0, 1); out[1] = clamp(g + v, 0, 1); out[2] = clamp(b + v, 0, 1);
  return out;
}

/* ------------------------------ POINTS OF INTEREST ------------------------------ */
const POI = { hubs: [], camps: [], lairs: [], portals: [], ruins: [], all: [] };
function buildPOI() {
  const rng = new RNG(SEED ^ 0x9091);
  for (const z of DB.zones) {
    const h = groundHRaw(z.hx, z.hz);
    const hub = { k: 'hub', n: z.hub, x: z.hx, y: h, z: z.hz, zone: z.id, r: 46, bld: [] };
    // procedural town layout: ring of buildings around a plaza
    const nb = rng.ri(7, 11);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU + rng.r(-.14, .14);
      const rad = rng.r(24, 42);
      hub.bld.push({
        x: z.hx + Math.cos(a) * rad, z: z.hz + Math.sin(a) * rad,
        w: rng.r(5.5, 9.5), d: rng.r(5.5, 9.5), hgt: rng.r(4.5, 8.5), rot: a + PI / 2 + rng.r(-.3, .3),
        roof: rng.chance(.75) ? 1 : 0, tint: rng.r(.75, 1.05),
      });
    }
    POI.hubs.push(hub);
    addFlat(z.hx, z.hz, 66, h);
    // camps: mob spawn anchors
    for (let i = 0; i < 9; i++) {
      const a = rng.f() * TAU, rad = rng.r(z.r * .25, z.r * .95);
      const cx = clamp(z.cx + Math.cos(a) * rad, -WORLD_HALF + 40, WORLD_HALF - 40);
      const cz = clamp(z.cz + Math.sin(a) * rad, -WORLD_HALF + 40, WORLD_HALF - 40);
      POI.camps.push({ k: 'camp', n: rng.pick(z.mobs) + ' Camp', x: cx, z: cz, zone: z.id, r: 26, fam: rng.i(6) });
    }
    // ruins / landmarks for flavour + explore quests
    for (let i = 0; i < 4; i++) {
      const a = rng.f() * TAU, rad = rng.r(z.r * .3, z.r * .9);
      POI.ruins.push({
        k: 'ruin', n: rng.pick(Q_PLACES), x: z.cx + Math.cos(a) * rad, z: z.cz + Math.sin(a) * rad,
        zone: z.id, r: 16, kind: rng.i(3)
      });
    }
  }
  for (const b of DB.bosses) {
    POI.lairs.push({ k: 'lair', n: b.n + ', ' + b.t, x: b.x, z: b.z2, zone: b.z, r: 22, boss: b.id });
  }
  for (const r of DB.raids) {
    POI.portals.push({ k: 'raid', n: r.n, x: r.x, z: r.zz, zone: r.z, r: 18, raid: r.id });
  }
  POI.all = POI.hubs.concat(POI.camps, POI.lairs, POI.portals, POI.ruins);
  // keep every POI on solid, reachable ground
  for (const p of POI.all) {
    let tries = 0;
    while (tries++ < 24) {
      const h = groundHRaw(p.x, p.z);
      if (h > WATER_Y + 1.6 && slopeRaw(p.x, p.z) < .42) { p.y = h; break; }
      p.x += rng.r(-30, 30); p.z += rng.r(-30, 30);
      p.x = clamp(p.x, -WORLD_HALF + 30, WORLD_HALF - 30);
      p.z = clamp(p.z, -WORLD_HALF + 30, WORLD_HALF - 30);
      p.y = groundHRaw(p.x, p.z);
    }
  }
  // sync boss/raid coords back after relocation
  for (const l of POI.lairs) { const b = DB.bosses[l.boss]; b.x = l.x; b.z2 = l.z; b.y = l.y; }
  for (const p of POI.portals) { const r = DB.raids[p.raid]; r.x = p.x; r.zz = p.z; r.y = p.y; }
}
/* raw variants used *during* POI build, before FLATS exist */
function groundHRaw(x, z) { return terrainH(x, z); }
function slopeRaw(x, z) {
  const e = 1.4;
  const nx = terrainH(x - e, z) - terrainH(x + e, z);
  const nz = terrainH(x, z - e) - terrainH(x, z + e);
  const l = Math.hypot(nx, 2 * e, nz) || 1;
  return 1 - (2 * e) / l;
}
function nearestPOI(x, z, kind, maxD) {
  let best = null, bd = (maxD || 1e9) ** 2;
  const src = kind ? POI[kind] : POI.all;
  for (let i = 0; i < src.length; i++) {
    const p = src[i]; const d = V.dist2(x, z, p.x, p.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/* ------------------------------ PROP SCATTER ------------------------------ */
/* Chunked, deterministic, cached. Each chunk yields trees, rocks and bushes
   placed by biome density with slope/water rejection. Also used for physics. */
const PROP_CACHE = new Map();
const TREE_KINDS = 5;
function chunkKey(cx, cz) { return cx * 4096 + cz; }
function getChunkProps(cx, cz) {
  const k = chunkKey(cx, cz);
  let c = PROP_CACHE.get(k);
  if (c) return c;
  const rng = new RNG((cx * 73856093) ^ (cz * 19349663) ^ SEED);
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const trees = [], rocks = [], bushes = [];
  const midX = ox + CHUNK / 2, midZ = oz + CHUNK / 2;
  const zn = zoneAt(midX, midZ);
  const biome = zn ? zn.biome : 'meadow';
  const dens = { meadow: .5, forest: 1.5, swamp: .8, plains: .25, desert: .12, tundra: .3,
    highland: .35, darkforest: 1.7, volcanic: .2, coast: .3, corrupt: .45 }[biome] || .5;
  const n = Math.round(26 * dens);
  for (let i = 0; i < n; i++) {
    const x = ox + rng.f() * CHUNK, z = oz + rng.f() * CHUNK;
    const h = groundH(x, z);
    if (h < WATER_Y + 1.2 || h > 118) continue;
    if (slopeAt(x, z) > .38) continue;
    if (roadDist(x, z) < 7) continue;
    let skip = false;
    for (const f of FLATS) { if (Math.hypot(x - f.x, z - f.z) < f.r * .8) { skip = true; break; } }
    if (skip) continue;
    const kind = biome === 'volcanic' || biome === 'corrupt' ? 4
      : biome === 'tundra' ? 3
        : biome === 'desert' ? 2
          : biome === 'darkforest' ? 1 : (rng.chance(.25) ? 1 : 0);
    const s = rng.r(.75, 1.5) * (biome === 'darkforest' ? 1.25 : 1);
    trees.push({ x, y: h, z, s, r: rng.f() * TAU, k: kind, rad: 1.05 * s });
  }
  const nr = Math.round(9 + rng.f() * 9);
  for (let i = 0; i < nr; i++) {
    const x = ox + rng.f() * CHUNK, z = oz + rng.f() * CHUNK;
    const h = groundH(x, z);
    if (h < WATER_Y - 1.5) continue;
    if (roadDist(x, z) < 5) continue;
    const s = rng.r(.5, 2.4);
    rocks.push({ x, y: h, z, s, r: rng.f() * TAU, rad: s * 0.9, sq: rng.r(.6, 1.3) });
  }
  const nb = Math.round(20 * dens + 6);
  for (let i = 0; i < nb; i++) {
    const x = ox + rng.f() * CHUNK, z = oz + rng.f() * CHUNK;
    const h = groundH(x, z);
    if (h < WATER_Y + .6 || slopeAt(x, z) > .5) continue;
    bushes.push({ x, y: h, z, s: rng.r(.5, 1.3), r: rng.f() * TAU, k: rng.i(2) });
  }
  c = { trees, rocks, bushes, cx, cz };
  PROP_CACHE.set(k, c);
  if (PROP_CACHE.size > 1400) { // bound memory: drop the oldest entries
    const it = PROP_CACHE.keys();
    for (let i = 0; i < 300; i++) { const kk = it.next().value; PROP_CACHE.delete(kk); }
  }
  return c;
}
/** Push a capsule out of nearby tree trunks / boulders. Returns [x,z]. */
const _res = [0, 0];
function resolveProps(x, z, radius) {
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  let ox = x, oz = z;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const c = getChunkProps(cx + i, cz + j);
    for (let t = 0; t < c.trees.length; t++) {
      const p = c.trees[t], rr = radius + p.rad * .42;
      const dx = ox - p.x, dz = oz - p.z; const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = (rr - d); ox += dx / d * push; oz += dz / d * push; }
    }
    for (let t = 0; t < c.rocks.length; t++) {
      const p = c.rocks[t]; if (p.s < .9) continue;
      const rr = radius + p.rad * .8;
      const dx = ox - p.x, dz = oz - p.z; const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = (rr - d); ox += dx / d * push; oz += dz / d * push; }
    }
  }
  _res[0] = ox; _res[1] = oz; return _res;
}
/** Town buildings are solid too. */
function resolveBuildings(x, z, radius) {
  let ox = x, oz = z;
  for (const hub of POI.hubs) {
    if (V.dist2(x, z, hub.x, hub.z) > 90 * 90) continue;
    for (const b of hub.bld) {
      const rr = radius + Math.max(b.w, b.d) * .52;
      const dx = ox - b.x, dz = oz - b.z, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = rr - d; ox += dx / d * push; oz += dz / d * push; }
    }
  }
  _res[0] = ox; _res[1] = oz; return _res;
}

/* ------------------------------ NAVIGATION ------------------------------ */
/* Cheap steering-based navigation: walk toward the goal, sidestep when the
   ground ahead is too steep or underwater. Good enough to look purposeful. */
function navStep(x, z, tx, tz, out, allowWater) {
  let dx = tx - x, dz = tz - z;
  const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  const probe = 4.2;
  const hHere = groundH(x, z);
  const wet = h => !allowWater && h < WATER_Y - .4 && hHere > WATER_Y;
  const hAhead = groundH(x + dx * probe, z + dz * probe);
  if ((hAhead - hHere > 3.1) || wet(hAhead)) {
    // fan out until something is passable; give up and go straight if nothing is
    for (let a = 0.5; a <= 2.6; a += 0.5) {
      for (const s of [1, -1]) {
        const ca = Math.cos(a * s), sa = Math.sin(a * s);
        const nx = dx * ca - dz * sa, nz = dx * sa + dz * ca;
        const hh = groundH(x + nx * probe, z + nz * probe);
        if (hh - hHere <= 3.1 && !wet(hh)) { out[0] = nx; out[1] = nz; return out; }
      }
    }
  }
  out[0] = dx; out[1] = dz; return out;
}

/* ------------------------------ DAY / NIGHT ------------------------------ */
const DAY_LEN = 22 * 60;          // seconds for a full in-game day
function sunDir(tod, out) {
  // tod: 0..1 (0 = midnight)
  const a = (tod - 0.25) * TAU;
  const el = Math.sin(a), az = Math.cos(a);
  const y = el, x = az * 0.72, z = az * 0.42 + 0.30;
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}
function skyColors(tod) {
  // returns {top, hor, sun, amb, fog, sunI}
  const day = smoothstep(.22, .30, tod) * (1 - smoothstep(.72, .80, tod));
  const dawn = Math.max(0, 1 - Math.abs(tod - .25) * 14);
  const dusk = Math.max(0, 1 - Math.abs(tod - .76) * 14);
  const night = 1 - day;
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  let top = mixc([.055, .075, .17], [.16, .38, .74], day);
  let hor = mixc([.10, .12, .23], [.62, .78, .95], day);
  let sun = mixc([.52, .58, .82], [1.0, .96, .86], day);
  top = mixc(top, [.24, .16, .34], dawn * .8); hor = mixc(hor, [.95, .55, .32], dawn * .9);
  top = mixc(top, [.20, .12, .30], dusk * .8); hor = mixc(hor, [.98, .46, .26], dusk * .9);
  sun = mixc(sun, [1.0, .62, .34], Math.max(dawn, dusk) * .9);
  // nights are moonlit, not pitch black — the game has to stay playable
  const amb = [lerp(.21, .40, day), lerp(.24, .43, day), lerp(.36, .50, day)];
  const fog = mixc([.09, .11, .19], [.66, .76, .89], day);
  return { top, hor, sun, amb, fog, sunI: lerp(.34, 1.0, day), night };
}
