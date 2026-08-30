/* =========================================================================
   IDLE QUEST — 06 SCENE
   Geometry generation, streamed terrain, the humanoid rig with procedural
   animation, grass fields, particles, and the frame render pipeline.
   ========================================================================= */

/* ------------------------------ MESH BUILDERS ------------------------------ */
/* All meshes are interleaved [px,py,pz, nx,ny,nz] with Uint16 indices. */
function meshFromFaces(pos, nrm, idx) {
  const v = new Float32Array(pos.length * 2);
  for (let i = 0, j = 0; i < pos.length; i += 3) {
    v[j++] = pos[i]; v[j++] = pos[i + 1]; v[j++] = pos[i + 2];
    v[j++] = nrm[i]; v[j++] = nrm[i + 1]; v[j++] = nrm[i + 2];
  }
  return { v, i: new Uint16Array(idx) };
}
/** Rounded box (superellipsoid-ish): the workhorse for bodies and gear. */
function meshRoundBox(seg, round) {
  seg = seg || 6; round = round == null ? 0.34 : round;
  const pos = [], nrm = [], idx = [];
  // build a sphere, then push points toward the cube surface
  for (let j = 0; j <= seg; j++) {
    const v = j / seg, phi = v * PI;
    for (let i = 0; i <= seg * 2; i++) {
      const u = i / (seg * 2), th = u * TAU;
      let x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
      const m = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) || 1;
      const cx = x / m, cy = y / m, cz = z / m;                    // cube projection
      const px = lerp(cx, x, round), py = lerp(cy, y, round), pz = lerp(cz, z, round);
      pos.push(px * .5, py * .5, pz * .5);
      const l = Math.hypot(px, py, pz) || 1;
      // blend cube normal and sphere normal for a soft-edged look
      const nxv = lerp(Math.abs(cx) >= .999 ? sign(cx) : 0, px / l, round + .3);
      const nyv = lerp(Math.abs(cy) >= .999 ? sign(cy) : 0, py / l, round + .3);
      const nzv = lerp(Math.abs(cz) >= .999 ? sign(cz) : 0, pz / l, round + .3);
      const nl = Math.hypot(nxv, nyv, nzv) || 1;
      nrm.push(nxv / nl, nyv / nl, nzv / nl);
    }
  }
  const W = seg * 2 + 1;
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg * 2; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return meshFromFaces(pos, nrm, idx);
}
function meshCylinder(seg, taper) {
  seg = seg || 8; taper = taper == null ? .7 : taper;
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * .5, 0, s * .5); nrm.push(c, .15, s);
    pos.push(c * .5 * taper, 1, s * .5 * taper); nrm.push(c, .15, s);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  // top cap
  const base = pos.length / 3;
  pos.push(0, 1, 0); nrm.push(0, 1, 0);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU;
    pos.push(Math.cos(a) * .5 * taper, 1, Math.sin(a) * .5 * taper); nrm.push(0, 1, 0);
  }
  for (let i = 0; i < seg; i++) idx.push(base, base + 1 + i, base + 2 + i);
  return meshFromFaces(pos, nrm, idx);
}
function meshCone(seg) {
  seg = seg || 8;
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * .5, 0, s * .5); nrm.push(c * .82, .55, s * .82);
    pos.push(0, 1, 0); nrm.push(c * .4, .9, s * .4);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1); }
  const base = pos.length / 3;
  pos.push(0, 0, 0); nrm.push(0, -1, 0);
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * TAU; pos.push(Math.cos(a) * .5, 0, Math.sin(a) * .5); nrm.push(0, -1, 0); }
  for (let i = 0; i < seg; i++) idx.push(base, base + 2 + i, base + 1 + i);
  return meshFromFaces(pos, nrm, idx);
}
function meshSphere(lat, lon) {
  lat = lat || 8; lon = lon || 12;
  const pos = [], nrm = [], idx = [];
  for (let j = 0; j <= lat; j++) {
    const phi = (j / lat) * PI;
    for (let i = 0; i <= lon; i++) {
      const th = (i / lon) * TAU;
      const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
      pos.push(x * .5, y * .5, z * .5); nrm.push(x, y, z);
    }
  }
  for (let j = 0; j < lat; j++) for (let i = 0; i < lon; i++) {
    const a = j * (lon + 1) + i, b = a + 1, c = a + lon + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return meshFromFaces(pos, nrm, idx);
}
function meshBox() {
  const p = [], n = [], idx = [];
  const F = [
    [[0, 0, 1], [-.5, -.5, .5, .5, -.5, .5, .5, .5, .5, -.5, .5, .5]],
    [[0, 0, -1], [.5, -.5, -.5, -.5, -.5, -.5, -.5, .5, -.5, .5, .5, -.5]],
    [[1, 0, 0], [.5, -.5, .5, .5, -.5, -.5, .5, .5, -.5, .5, .5, .5]],
    [[-1, 0, 0], [-.5, -.5, -.5, -.5, -.5, .5, -.5, .5, .5, -.5, .5, -.5]],
    [[0, 1, 0], [-.5, .5, .5, .5, .5, .5, .5, .5, -.5, -.5, .5, -.5]],
    [[0, -1, 0], [-.5, -.5, -.5, .5, -.5, -.5, .5, -.5, .5, -.5, -.5, .5]],
  ];
  let b = 0;
  for (const [nn, vv] of F) {
    for (let i = 0; i < 4; i++) { p.push(vv[i * 3], vv[i * 3 + 1], vv[i * 3 + 2]); n.push(nn[0], nn[1], nn[2]); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3); b += 4;
  }
  return meshFromFaces(p, n, idx);
}
function meshPyramid() {
  const p = [], n = [], idx = [];
  const corners = [[-.5, 0, -.5], [.5, 0, -.5], [.5, 0, .5], [-.5, 0, .5]];
  let b = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], c = corners[(i + 1) % 4];
    const mx = (a[0] + c[0]) * .5, mz = (a[2] + c[2]) * .5;
    const l = Math.hypot(mx, .38, mz) || 1;
    p.push(a[0], a[1], a[2], c[0], c[1], c[2], 0, 1, 0);
    for (let k = 0; k < 3; k++) n.push(mx / l, .55, mz / l);
    idx.push(b, b + 1, b + 2); b += 3;
  }
  p.push(-.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5);
  for (let k = 0; k < 4; k++) n.push(0, -1, 0);
  idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  return meshFromFaces(p, n, idx);
}

/* ------------------------------ MESH REGISTRY ------------------------------ */
const M = {};      // instanced batch registry
const GLX = {};     // non-batched GL objects (grass + particle buffers)
const INST_MAX = { rbox: 5200, plate: 4200, box: 2600, cyl: 3200, cone: 5200, sph: 5200, pyr: 700 };
function buildMeshes() {
  const mk = (m, cap) => makeInstMesh(m.v, m.i, cap);
  M.rbox = mk(meshRoundBox(7, .30), INST_MAX.rbox);
  /* Armour needs an edge. The soft 0.30-radius box reads as cloth at any size, which is
     why a full Mythic set looked like a jumper -- plate gets a tight bevel and more
     segments so the highlight runs along a crease instead of smearing across a blob. */
  M.plate = mk(meshRoundBox(9, .10), INST_MAX.plate);
  M.box = mk(meshBox(), INST_MAX.box);
  M.cyl = mk(meshCylinder(8, .62), INST_MAX.cyl);
  M.cone = mk(meshCone(9), INST_MAX.cone);
  M.sph = mk(meshSphere(7, 10), INST_MAX.sph);
  M.pyr = mk(meshPyramid(), INST_MAX.pyr);
  for (const k in M) { M[k].buf = new Float32Array(M[k].maxInst * 24); M[k].n = 0; }
  buildGrassMesh(); buildPartMesh();
}
function resetBatches() { for (const k in M) M[k].n = 0; }
const _m = new Float32Array(16);
function pushInst(mesh, mat, r, g, b, emis, wind, rough, alpha) {
  if (mesh.n >= mesh.maxInst) return;
  const o = mesh.n * 24, buf = mesh.buf;
  for (let i = 0; i < 16; i++) buf[o + i] = mat[i];
  buf[o + 16] = r; buf[o + 17] = g; buf[o + 18] = b; buf[o + 19] = 1;
  buf[o + 20] = emis || 0; buf[o + 21] = wind || 0; buf[o + 22] = rough == null ? .8 : rough; buf[o + 23] = alpha == null ? 1 : alpha;
  mesh.n++;
}

/* ------------------------------ GRASS ------------------------------ */
const GRASS_CACHE = new Map();
let grassBuildQueue = [];
function buildGrassMesh() {
  const gl = R.gl;
  GLX.grassQuad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, GLX.grassQuad);
  // a 2-triangle blade, slightly tapered by using x scaled at the top
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -.5, 0, 0, .5, 0, 0, .16, 1, 0,
    -.5, 0, 0, .16, 1, 0, -.16, 1, 0,
  ]), gl.STATIC_DRAW);
}
const GCELL = 24;                     // grass is diced finer than prop chunks
function grassKey(cx, cz) { return (cx + 2048) * 8192 + (cz + 2048); }
function grassForCell(cx, cz) {
  const key = grassKey(cx, cz);
  let g = GRASS_CACHE.get(key);
  if (g !== undefined) return g;
  const gl = R.gl;
  const per = R.quality >= 2 ? 1150 : R.quality === 1 ? 520 : 0;
  if (per === 0) { GRASS_CACHE.set(key, null); return null; }
  const rng = new RNG((cx * 83492791) ^ (cz * 12582917) ^ 0x6a51);
  const ox = cx * GCELL, oz = cz * GCELL;
  const zn = zoneAt(ox + GCELL / 2, oz + GCELL / 2);
  const biome = zn ? zn.biome : 'meadow';
  const dens = { meadow: 1, forest: .8, swamp: .75, plains: .9, desert: 0, tundra: .35,
    highland: .6, darkforest: .55, volcanic: 0, coast: .5, corrupt: .4 }[biome];
  if (!dens) { GRASS_CACHE.set(key, null); return null; }
  const want = Math.round(per * dens);
  const data = new Float32Array(want * 8);
  let n = 0;
  const bc = zn ? zn.col : [.4, .6, .3];
  // only worth testing buildings when this cell is actually near a town
  let nearTown = false;
  for (const hub of POI.hubs) {
    if (V.dist2(ox + GCELL / 2, oz + GCELL / 2, hub.x, hub.z) < 110 * 110) { nearTown = true; break; }
  }
  for (let i = 0; i < want; i++) {
    const x = ox + rng.f() * GCELL, z = oz + rng.f() * GCELL;
    const h = groundH(x, z);
    if (h < WATER_Y + .4 || h > 108) continue;
    if (slopeAt(x, z) > .40) continue;
    if (nearTown && insideBuildingXZ(x, z, 0.2)) continue;      // no lawns indoors
    const o = n * 8;
    data[o] = x; data[o + 1] = h - .04; data[o + 2] = z;
    data[o + 3] = rng.r(.085, .155);                // half-width; height = 3.4x
    const v = rng.r(.62, 1.18);
    data[o + 4] = clamp(bc[0] * v * 1.10, 0, 1);
    data[o + 5] = clamp(bc[1] * v * 1.02, 0, 1);
    data[o + 6] = clamp(bc[2] * v * .84, 0, 1);
    data[o + 7] = rng.f();
    n++;
  }
  if (n === 0) { GRASS_CACHE.set(key, null); return null; }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, GLX.grassQuad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib);
  gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * 8), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
  g = { vao, ib, n, cx, cz };
  GRASS_CACHE.set(key, g);
  if (GRASS_CACHE.size > 420) {
    const it = GRASS_CACHE.keys();
    for (let i = 0; i < 90; i++) {
      const kk = it.next().value; const old = GRASS_CACHE.get(kk);
      if (old) { gl.deleteVertexArray(old.vao); gl.deleteBuffer(old.ib); }
      GRASS_CACHE.delete(kk);
    }
  }
  return g;
}

/* ------------------------------ PARTICLES ------------------------------ */
const PART = { n: 0, cap: 1400, px: null, py: null, pz: null, vx: null, vy: null, vz: null,
  life: null, max: null, size: null, r: null, g: null, b: null, a: null, kind: null, rot: null, spin: null, grav: null };
function initParticles() {
  const c = PART.cap;
  for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'life', 'max', 'size', 'r', 'g', 'b', 'a', 'kind', 'rot', 'spin', 'grav'])
    PART[k] = new Float32Array(c);
  PART.data = new Float32Array(c * 12);
}
function buildPartMesh() {
  const gl = R.gl;
  GLX.partQuad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, GLX.partQuad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, .5, .5, -.5, -.5, .5, .5, -.5, .5]), gl.STATIC_DRAW);
  GLX.partVAO = gl.createVertexArray(); gl.bindVertexArray(GLX.partVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, GLX.partQuad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  GLX.partInst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, GLX.partInst);
  gl.bufferData(gl.ARRAY_BUFFER, PART.cap * 12 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 48, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 48, 16); gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 48, 32); gl.vertexAttribDivisor(3, 1);
  gl.bindVertexArray(null);
}
function spawnPart(x, y, z, vx, vy, vz, life, size, r, g, b, a, kind, grav, spin) {
  let i = PART.n;
  if (i >= PART.cap) {
    // rotate through every slot: the old (frame*7) % cap could only ever touch
    // the 200 slots divisible by 7, so a full pool froze most particles solid
    PART.cur = ((PART.cur || 0) + 1) % PART.cap;
    i = PART.cur;
  } else PART.n++;
  PART.px[i] = x; PART.py[i] = y; PART.pz[i] = z;
  PART.vx[i] = vx; PART.vy[i] = vy; PART.vz[i] = vz;
  PART.life[i] = life; PART.max[i] = life; PART.size[i] = size;
  PART.r[i] = r; PART.g[i] = g; PART.b[i] = b; PART.a[i] = a == null ? 1 : a;
  PART.kind[i] = kind || 0; PART.grav[i] = grav == null ? -8 : grav;
  PART.rot[i] = Math.random() * TAU; PART.spin[i] = spin == null ? (Math.random() - .5) * 4 : spin;
}
function burst(x, y, z, n, spread, up, size, r, g, b, kind, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, e = Math.random();
    spawnPart(x, y, z,
      Math.cos(a) * spread * e, up * (.4 + Math.random()), Math.sin(a) * spread * e,
      (life || .7) * (.6 + Math.random() * .7), size * (.6 + Math.random() * .8),
      r, g, b, 1, kind || 0, -9, (Math.random() - .5) * 7);
  }
}
function updateParticles(dt) {
  let live = 0;
  for (let i = 0; i < PART.n; i++) {
    if (PART.life[i] <= 0) continue;
    PART.life[i] -= dt;
    if (PART.life[i] <= 0) continue;
    PART.vy[i] += PART.grav[i] * dt;
    PART.px[i] += PART.vx[i] * dt; PART.py[i] += PART.vy[i] * dt; PART.pz[i] += PART.vz[i] * dt;
    PART.vx[i] *= 1 - 1.6 * dt; PART.vz[i] *= 1 - 1.6 * dt;
    PART.rot[i] += PART.spin[i] * dt;
    live++;
  }
  // compact occasionally so the array does not stay sparse
  if (PART.n > 0 && (R.frame & 31) === 0) {
    let w = 0;
    for (let i = 0; i < PART.n; i++) {
      if (PART.life[i] <= 0) continue;
      if (w !== i) for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'life', 'max', 'size', 'r', 'g', 'b', 'a', 'kind', 'rot', 'spin', 'grav']) PART[k][w] = PART[k][i];
      w++;
    }
    PART.n = w;
  }
  return live;
}
function drawParticles() {
  const gl = R.gl;
  let n = 0; const d = PART.data;
  for (let i = 0; i < PART.n; i++) {
    if (PART.life[i] <= 0) continue;
    const t = PART.life[i] / PART.max[i];
    const o = n * 12;
    d[o] = PART.px[i]; d[o + 1] = PART.py[i]; d[o + 2] = PART.pz[i];
    d[o + 3] = PART.size[i] * (PART.kind[i] === 2 ? (2.2 - t * 1.6) : (0.35 + t * 0.85));
    d[o + 4] = PART.r[i]; d[o + 5] = PART.g[i]; d[o + 6] = PART.b[i];
    d[o + 7] = PART.a[i] * (t > .75 ? (1 - t) * 4 : t / .75);
    d[o + 8] = PART.rot[i]; d[o + 9] = PART.kind[i]; d[o + 10] = 0; d[o + 11] = 0;
    n++;
    if (n >= PART.cap) break;
  }
  if (!n) return;
  const pr = R.prog.part; gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uVP, false, R.vp);
  gl.uniform3fv(pr.u.uCamR, R.camRight);
  gl.uniform3fv(pr.u.uCamU, R.camUp);
  gl.bindVertexArray(GLX.partVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, GLX.partInst);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * 12);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
  R.drawCalls++;
  gl.depthMask(true); gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}

/* ------------------------------ TERRAIN STREAMING ------------------------------ */
const TCHUNK = 150;
const TERRAIN = new Map();
let terrainQueue = [];
function terrainKey(cx, cz) { return cx * 4096 + cz; }
function buildTerrainChunk(cx, cz, res) {
  const gl = R.gl;
  const ox = cx * TCHUNK, oz = cz * TCHUNK;
  const n = res, step = TCHUNK / n;
  const stride = 9;
  const verts = new Float32Array((n + 1) * (n + 1) * stride);
  const col = [0, 0, 0], nrm = [0, 0, 0];
  let minY = 1e9, maxY = -1e9, p = 0;
  for (let j = 0; j <= n; j++) {
    const z = oz + j * step;
    for (let i = 0; i <= n; i++) {
      const x = ox + i * step;
      const h = groundH(x, z);
      groundN(x, z, nrm);
      const sl = 1 - nrm[1];
      groundColor(x, z, h, sl, col);
      verts[p] = x; verts[p + 1] = h; verts[p + 2] = z;
      verts[p + 3] = nrm[0]; verts[p + 4] = nrm[1]; verts[p + 5] = nrm[2];
      verts[p + 6] = col[0]; verts[p + 7] = col[1]; verts[p + 8] = col[2];
      p += stride;
      if (h < minY) minY = h; if (h > maxY) maxY = h;
    }
  }
  const idx = new Uint32Array(n * n * 6);
  let q = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, vb, ib, count: idx.length, cx, cz, res, minY, maxY, ox, oz, used: R.frame };
}
function freeTerrainChunk(c) {
  const gl = R.gl;
  gl.deleteVertexArray(c.vao); gl.deleteBuffer(c.vb); gl.deleteBuffer(c.ib);
}
function terrainResFor(d) {
  if (R.quality === 0) return d < 200 ? 16 : 8;
  if (R.quality === 1) return d < 200 ? 24 : d < 420 ? 12 : 8;
  return d < 190 ? 34 : d < 400 ? 18 : 10;
}

/* ------------------------------ FRUSTUM ------------------------------ */
const FR = new Float32Array(24);
function extractFrustum(m) {
  const set = (i, a, b, c, d) => {
    const l = Math.hypot(a, b, c) || 1;
    FR[i] = a / l; FR[i + 1] = b / l; FR[i + 2] = c / l; FR[i + 3] = d / l;
  };
  set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
  set(4, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
  set(8, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
  set(12, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
  set(16, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
  set(20, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
}
function sphereInFrustum(x, y, z, r) {
  for (let i = 0; i < 24; i += 4) {
    if (FR[i] * x + FR[i + 1] * y + FR[i + 2] * z + FR[i + 3] < -r) return false;
  }
  return true;
}

/* ------------------------------ CHARACTER RIG ------------------------------ */
/* A 16-part rig assembled from rounded boxes. Poses are computed procedurally
   from a small animation state so a hundred adventurers can be on screen. */
const SKIN = [[.86, .68, .55], [.72, .53, .40], [.52, .37, .28], [.38, .26, .20], [.92, .78, .66], [.62, .48, .42]];
const HAIRC = [[.16, .12, .10], [.36, .22, .12], [.72, .58, .30], [.55, .18, .10], [.85, .85, .88], [.25, .18, .30]];
const _cm = new Float32Array(16);
function partMat(out, ox, oy, oz, rx, ry, rz, sx, sy, sz, baseX, baseY, baseZ, bodyY) {
  // rotate offset by body yaw then translate
  const c = Math.cos(bodyY), s = Math.sin(bodyY);
  const wx = ox * c + oz * s, wz = -ox * s + oz * c;
  M4.trs(out, baseX + wx, baseY + oy, baseZ + wz, rx, ry + bodyY, rz, sx, sy, sz);
  return out;
}
/** Push all instances for one humanoid. `e` needs x,y,z,yaw,anim{...},look. */
function drawCharacter(e, lod) {
  const a = e.an;
  const sc = e.scale || 1;
  const bx = e.x, by = e.y, bz = e.z, yaw = e.yaw;
  const t = a.t;
  const spd = a.spd;                      // 0..1 walk blend
  const run = a.run;                      // extra for sprint
  const dead = a.dead;
  const atk = a.atk;                      // 0..1 attack swing
  const cast = a.cast;                    // 0..1 cast pose
  const air = a.air;
  const sk = SKIN[e.skin % SKIN.length], hc = HAIRC[e.hair % HAIRC.length];
  const gc = e.gearCol || [.42, .40, .38];
  const gc2 = e.gearCol2 || [.30, .28, .27];
  const trim = e.trim || e.accent || [.7, .2, .2];
  const cloth = e.cloth || [.30, .25, .20];
  const glow = e.glow || 0;
  const gr = e.glowCol || [1, .6, .2];
  const RG = e.rough == null ? .78 : e.rough;      // polish rises with tier
  const tierN = e.tierN == null ? -1 : e.tierN;
  // a little self-illumination keeps silhouettes readable in deep shade
  const fill = (e.fill || 0) + (R.sky ? R.sky.night * 0.10 : 0);
  // the trim glows on the best gear, which is what sells a set across a field
  const tg = tierN >= 6 ? .55 : tierN >= 5 ? .38 : tierN >= 4 ? .18 : tierN >= 3 ? .07 : 0;
  const P = M.plate, RB = M.rbox;

  const swing = Math.sin(t * 9.0) * spd;
  const swing2 = Math.sin(t * 9.0 + PI) * spd;
  const breathe = Math.sin(t * 1.5) * 0.010 * (1 - spd);
  const bob = (Math.abs(Math.sin(t * 9.0)) * 0.055 + Math.sin(t * 1.6) * 0.012) * (0.4 + spd) * sc;
  let lean = spd * 0.12 + run * 0.16;
  let rootY = by + bob;
  let bodyPitch = lean;
  if (dead) { bodyPitch = 1.45; rootY = by + 0.22 * sc; }
  else if (air) { bodyPitch = -0.12; }

  const S = sc;
  const hipY = rootY + 0.92 * S;
  const torsoR = bodyPitch + (cast ? -0.12 : 0) + Math.sin(t * 1.9) * 0.012;
  const chestY = hipY - rootY + 0.30 * S;

  // --- torso: an under-layer of cloth, then the breastplate proud of it ---
  partMat(_cm, 0, chestY, 0, torsoR, 0, 0, 0.50 * S, (0.62 + breathe) * S, 0.30 * S, bx, rootY, bz, yaw);
  pushInst(RB, _cm, cloth[0], cloth[1], cloth[2], fill, 0, .85);
  partMat(_cm, 0, chestY + 0.02 * S, 0.015 * S, torsoR, 0, 0, 0.53 * S, 0.50 * S, 0.33 * S, bx, rootY, bz, yaw);
  pushInst(P, _cm, gc[0], gc[1], gc[2], fill, 0, RG);
  // --- pelvis ---
  partMat(_cm, 0, hipY - rootY - 0.06 * S, 0, torsoR * .5, 0, 0, 0.42 * S, 0.26 * S, 0.29 * S, bx, rootY, bz, yaw);
  pushInst(P, _cm, gc2[0], gc2[1], gc2[2], fill, 0, RG + .08);
  // --- head ---
  const headY = hipY - rootY + 0.74 * S;
  const hy = (e.headYaw || 0);
  const hR = torsoR * .3 + (dead ? .3 : 0);
  if (e.helm) {
    /* A helm ENCLOSES the head. It used to be a cap perched on top, leaving a pale
       skin blob as the brightest thing in the silhouette -- a full Mythic set read as
       a bald man in a hat. Now the skull is armoured and only a face gap shows. */
    partMat(_cm, 0, headY + 0.02 * S, 0, hR, hy, 0, 0.33 * S, 0.36 * S, 0.32 * S, bx, rootY, bz, yaw);
    pushInst(P, _cm, gc[0] * 1.06, gc[1] * 1.06, gc[2] * 1.06, fill, 0, RG);
    // the face gap, in shadow
    partMat(_cm, 0, headY - 0.01 * S, 0.19 * S, hR, hy, 0, 0.18 * S, 0.14 * S, 0.10 * S, bx, rootY, bz, yaw);
    pushInst(RB, _cm, sk[0] * .40, sk[1] * .36, sk[2] * .34, fill, 0, .95);
  } else {
    partMat(_cm, 0, headY, 0.02 * S, hR, hy, 0, 0.29 * S, 0.31 * S, 0.28 * S, bx, rootY, bz, yaw);
    pushInst(RB, _cm, sk[0], sk[1], sk[2], fill, 0, .92);
    partMat(_cm, 0, headY + 0.11 * S, -0.02 * S, hR, hy, 0, 0.32 * S, 0.20 * S, 0.31 * S, bx, rootY, bz, yaw);
    pushInst(RB, _cm, hc[0], hc[1], hc[2], fill, 0, .9);
  }
  if (lod > 0) return;   // distant characters stop here

  /* ---- the detail pass: everything below only draws up close ---- */

  // helm brow band and crest -- what makes a good helm read as a good helm
  if (e.helm) {
    partMat(_cm, 0, headY + 0.11 * S, 0.17 * S, torsoR * .3, hy, 0, 0.34 * S, 0.06 * S, 0.07 * S, bx, rootY, bz, yaw);
    pushInst(P, _cm, trim[0], trim[1], trim[2], tg, 0, RG * .6);
    if (e.crest) {
      const ch = 0.09 + e.crest * 0.042;
      for (let k = 0; k < 3; k++) {
        const f = k / 2;
        partMat(_cm, 0, headY + 0.20 * S + (ch * (0.5 + f * 0.8)) * S, (-0.04 - f * 0.13) * S,
          torsoR * .3 - .12 - f * .5, hy, 0, 0.035 * S, ch * (1 - f * .3) * S, (0.13 - f * .03) * S,
          bx, rootY, bz, yaw);
        pushInst(P, _cm, trim[0] * (1 - f * .2), trim[1] * (1 - f * .2), trim[2] * (1 - f * .2), tg * .7, 0, .5);
      }
    }
  }
  // gorget: the collar that separates a head from a torso
  partMat(_cm, 0, headY - 0.20 * S, 0, torsoR * .4, hy * .4, 0, 0.26 * S, 0.10 * S, 0.25 * S, bx, rootY, bz, yaw);
  pushInst(P, _cm, gc[0] * .84, gc[1] * .84, gc[2] * .84, fill, 0, RG);
  // chest trim and belt
  partMat(_cm, 0, chestY + 0.12 * S, 0.17 * S, torsoR, 0, 0, 0.20 * S, 0.20 * S, 0.05 * S, bx, rootY, bz, yaw);
  pushInst(P, _cm, trim[0], trim[1], trim[2], tg, 0, RG * .5);
  if (e.belt) {
    partMat(_cm, 0, hipY - rootY + 0.04 * S, 0, torsoR * .7, 0, 0, 0.47 * S, 0.10 * S, 0.31 * S, bx, rootY, bz, yaw);
    pushInst(P, _cm, gc2[0] * .8, gc2[1] * .8, gc2[2] * .85, fill, 0, RG + .1);
    partMat(_cm, 0, hipY - rootY + 0.04 * S, 0.16 * S, torsoR * .7, 0, 0, 0.11 * S, 0.11 * S, 0.05 * S, bx, rootY, bz, yaw);
    pushInst(P, _cm, trim[0], trim[1], trim[2], tg, 0, RG * .5);
  }

  // --- shoulders ---
  if (e.pads) {
    for (const s of [-1, 1]) {
      partMat(_cm, s * 0.35 * S, hipY - rootY + 0.56 * S, 0, torsoR, 0, s * 0.30, 0.28 * S, 0.22 * S, 0.30 * S, bx, rootY, bz, yaw);
      pushInst(P, _cm, gc[0] * 1.05, gc[1] * 1.05, gc[2] * 1.05, fill, 0, RG);
      partMat(_cm, s * 0.37 * S, hipY - rootY + 0.64 * S, 0, torsoR, 0, s * 0.30, 0.24 * S, 0.06 * S, 0.26 * S, bx, rootY, bz, yaw);
      pushInst(P, _cm, trim[0], trim[1], trim[2], tg, 0, RG * .5);
      if (e.spikes) for (const k of [-1, 0, 1]) {
        partMat(_cm, s * 0.40 * S, hipY - rootY + 0.72 * S, k * 0.11 * S, torsoR - .2, 0, s * 0.42, 0.05 * S, 0.17 * S, 0.05 * S, bx, rootY, bz, yaw);
        pushInst(M.cone, _cm, trim[0], trim[1], trim[2], tg, 0, .35);
      }
    }
  }

  // --- arms ---
  const atkSwing = atk > 0 ? Math.sin(atk * PI) : 0;
  for (const s of [-1, 1]) {
    const isMain = s > 0;
    let sh = (s > 0 ? swing : swing2) * 0.85;
    let upR = sh * 0.9 + torsoR * .4;
    let foreR = -0.35 - Math.abs(sh) * 0.35;
    if (cast > 0) { upR = -1.15 * cast + sh * .2; foreR = -0.9 * cast; }
    if (atkSwing > 0 && isMain) { upR = -1.7 * atkSwing + 0.55; foreR = -0.5 + atkSwing * 0.4; }
    if (dead) { upR = 1.2; foreR = -0.2; }
    const shX = s * 0.42 * S, shY = hipY - rootY + 0.52 * S;
    partMat(_cm, shX, shY - 0.16 * S, Math.sin(upR) * 0.14 * S, upR, 0, s * 0.14, 0.17 * S, 0.40 * S, 0.17 * S, bx, rootY, bz, yaw);
    pushInst(P, _cm, gc[0] * .92, gc[1] * .92, gc[2] * .92, fill, 0, RG);
    const elY = shY - 0.36 * S - Math.cos(upR) * 0.06 * S;
    const elZ = Math.sin(upR) * 0.34 * S;
    const foY = elY - 0.16 * S, foZ = elZ + Math.sin(upR + foreR) * 0.14 * S;
    // bare forearm, or a bracer over it
    partMat(_cm, shX, foY, foZ, upR + foreR, 0, s * 0.06, 0.145 * S, 0.36 * S, 0.145 * S, bx, rootY, bz, yaw);
    pushInst(RB, _cm, sk[0], sk[1], sk[2], fill, 0, .9);
    if (e.bracer) {
      partMat(_cm, shX, foY - 0.06 * S, foZ, upR + foreR, 0, s * 0.06, 0.175 * S, 0.20 * S, 0.175 * S, bx, rootY, bz, yaw);
      pushInst(P, _cm, gc[0], gc[1], gc[2], fill, 0, RG);
    }
    const hY = elY - 0.34 * S, hZ = elZ + Math.sin(upR + foreR) * 0.32 * S;
    if (e.glove) {
      partMat(_cm, shX, hY + 0.03 * S, hZ, upR + foreR, 0, s * 0.06, 0.15 * S, 0.14 * S, 0.15 * S, bx, rootY, bz, yaw);
      pushInst(P, _cm, gc[0] * .9, gc[1] * .9, gc[2] * .9, fill, 0, RG);
    }
    if (isMain && e.wpn) drawWeapon(e, S, shX, hY, hZ, upR + foreR, atkSwing, bx, rootY, bz, yaw, fill);
    if (!isMain && e.shield) {
      partMat(_cm, shX - s * 0.05 * S, hY + 0.16 * S, hZ + 0.12 * S, 0.2, 0, s * .2, 0.42 * S, 0.54 * S, 0.09 * S, bx, rootY, bz, yaw);
      pushInst(P, _cm, gc[0] * 1.02, gc[1] * 1.02, gc[2] * 1.02, fill, 0, RG);
      partMat(_cm, shX - s * 0.05 * S, hY + 0.16 * S, hZ + 0.18 * S, 0.2, 0, s * .2, 0.17 * S, 0.20 * S, 0.05 * S, bx, rootY, bz, yaw);
      pushInst(P, _cm, trim[0], trim[1], trim[2], tg, 0, RG * .5);
    }
  }

  // --- legs ---
  for (const s of [-1, 1]) {
    let th = (s > 0 ? swing2 : swing) * 0.95;
    let kn = Math.max(0, -(s > 0 ? swing2 : swing)) * 0.7 + 0.08;
    if (air) { th = -0.5; kn = 0.9; }
    if (dead) { th = -0.3; kn = 0.5; }
    const hX = s * 0.19 * S;
    partMat(_cm, hX, hipY - rootY - 0.34 * S, Math.sin(th) * 0.14 * S, th, 0, 0, 0.20 * S, 0.46 * S, 0.20 * S, bx, rootY, bz, yaw);
    pushInst(P, _cm, gc2[0] * .98, gc2[1] * .98, gc2[2] * .98, fill, 0, RG + .06);
    const kY = hipY - rootY - 0.56 * S - Math.cos(th) * 0.06 * S, kZ = Math.sin(th) * 0.4 * S;
    // knee guard
    partMat(_cm, hX, kY - 0.02 * S, kZ + 0.06 * S, th - kn * .5, 0, 0, 0.20 * S, 0.13 * S, 0.19 * S, bx, rootY, bz, yaw);
    pushInst(P, _cm, gc[0] * .95, gc[1] * .95, gc[2] * .95, fill, 0, RG);
    partMat(_cm, hX, kY - 0.22 * S, kZ + Math.sin(th - kn) * 0.16 * S, th - kn, 0, 0, 0.18 * S, 0.44 * S, 0.18 * S, bx, rootY, bz, yaw);
    pushInst(P, _cm, gc2[0] * .84, gc2[1] * .84, gc2[2] * .84, fill, 0, RG + .06);
    const bY = kY - 0.44 * S, bZ = kZ + Math.sin(th - kn) * 0.32 * S + 0.05 * S;
    partMat(_cm, hX, bY, bZ, 0, 0, 0, 0.21 * S, 0.14 * S, 0.31 * S, bx, rootY, bz, yaw);
    pushInst(P, _cm, .16, .12, .10, fill, 0, .82);
    if (e.boots) {   // a cuff so boots are gear rather than feet
      partMat(_cm, hX, bY + 0.10 * S, bZ - 0.03 * S, 0, 0, 0, 0.22 * S, 0.10 * S, 0.24 * S, bx, rootY, bz, yaw);
      pushInst(P, _cm, gc[0] * .88, gc[1] * .88, gc[2] * .88, fill, 0, RG);
    }
  }

  /* --- cape: swings on real velocity, not just walk speed, and trails on a turn --- */
  if (e.cape) {
    const vx = e.x - (e.px == null ? e.x : e.px), vz = e.z - (e.pz == null ? e.z : e.pz);
    const lat = (vx * Math.cos(yaw) - vz * Math.sin(yaw));
    const cr = 0.16 + spd * 0.55 + run * .18 + Math.sin(t * 5) * 0.05 * spd;
    for (let k = 0; k < 3; k++) {
      const f = k / 2;
      partMat(_cm, lat * 5 * f * S, hipY - rootY + (0.30 - f * 0.42) * S,
        (-0.19 - f * 0.30 - spd * 0.16 * f) * S, cr + f * .30, 0, lat * 3 * f,
        (0.50 - f * .07) * S, 0.34 * S, 0.045 * S, bx, rootY, bz, yaw);
      const cf = 0.62 - f * .12;
      pushInst(RB, _cm, lerp(cloth[0], trim[0], cf), lerp(cloth[1], trim[1], cf), lerp(cloth[2], trim[2], cf),
        fill * (1 - f * .4), 0, .74);
    }
  }
  e.px = e.x; e.pz = e.z;

  // --- rarity aura for the best gear ---
  if (glow > 0.35) {
    const every = glow > .8 ? 2 : 3;
    if ((R.frame + (e.id | 0) * 7) % every === 0)
      spawnPart(bx + (Math.random() - .5) * .9 * S, rootY + Math.random() * 1.9 * S, bz + (Math.random() - .5) * .9 * S,
        0, .45 + Math.random() * .5, 0, 1.1, (glow > .8 ? .30 : .22) * S, gr[0], gr[1], gr[2], .95, 0, .3, 0);
  }
}
/* Weapons are built rather than being one box: a blade with a taper, a crossguard,
   a grip and a pommel -- or a staff with a head, or a pair of short daggers. */
function drawWeapon(e, S, shX, hY, hZ, armR, atkSwing, bx, rootY, bz, yaw, fill) {
  const wr = armR - 1.25 + atkSwing * 0.9;
  const wl = e.wpnLen || 1.0;
  const wc = e.wpnCol || [.7, .72, .78], wt = e.wpnTrim || wc;
  const wg = e.wpnGlow || 0, wR = e.wpnRough == null ? .3 : e.wpnRough;
  const kind = e.wpnKind || 0;
  const cs = Math.cos(wr), sn = Math.sin(wr);
  const at = (d) => [shX + (kind === 1 ? 0.02 : 0.04) * S, hY + cs * d * S * wl, hZ + sn * d * S * wl];
  if (kind === 2) {
    // staff: a long haft with a glowing head
    let q = at(0.42);
    partMat(_cm, q[0], q[1], q[2], wr, 0, 0, 0.055 * S, 1.12 * S * wl, 0.055 * S, bx, rootY, bz, yaw);
    pushInst(M.cyl, _cm, .30, .22, .16, fill, 0, .8);
    q = at(1.02);
    partMat(_cm, q[0], q[1], q[2], wr, 0, 0, 0.19 * S, 0.19 * S, 0.19 * S, bx, rootY, bz, yaw);
    pushInst(M.sph, _cm, wt[0], wt[1], wt[2], 1.0 + wg, 0, .2);
    q = at(0.86);
    partMat(_cm, q[0], q[1], q[2], wr, 0, 0, 0.12 * S, 0.10 * S, 0.12 * S, bx, rootY, bz, yaw);
    pushInst(M.plate, _cm, wc[0], wc[1], wc[2], wg * .4 + fill, 0, wR);
    return;
  }
  // grip
  let q = at(0.10);
  partMat(_cm, q[0], q[1], q[2], wr, 0, 0, 0.055 * S, 0.20 * S, 0.055 * S, bx, rootY, bz, yaw);
  pushInst(M.cyl, _cm, .24, .17, .13, fill, 0, .85);
  // pommel
  q = at(-0.03);
  partMat(_cm, q[0], q[1], q[2], wr, 0, 0, 0.10 * S, 0.10 * S, 0.10 * S, bx, rootY, bz, yaw);
  pushInst(M.sph, _cm, wt[0], wt[1], wt[2], wg * .5 + fill, 0, wR);
  // crossguard
  q = at(0.22);
  partMat(_cm, q[0], q[1], q[2], wr, 0, PI / 2, 0.05 * S, 0.34 * S, 0.07 * S, bx, rootY, bz, yaw);
  pushInst(M.plate, _cm, wt[0], wt[1], wt[2], wg * .6 + fill, 0, wR);
  // blade: two stacked segments so it tapers to a point
  q = at(0.58);
  partMat(_cm, q[0], q[1], q[2], wr, 0, 0, 0.085 * S, 0.50 * S * wl, 0.030 * S, bx, rootY, bz, yaw);
  pushInst(M.plate, _cm, wc[0], wc[1], wc[2], wg * .5 + fill, 0, wR);
  q = at(0.94 * wl + 0.04);
  partMat(_cm, q[0], q[1], q[2], wr, 0, 0, 0.055 * S, 0.30 * S * wl, 0.024 * S, bx, rootY, bz, yaw);
  pushInst(M.plate, _cm, wc[0] * 1.1, wc[1] * 1.1, wc[2] * 1.1, wg * .7 + fill, 0, wR * .7);
  // a fuller of trim down the blade on the good stuff
  if ((e.wpnT || 0) >= 3) {
    q = at(0.62);
    partMat(_cm, q[0], q[1], q[2], wr, 0, 0, 0.022 * S, 0.56 * S * wl, 0.038 * S, bx, rootY, bz, yaw);
    pushInst(M.plate, _cm, wt[0], wt[1], wt[2], .5 + wg, 0, .2);
  }
  // a swing leaves a trail on high-tier weapons
  if (atkSwing > 0.25 && wg > 0.2 && (R.frame & 1) === 0) {
    q = at(0.80 * wl);
    const c2 = Math.cos(yaw), s2 = Math.sin(yaw);
    spawnPart(bx + q[0] * c2 + q[2] * s2, rootY + q[1], bz - q[0] * s2 + q[2] * c2,
      0, .2, 0, .30, .22 * S, wt[0], wt[1], wt[2], .85, 0, 0, 0);
  }
}

/* ------------------------------ PROP DRAWING ------------------------------ */
const TREE_COL = [
  { t: [.30, .21, .14], f: [[.20, .42, .18], [.24, .48, .20]], kind: 'ball' },  // 0 broadleaf
  { t: [.24, .17, .12], f: [[.13, .32, .17], [.16, .38, .19]], kind: 'pine' },  // 1 pine
  { t: [.44, .34, .22], f: [[.42, .48, .26], [.50, .54, .30]], kind: 'ball' },  // 2 desert
  { t: [.28, .24, .22], f: [[.62, .70, .74], [.70, .76, .80]], kind: 'pine' },  // 3 snowy
  { t: [.16, .12, .13], f: [[.30, .18, .22], [.24, .14, .26]], kind: 'pine' },  // 4 dead / corrupt
];
function drawProps(px, pz, viewDist) {
  const c0 = Math.floor((px - viewDist) / CHUNK), c1 = Math.floor((px + viewDist) / CHUNK);
  const d0 = Math.floor((pz - viewDist) / CHUNK), d1 = Math.floor((pz + viewDist) / CHUNK);
  const vd2 = viewDist * viewDist;
  const thinStart = viewDist * 0.42;
  for (let ci = c0; ci <= c1; ci++) for (let cj = d0; cj <= d1; cj++) {
    const cxp = ci * CHUNK + CHUNK / 2, czp = cj * CHUNK + CHUNK / 2;
    if (V.dist2(px, pz, cxp, czp) > (viewDist + CHUNK) * (viewDist + CHUNK)) continue;
    if (!sphereInFrustum(cxp, groundH(cxp, czp) + 12, czp, CHUNK * 0.95)) continue;
    const ch = getChunkProps(ci, cj);
    for (let i = 0; i < ch.trees.length; i++) {
      const p = ch.trees[i];
      const d2 = V.dist2(px, pz, p.x, p.z); if (d2 > vd2) continue;
      // thin distant woods deterministically: density falls off instead of
      // popping at a hard edge, and the instance budget is never exhausted
      const dn = Math.sqrt(d2);
      if (dn > thinStart) {
        const keep = 1 - smoothstep(thinStart, viewDist, dn) * 0.72;
        if ((((i * 2654435761) ^ (ci * 40503) ^ (cj * 12289)) >>> 9) % 1024 > keep * 1024) continue;
      }
      const far = d2 > 150 * 150;
      const tc = TREE_COL[p.k];
      const h = 3.2 * p.s;
      M4.trs(_m, p.x, p.y, p.z, 0, p.r, 0, 0.62 * p.s, h, 0.62 * p.s);
      pushInst(M.cyl, _m, tc.t[0], tc.t[1], tc.t[2], 0, 0, .95);
      if (tc.kind === 'pine') {
        const layers = far ? 2 : 3;
        for (let L = 0; L < layers; L++) {
          const fy = p.y + h * (0.42 + L * 0.26);
          const fs = (2.9 - L * 0.72) * p.s;
          const fc = tc.f[L & 1];
          M4.trs(_m, p.x, fy, p.z, 0, p.r + L, 0, fs, 2.5 * p.s, fs);
          pushInst(M.cone, _m, fc[0], fc[1], fc[2], 0, .028, .96);
        }
      } else {
        const n = far ? 1 : 3;
        for (let L = 0; L < n; L++) {
          const a = L * 2.1 + p.r;
          const off = L === 0 ? 0 : 0.85 * p.s;
          const fc = tc.f[L & 1];
          M4.trs(_m, p.x + Math.cos(a) * off, p.y + h * (0.98 + (L ? .12 : .26)), p.z + Math.sin(a) * off,
            0, a, 0, (L === 0 ? 3.5 : 2.4) * p.s, (L === 0 ? 3.0 : 2.1) * p.s, (L === 0 ? 3.5 : 2.4) * p.s);
          pushInst(M.sph, _m, fc[0], fc[1], fc[2], 0, .022, .96);
        }
      }
    }
    for (let i = 0; i < ch.rocks.length; i++) {
      const p = ch.rocks[i];
      const d2 = V.dist2(px, pz, p.x, p.z); if (d2 > vd2 * .55) continue;
      const g = .34 + hash2i(p.x | 0, p.z | 0) * .16;
      M4.trs(_m, p.x, p.y + p.s * .18, p.z, .14, p.r, .1, p.s * 1.5, p.s * 1.1 * p.sq, p.s * 1.4);
      pushInst(M.sph, _m, g, g * .98, g * .94, 0, 0, .98);
    }
    if (R.quality > 0) for (let i = 0; i < ch.bushes.length; i++) {
      const p = ch.bushes[i];
      const d2 = V.dist2(px, pz, p.x, p.z); if (d2 > 120 * 120) continue;
      const zn = zoneAt(p.x, p.z); const bc = zn ? zn.col : [.3, .5, .25];
      M4.trs(_m, p.x, p.y + p.s * .3, p.z, 0, p.r, 0, p.s * 1.6, p.s * 1.2, p.s * 1.6);
      pushInst(M.sph, _m, bc[0] * .8, bc[1] * .95, bc[2] * .7, 0, .05, .95);
    }
  }
}
const _bp = [0, 0];
/** One hollow building: floor, four walls with a doorway, ceiling, roof, sign
    and — when you are close enough to care — the furniture inside. */
function drawBuilding(b, px, pz, night) {
  const gy = b.gy != null ? b.gy : groundH(b.x, b.z);
  if (!sphereInFrustum(b.x, gy + b.hgt * .6, b.z, Math.hypot(b.w, b.d) * .7 + b.hgt)) return;
  const d2 = V.dist2(px, pz, b.x, b.z);
  const close = d2 < 90 * 90;
  const inside = G.indoorB === b;
  const t = b.tint;
  const lit = inside ? 0.20 : night * 0.06;          // interiors read without a real light
  const wallC = [.60 * t, .53 * t, .44 * t];
  const trimC = [.26 * t, .17 * t, .12 * t];

  // floor — lifted a few centimetres so it does not z-fight the town platform
  M4.trs(_m, b.x, gy - 0.10, b.z, 0, b.rot, 0, b.w, 0.34, b.d);
  pushInst(M.box, _m, .30 * t, .24 * t, .19 * t, lit, 0, .95);

  // four walls, the front one split around the doorway
  for (const r of b.rect) {
    bldWorld(b, r.cx, r.cz, _bp);
    M4.trs(_m, _bp[0], gy + 0.2 + b.hgt * .5, _bp[1], 0, b.rot, 0, r.hx * 2, b.hgt, r.hz * 2);
    pushInst(M.box, _m, wallC[0], wallC[1], wallC[2], lit, 0, .93);
  }
  // lintel over the door
  {
    const hd = b.d / 2;
    bldWorld(b, 0, hd, _bp);
    M4.trs(_m, _bp[0], gy + 0.2 + b.hgt - (b.hgt - 2.5) * .5, _bp[1], 0, b.rot, 0, DOOR_W + .3, Math.max(.4, b.hgt - 2.5), WALL_T * 2);
    pushInst(M.box, _m, wallC[0], wallC[1], wallC[2], lit, 0, .93);
    // door frame posts
    for (const sx of [-1, 1]) {
      bldWorld(b, sx * (DOOR_W / 2 + .12), hd, _bp);
      M4.trs(_m, _bp[0], gy + 1.45, _bp[1], 0, b.rot, 0, .26, 2.6, WALL_T * 2.2);
      pushInst(M.box, _m, trimC[0], trimC[1], trimC[2], lit, 0, .9);
    }
  }
  // Timber banding hugs the OUTSIDE of the four walls. It used to be one box
  // spanning the whole footprint, which put a solid slab across the room at
  // chest height and hid the furniture and the player underneath it.
  const hwB = b.w / 2, hdB = b.d / 2;
  for (const fy of [0.34, 0.74]) {
    const by = gy + 0.2 + b.hgt * fy;
    for (const sz of [-1, 1]) {
      bldWorld(b, 0, sz * hdB, _bp);
      M4.trs(_m, _bp[0], by, _bp[1], 0, b.rot, 0, b.w * 1.02, .2, .14);
      pushInst(M.box, _m, trimC[0], trimC[1], trimC[2], night * .04, 0, .95);
    }
    for (const sx of [-1, 1]) {
      bldWorld(b, sx * hwB, 0, _bp);
      M4.trs(_m, _bp[0], by, _bp[1], 0, b.rot, 0, .14, .2, b.d * 1.02);
      pushInst(M.box, _m, trimC[0], trimC[1], trimC[2], night * .04, 0, .95);
    }
  }
  if (close) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    bldWorld(b, sx * b.w / 2, sz * b.d / 2, _bp);
    M4.trs(_m, _bp[0], gy + 0.2 + b.hgt * .5, _bp[1], 0, b.rot, 0, .3, b.hgt, .3);
    pushInst(M.box, _m, trimC[0], trimC[1], trimC[2], 0, 0, .95);
  }
  // windows — warm and lit after dusk
  const wlit = night > .12 ? night * 3.0 : 0;
  const wc = wlit > 0 ? [1.0, .78, .38] : [.16, .19, .24];
  for (const sx of [-1, 1]) {
    bldWorld(b, sx * (b.w / 2 + .02), 0, _bp);
    M4.trs(_m, _bp[0], gy + 0.2 + b.hgt * .58, _bp[1], 0, b.rot, 0, .16, .9, b.d * .34);
    pushInst(M.box, _m, wc[0], wc[1], wc[2], wlit, 0, .35);
  }
  // ceiling keeps the interior feeling like a room, then the roof on top
  M4.trs(_m, b.x, gy + 0.2 + b.hgt + .1, b.z, 0, b.rot, 0, b.w * 1.01, .22, b.d * 1.01);
  pushInst(M.box, _m, .24 * t, .19 * t, .15 * t, lit * .8, 0, .95);
  M4.trs(_m, b.x, gy + 0.2 + b.hgt + .2, b.z, 0, b.rot, 0, b.w * 1.3, b.hgt * .5, b.d * 1.3);
  pushInst(M.pyr, _m, .40 * t, .19 * t, .15 * t, 0, 0, .92);

  // hanging sign by the door
  if (close && b.kind !== 'house') {
    bldWorld(b, DOOR_W / 2 + 1.0, b.d / 2 + .35, _bp);
    M4.trs(_m, _bp[0], gy + 2.9, _bp[1], 0, b.rot, 0, 1.5, .85, .12);
    pushInst(M.box, _m, .30, .22, .14, night * .5, 0, .8);
  }

  // ---- interior: furniture, hearth, lantern ----
  if (!close) return;
  for (const pr of b.props) {
    bldWorld(b, pr.x, pr.z, _bp);
    // meshCylinder is base-anchored (y spans 0..1); boxes and spheres are centred.
    // placing cylinders with the centred convention floated them half their height.
    M4.trs(_m, _bp[0], gy + pr.y - (pr.m === 'cyl' ? pr.sy / 2 : 0), _bp[1], 0, b.rot + pr.r, 0, pr.sx, pr.sy, pr.sz);
    const mesh = pr.m === 'sph' ? M.sph : pr.m === 'cyl' ? M.cyl : M.box;
    pushInst(mesh, _m, pr.c[0], pr.c[1], pr.c[2], pr.e + (pr.e ? 0 : lit), 0, .9);
  }
  // lantern
  if (b.lamp) {
    bldWorld(b, b.lamp.x, b.lamp.z, _bp);
    M4.trs(_m, _bp[0], gy + b.lamp.y, _bp[1], 0, b.rot, 0, .34, .34, .34);
    pushInst(M.sph, _m, 1.0, .86, .52, 2.0, 0, .2);
  }
  // hearth embers
  if (b.fire && Math.random() < G.dt * 15 && d2 < 60 * 60) {
    bldWorld(b, b.fire.x, b.fire.z, _bp);
    const cold = b.fire.cold;
    spawnPart(_bp[0] + (Math.random() - .5) * .35, gy + b.fire.y + .3, _bp[1] + (Math.random() - .5) * .35,
      0, .8 + Math.random() * .7, 0, 1.0, .18,
      cold ? .7 : 1, cold ? .85 : .55, cold ? 1 : .2, .9, 0, cold ? .1 : .5, 0);
  }
}

function drawTowns(px, pz, viewDist) {
  const night = R.sky ? R.sky.night : 0;
  for (const hub of POI.hubs) {
    const hd = V.dist2(px, pz, hub.x, hub.z);
    if (hd > (viewDist + 70) * (viewDist + 70)) continue;
    for (const b of hub.bld) drawBuilding(b, px, pz, night);
    // town banner
    const gy = groundH(hub.x, hub.z);
    M4.trs(_m, hub.x, gy + 3.6, hub.z, 0, 0, 0, .24, 7.2, .24);
    pushInst(M.box, _m, .22, .18, .14, 0, 0, .9);
    M4.trs(_m, hub.x + 1.0, gy + 5.6, hub.z, 0, 0, 0, 1.9, 1.7, .07);
    pushInst(M.box, _m, .74, .16, .16, .10, .05, .7);
    // braziers so towns read at night
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + .5, r = 13;
      const bx = hub.x + Math.cos(a) * r, bz = hub.z + Math.sin(a) * r;
      const by = groundH(bx, bz);
      M4.trs(_m, bx, by, bz, 0, 0, 0, .5, 1.6, .5);
      pushInst(M.cyl, _m, .24, .21, .18, 0, 0, .95);
      const fl = .7 + Math.sin(R.time * 6 + i) * .3;
      M4.trs(_m, bx, by + 1.8, bz, 0, 0, 0, .8, .8, .8);
      pushInst(M.sph, _m, 1.0, .55, .18, 1.4 * fl, 0, .2);
      if (Math.random() < G.dt * 12 && V.dist2(px, pz, bx, bz) < 120 * 120)
        spawnPart(bx + (Math.random() - .5) * .4, by + 2.0, bz + (Math.random() - .5) * .4,
          0, 1.4 + Math.random(), 0, .9, .22, 1, .55, .2, .9, 0, .6, 0);
    }
  }
}

function drawPOIMarkers(px, pz, viewDist) {
  // boss lairs get a ring of standing stones, raid portals a glowing arch
  for (const l of POI.lairs) {
    if (V.dist2(px, pz, l.x, l.z) > 220 * 220) continue;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU, r = 9;
      const sx = l.x + Math.cos(a) * r, sz = l.z + Math.sin(a) * r;
      const gy = groundH(sx, sz);
      M4.trs(_m, sx, gy + 2.2, sz, .06, a, .04, 1.0, 4.6, .7);
      pushInst(M.box, _m, .27, .25, .27, 0, 0, .95);
    }
  }
  for (const p of POI.portals) {
    if (V.dist2(px, pz, p.x, p.z) > 220 * 220) continue;
    const gy = groundH(p.x, p.z);
    for (const s of [-1, 1]) {
      M4.trs(_m, p.x + s * 2.6, gy + 3, p.z, 0, 0, 0, .8, 6, .8);
      pushInst(M.box, _m, .24, .21, .28, 0, 0, .9);
    }
    M4.trs(_m, p.x, gy + 6.2, p.z, 0, 0, 0, 6.6, .8, .8);
    pushInst(M.box, _m, .24, .21, .28, 0, 0, .9);
    const pulse = .6 + Math.sin(R.time * 2 + p.raid) * .35;
    M4.trs(_m, p.x, gy + 3, p.z, 0, 0, 0, 4.4, 5.4, .3);
    pushInst(M.rbox, _m, .45, .25, .85, pulse, 0, .2, 1);
    if (Math.random() < G.dt * 15)
      spawnPart(p.x + (Math.random() - .5) * 4, gy + Math.random() * 5, p.z + (Math.random() - .5) * .6,
        0, .7, 0, 1.2, .3, .6, .35, 1, .8, 0, .2, 0);
  }
  for (const r of POI.ruins) {
    if (V.dist2(px, pz, r.x, r.z) > 190 * 190) continue;
    const rr = new RNG(r.x | 0);
    for (let i = 0; i < 5; i++) {
      const a = rr.f() * TAU, d = rr.r(2, 8);
      const sx = r.x + Math.cos(a) * d, sz = r.z + Math.sin(a) * d;
      const gy = groundH(sx, sz), hh = rr.r(1.2, 4.4);
      M4.trs(_m, sx, gy + hh * .5, sz, rr.r(-.1, .1), a, rr.r(-.1, .1), rr.r(.8, 1.8), hh, rr.r(.8, 1.8));
      pushInst(M.box, _m, .42, .40, .36, 0, 0, .95);
    }
  }
}

/* ------------------------------ RENDER ------------------------------ */
R.camRight = [1, 0, 0]; R.camUp = [0, 1, 0];
R.fogNear = 120; R.fogFar = 620; R.time = 0;
R.flash = 0; R.flashCol = [1, 1, 1]; R.dmgVig = 0;

const _lv = new Float32Array(16), _lp = new Float32Array(16);
function computeLightMatrix(cx, cy, cz) {
  const size = 108, far = 420;
  // snap the light origin to shadow texels so shadows do not swim while moving
  const texel = (size * 2) / R.shadowSize;
  const sx = Math.round(cx / texel) * texel, sz = Math.round(cz / texel) * texel;
  const ex = sx + R.sun[0] * 200, ey = cy + R.sun[1] * 200, ez = sz + R.sun[2] * 200;
  M4.lookAt(_lv, ex, ey, ez, sx, cy, sz, 0, 1, 0);
  M4.ortho(_lp, -size, size, -size, size, 1, far);
  M4.mul(R.lightVP, _lp, _lv);
}

function renderScene(cam, dt) {
  const gl = R.gl;
  if (!R.ok || R.lost) return;
  R.frame++; R.drawCalls = 0; R.tris = 0;

  // ---- matrices ----
  const aspect = R.w / R.h;
  M4.perspective(R.proj, 62 * DEG, aspect, 0.28, 1400);
  M4.lookAt(R.view, cam.x, cam.y, cam.z, cam.tx, cam.ty, cam.tz, 0, 1, 0);
  M4.mul(R.vp, R.proj, R.view);
  M4.invert(R.invVP, R.vp);
  extractFrustum(R.vp);
  R.camPos[0] = cam.x; R.camPos[1] = cam.y; R.camPos[2] = cam.z;
  R.camRight[0] = R.view[0]; R.camRight[1] = R.view[4]; R.camRight[2] = R.view[8];
  R.camUp[0] = R.view[1]; R.camUp[1] = R.view[5]; R.camUp[2] = R.view[9];
  computeLightMatrix(cam.tx, cam.ty, cam.tz);

  const viewDist = R.quality >= 2 ? 430 : R.quality === 1 ? 330 : 240;
  R.fogNear = viewDist * 0.42; R.fogFar = viewDist * 1.28;

  // ---- gather terrain chunks ----
  const pcx = Math.floor(cam.tx / TCHUNK), pcz = Math.floor(cam.tz / TCHUNK);
  const rad = Math.ceil(viewDist / TCHUNK) + 1;
  const visible = [];
  terrainQueue.length = 0;
  for (let i = -rad; i <= rad; i++) for (let j = -rad; j <= rad; j++) {
    const cx = pcx + i, cz = pcz + j;
    const wx = cx * TCHUNK + TCHUNK / 2, wz = cz * TCHUNK + TCHUNK / 2;
    const d = Math.hypot(wx - cam.tx, wz - cam.tz);
    if (d > viewDist + TCHUNK) continue;
    const key = terrainKey(cx, cz);
    let c = TERRAIN.get(key);
    const want = terrainResFor(d);
    if (!c || (c.res < want && d < 200)) {
      terrainQueue.push({ cx, cz, res: want, d });
      if (!c) continue;
    }
    c.used = R.frame;
    if (!sphereInFrustum(wx, (c.minY + c.maxY) * .5, wz, TCHUNK * 0.78 + (c.maxY - c.minY) * .5)) continue;
    visible.push(c);
  }
  // build a couple of chunks per frame, nearest first
  terrainQueue.sort((a, b) => a.d - b.d);
  const budget = R.frame < 20 ? 6 : 2;
  for (let i = 0; i < Math.min(budget, terrainQueue.length); i++) {
    const q = terrainQueue[i];
    const key = terrainKey(q.cx, q.cz);
    const old = TERRAIN.get(key);
    const c = buildTerrainChunk(q.cx, q.cz, q.res);
    if (old) {
      const vi = visible.indexOf(old);
      if (vi >= 0) visible.splice(vi, 1);
      freeTerrainChunk(old);
    }
    TERRAIN.set(key, c);
    visible.push(c);
  }
  // evict stale chunks
  if ((R.frame & 63) === 0) {
    for (const [k, c] of TERRAIN) {
      if (R.frame - c.used > 240) { freeTerrainChunk(c); TERRAIN.delete(k); }
    }
  }

  // ---- build instance batches ----
  resetBatches();
  drawProps(cam.tx, cam.tz, viewDist);
  drawTowns(cam.tx, cam.tz, viewDist);
  drawPOIMarkers(cam.tx, cam.tz, viewDist);
  sceneDrawEntities();     // provided by the game layer

  // ---- shadow pass ----
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.fb.shadow.fb);
  gl.viewport(0, 0, R.shadowSize, R.shadowSize);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.cullFace(gl.FRONT);
  const sp = R.prog.shadow; gl.useProgram(sp.p);
  gl.uniformMatrix4fv(sp.u.uLightVP, false, R.lightVP);
  gl.uniform1i(sp.u.uInst, 1);
  for (const k in M) {
    const mesh = M[k]; if (!mesh.n || !mesh.vao) continue;
    uploadInstances(mesh, mesh.buf, mesh.n);
    drawInstMesh(mesh, mesh.n);
  }
  gl.uniform1i(sp.u.uInst, 0);
  for (const c of visible) {
    if (Math.hypot(c.ox + TCHUNK / 2 - cam.tx, c.oz + TCHUNK / 2 - cam.tz) > 150) continue;
    gl.bindVertexArray(c.vao);
    gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, 0);
    R.drawCalls++;
  }
  gl.cullFace(gl.BACK);

  // ---- main pass ----
  const target = R.msaa > 0 ? R.fb.msaa.fb : R.fb.res.fb;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target);
  gl.viewport(0, 0, R.w, R.h);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // sky (depth off, drawn first)
  gl.depthMask(false); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  const skp = R.prog.sky; gl.useProgram(skp.p);
  gl.uniformMatrix4fv(skp.u.uInvVP, false, R.invVP);
  gl.uniform3fv(skp.u.uCam, R.camPos);
  gl.uniform3fv(skp.u.uSkyTop, R.sky.top);
  gl.uniform3fv(skp.u.uSkyHor, R.sky.hor);
  gl.uniform3fv(skp.u.uSun, R.sun);
  gl.uniform3fv(skp.u.uSunCol, R.sky.sun);
  gl.uniform1f(skp.u.uTime, R.time);
  gl.uniform1f(skp.u.uNight, R.sky.night);
  gl.bindVertexArray(R.quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
  R.drawCalls++;
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE);

  // terrain
  const tp = R.prog.terrain; gl.useProgram(tp.p); setSceneUniforms(tp);
  for (const c of visible) {
    gl.bindVertexArray(c.vao);
    gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, 0);
    R.drawCalls++; R.tris += c.count / 3;
  }

  // instanced geometry
  const ip = R.prog.inst; gl.useProgram(ip.p); setSceneUniforms(ip);
  for (const k in M) {
    const mesh = M[k]; if (!mesh.n || !mesh.vao) continue;
    drawInstMesh(mesh, mesh.n);      // already uploaded during the shadow pass
  }

  // grass
  if (R.quality > 0) {
    const gp = R.prog.grass; gl.useProgram(gp.p); setSceneUniforms(gp);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    const gr = R.quality >= 2 ? 2 : 1;
    const gcx = Math.floor(cam.tx / GCELL), gcz = Math.floor(cam.tz / GCELL);
    let built = 0;
    for (let i = -gr; i <= gr; i++) for (let j = -gr; j <= gr; j++) {
      const key = grassKey(gcx + i, gcz + j);
      let g = GRASS_CACHE.get(key);
      if (g === undefined) { if (built >= 3) continue; g = grassForCell(gcx + i, gcz + j); built++; }
      if (!g) continue;
      gl.bindVertexArray(g.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, g.n);
      R.drawCalls++;
    }
    gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
  }

  // water
  const wp = R.prog.water; gl.useProgram(wp.p); setSceneUniforms(wp);
  gl.uniform1f(wp.u.uLevel, WATER_Y);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(R.waterVAO);
  gl.drawElements(gl.TRIANGLES, R.waterCount, gl.UNSIGNED_INT, 0);
  R.drawCalls++;
  gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);

  // particles
  drawParticles();
  gl.bindVertexArray(null);

  // ---- resolve + post ----
  if (R.msaa > 0) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, R.fb.msaa.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.fb.res.fb);
    gl.blitFramebuffer(0, 0, R.w, R.h, 0, 0, R.w, R.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(R.quadVAO);

  const bloomOn = R.quality > 0;
  if (bloomOn) {
    const bp = R.prog.bright; gl.useProgram(bp.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fb.b0.fb);
    gl.viewport(0, 0, R.fb.b0.w, R.fb.b0.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.fb.res.tex);
    gl.uniform1i(bp.u.uTex, 0); gl.uniform1f(bp.u.uThresh, R.hdr ? 1.05 : 0.78);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const blp = R.prog.blur; gl.useProgram(blp.p);
    for (let pass = 0; pass < 2; pass++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.fb.b1.fb);
      gl.bindTexture(gl.TEXTURE_2D, R.fb.b0.tex);
      gl.uniform1i(blp.u.uTex, 0); gl.uniform2f(blp.u.uDir, 1 / R.fb.b0.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.fb.b0.fb);
      gl.bindTexture(gl.TEXTURE_2D, R.fb.b1.tex);
      gl.uniform2f(blp.u.uDir, 0, 1 / R.fb.b0.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, R.w, R.h);
  const pp = R.prog.post; gl.useProgram(pp.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.fb.res.tex); gl.uniform1i(pp.u.uTex, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomOn ? R.fb.b0.tex : R.fb.res.tex); gl.uniform1i(pp.u.uBloom, 1);
  gl.uniform2f(pp.u.uTexel, 1 / R.w, 1 / R.h);
  gl.uniform1f(pp.u.uBloomAmt, bloomOn ? 0.42 : 0.0);
  gl.uniform1f(pp.u.uSharp, R.quality > 0 ? 0.34 : 0.0);
  gl.uniform1f(pp.u.uVig, 0.34);
  gl.uniform1f(pp.u.uExposure, 1.06 + (R.sky ? R.sky.night * 0.30 : 0));
  gl.uniform1f(pp.u.uFlash, R.flash);
  gl.uniform3fv(pp.u.uFlashCol, R.flashCol);
  gl.uniform1f(pp.u.uDamage, R.dmgVig);
  gl.uniform1f(pp.u.uTime, R.time);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE);
  gl.activeTexture(gl.TEXTURE0);
}
