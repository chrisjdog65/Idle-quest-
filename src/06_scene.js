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
const INST_MAX = { rbox: 4200, box: 1400, cyl: 2600, cone: 3600, sph: 3000, pyr: 600 };
function buildMeshes() {
  const mk = (m, cap) => makeInstMesh(m.v, m.i, cap);
  M.rbox = mk(meshRoundBox(5, .30), INST_MAX.rbox);
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
  for (let i = 0; i < want; i++) {
    const x = ox + rng.f() * GCELL, z = oz + rng.f() * GCELL;
    const h = groundH(x, z);
    if (h < WATER_Y + .4 || h > 108) continue;
    if (slopeAt(x, z) > .40) continue;
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
  if (i >= PART.cap) {                       // recycle the oldest
    i = (R.frame * 7) % PART.cap;
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
  const gc = e.gearCol || [.5, .5, .55];
  const gc2 = e.gearCol2 || [.35, .35, .4];
  const acc = e.accent || [.7, .2, .2];
  const glow = e.glow || 0;
  const gr = e.glowCol || [1, .6, .2];

  const swing = Math.sin(t * 9.0) * spd;
  const swing2 = Math.sin(t * 9.0 + PI) * spd;
  const bob = (Math.abs(Math.sin(t * 9.0)) * 0.055 + Math.sin(t * 1.6) * 0.012) * (0.4 + spd) * sc;
  let lean = spd * 0.12 + run * 0.16;
  let rootY = by + bob;
  let bodyPitch = lean;
  if (dead) { bodyPitch = 1.45; rootY = by + 0.22 * sc; }
  else if (air) { bodyPitch = -0.12; }

  const S = sc;
  const hipY = rootY + 0.92 * S;
  // --- torso ---
  const torsoR = bodyPitch + (cast ? -0.12 : 0) + Math.sin(t * 1.9) * 0.012;
  partMat(_cm, 0, hipY - rootY + 0.30 * S, 0, torsoR, 0, 0, 0.52 * S, 0.62 * S, 0.32 * S, bx, rootY, bz, yaw);
  pushInst(M.rbox, _cm, gc[0], gc[1], gc[2], glow * .5, 0, .72);
  // --- pelvis ---
  partMat(_cm, 0, hipY - rootY - 0.06 * S, 0, torsoR * .5, 0, 0, 0.44 * S, 0.26 * S, 0.30 * S, bx, rootY, bz, yaw);
  pushInst(M.rbox, _cm, gc2[0], gc2[1], gc2[2], 0, 0, .8);
  // --- head ---
  const headY = hipY - rootY + 0.74 * S;
  const hy = (e.headYaw || 0);
  partMat(_cm, 0, headY, 0.02 * S, torsoR * .3 + (dead ? .3 : 0), hy, 0, 0.30 * S, 0.32 * S, 0.29 * S, bx, rootY, bz, yaw);
  pushInst(M.rbox, _cm, sk[0], sk[1], sk[2], 0, 0, .92);
  // hair / helm
  if (e.helm) {
    partMat(_cm, 0, headY + 0.10 * S, 0, torsoR * .3, hy, 0, 0.34 * S, 0.26 * S, 0.33 * S, bx, rootY, bz, yaw);
    pushInst(M.rbox, _cm, gc[0] * 1.1, gc[1] * 1.1, gc[2] * 1.1, glow * .8, 0, .45);
  } else {
    partMat(_cm, 0, headY + 0.11 * S, -0.02 * S, torsoR * .3, hy, 0, 0.32 * S, 0.20 * S, 0.31 * S, bx, rootY, bz, yaw);
    pushInst(M.rbox, _cm, hc[0], hc[1], hc[2], 0, 0, .9);
  }
  if (lod > 0) return;   // distant characters stop here (6 parts)

  // --- shoulders (gear) ---
  if (e.pads) {
    for (const s of [-1, 1]) {
      partMat(_cm, s * 0.34 * S, hipY - rootY + 0.55 * S, 0, torsoR, 0, s * 0.28, 0.26 * S, 0.20 * S, 0.28 * S, bx, rootY, bz, yaw);
      pushInst(M.rbox, _cm, acc[0], acc[1], acc[2], glow, 0, .4);
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
    pushInst(M.rbox, _cm, gc[0] * .9, gc[1] * .9, gc[2] * .9, 0, 0, .7);
    const elY = shY - 0.36 * S - Math.cos(upR) * 0.06 * S;
    const elZ = Math.sin(upR) * 0.34 * S;
    partMat(_cm, shX, elY - 0.16 * S, elZ + Math.sin(upR + foreR) * 0.14 * S, upR + foreR, 0, s * 0.06, 0.15 * S, 0.36 * S, 0.15 * S, bx, rootY, bz, yaw);
    pushInst(M.rbox, _cm, sk[0], sk[1], sk[2], 0, 0, .9);
    // hand-held gear
    const hY = elY - 0.34 * S, hZ = elZ + Math.sin(upR + foreR) * 0.32 * S;
    if (isMain && e.wpn) {
      const wr = upR + foreR - 1.25 + atkSwing * 0.9;
      const wl = e.wpnLen || 1.0;
      partMat(_cm, shX + s * 0.04 * S, hY + Math.cos(wr) * 0.35 * S * wl, hZ + Math.sin(wr) * 0.4 * S * wl,
        wr, 0, 0, 0.09 * S, 0.95 * S * wl, 0.09 * S, bx, rootY, bz, yaw);
      pushInst(M.rbox, _cm, e.wpnCol[0], e.wpnCol[1], e.wpnCol[2], e.wpnGlow || 0, 0, .25);
      // pommel
      partMat(_cm, shX + s * 0.04 * S, hY, hZ, wr, 0, 0, 0.14 * S, 0.14 * S, 0.14 * S, bx, rootY, bz, yaw);
      pushInst(M.rbox, _cm, .28, .22, .16, 0, 0, .8);
    }
    if (!isMain && e.shield) {
      partMat(_cm, shX - s * 0.05 * S, hY + 0.16 * S, hZ + 0.12 * S, 0.2, 0, s * .2, 0.42 * S, 0.52 * S, 0.10 * S, bx, rootY, bz, yaw);
      pushInst(M.rbox, _cm, acc[0] * .9, acc[1] * .9, acc[2] * .9, glow * .6, 0, .4);
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
    pushInst(M.rbox, _cm, gc2[0] * .95, gc2[1] * .95, gc2[2] * .95, 0, 0, .78);
    const kY = hipY - rootY - 0.56 * S - Math.cos(th) * 0.06 * S, kZ = Math.sin(th) * 0.4 * S;
    partMat(_cm, hX, kY - 0.22 * S, kZ + Math.sin(th - kn) * 0.16 * S, th - kn, 0, 0, 0.18 * S, 0.44 * S, 0.18 * S, bx, rootY, bz, yaw);
    pushInst(M.rbox, _cm, gc2[0] * .8, gc2[1] * .8, gc2[2] * .8, 0, 0, .8);
    // boot
    partMat(_cm, hX, kY - 0.44 * S, kZ + Math.sin(th - kn) * 0.32 * S + 0.05 * S, 0, 0, 0, 0.20 * S, 0.13 * S, 0.30 * S, bx, rootY, bz, yaw);
    pushInst(M.rbox, _cm, .17, .13, .11, 0, 0, .85);
  }
  // --- cape ---
  if (e.cape) {
    const cr = 0.18 + spd * 0.5 + Math.sin(t * 5) * 0.06 * spd;
    partMat(_cm, 0, hipY - rootY + 0.22 * S, -0.20 * S - spd * 0.1 * S, cr, 0, 0, 0.52 * S, 0.82 * S, 0.05 * S, bx, rootY, bz, yaw);
    pushInst(M.rbox, _cm, acc[0], acc[1], acc[2], glow * .4, 0, .55);
  }
  // --- rarity aura for legendary / mythic gear ---
  if (glow > 0.35) {
    if ((R.frame + (e.id | 0) * 7) % 3 === 0)
      spawnPart(bx + (Math.random() - .5) * .7 * S, rootY + Math.random() * 1.7 * S, bz + (Math.random() - .5) * .7 * S,
        0, .35 + Math.random() * .4, 0, .9, .17 * S, gr[0], gr[1], gr[2], .8, 0, .4, 0);
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
  for (let ci = c0; ci <= c1; ci++) for (let cj = d0; cj <= d1; cj++) {
    const cxp = ci * CHUNK + CHUNK / 2, czp = cj * CHUNK + CHUNK / 2;
    if (V.dist2(px, pz, cxp, czp) > (viewDist + CHUNK) * (viewDist + CHUNK)) continue;
    if (!sphereInFrustum(cxp, groundH(cxp, czp) + 12, czp, CHUNK * 0.95)) continue;
    const ch = getChunkProps(ci, cj);
    for (let i = 0; i < ch.trees.length; i++) {
      const p = ch.trees[i];
      const d2 = V.dist2(px, pz, p.x, p.z); if (d2 > vd2) continue;
      const far = d2 > 160 * 160;
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
function drawTowns(px, pz, viewDist) {
  for (const hub of POI.hubs) {
    const hd = V.dist2(px, pz, hub.x, hub.z);
    if (hd > (viewDist + 70) * (viewDist + 70)) continue;
    const close = hd < 150 * 150;
    for (const b of hub.bld) {
      const gy = groundH(b.x, b.z);
      if (!sphereInFrustum(b.x, gy + b.hgt * .5, b.z, Math.max(b.w, b.d) + b.hgt)) continue;
      const t = b.tint;
      // stone plinth
      M4.trs(_m, b.x, gy + .35, b.z, 0, b.rot, 0, b.w * 1.10, .7, b.d * 1.10);
      pushInst(M.box, _m, .38 * t, .36 * t, .33 * t, 0, 0, .96);
      // plastered walls
      M4.trs(_m, b.x, gy + .6 + b.hgt * .5, b.z, 0, b.rot, 0, b.w, b.hgt, b.d);
      pushInst(M.box, _m, .60 * t, .53 * t, .44 * t, 0, 0, .93);
      // exposed timber frame: two horizontal bands
      for (const fy of [0.34, 0.74]) {
        M4.trs(_m, b.x, gy + .6 + b.hgt * fy, b.z, 0, b.rot, 0, b.w * 1.02, .22, b.d * 1.02);
        pushInst(M.box, _m, .26 * t, .17 * t, .12 * t, 0, 0, .95);
      }
      // corner posts
      if (close) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const cx2 = Math.cos(b.rot), sz2 = Math.sin(b.rot);
        const lx = sx * b.w * .48, lz = sz * b.d * .48;
        M4.trs(_m, b.x + lx * cx2 - lz * sz2, gy + .6 + b.hgt * .5, b.z + lx * sz2 + lz * cx2,
          0, b.rot, 0, .26, b.hgt, .26);
        pushInst(M.box, _m, .24 * t, .16 * t, .11 * t, 0, 0, .95);
      }
      // door on the front face
      {
        const cx2 = Math.cos(b.rot), sz2 = Math.sin(b.rot);
        const lz = b.d * .52;
        M4.trs(_m, b.x - lz * sz2, gy + .6 + 1.05, b.z + lz * cx2, 0, b.rot, 0, 1.25, 2.1, .16);
        pushInst(M.box, _m, .21 * t, .13 * t, .09 * t, 0, 0, .9);
      }
      // windows — warm and lit after dusk
      const night = R.sky.night;
      const wlit = night > .2 ? night * 1.5 : 0;
      const wc = wlit > 0 ? [1.0, .78, .38] : [.16, .19, .24];
      for (const sgn of [-1, 1]) {
        const cx2 = Math.cos(b.rot), sz2 = Math.sin(b.rot);
        const lx = sgn * b.w * .52;
        M4.trs(_m, b.x + lx * cx2, gy + .6 + b.hgt * .58, b.z + lx * sz2, 0, b.rot, 0, .16, .9, b.d * .34);
        pushInst(M.box, _m, wc[0], wc[1], wc[2], wlit, 0, .35);
      }
      // roof
      if (b.roof) {
        M4.trs(_m, b.x, gy + .6 + b.hgt, b.z, 0, b.rot, 0, b.w * 1.28, b.hgt * .55, b.d * 1.28);
        pushInst(M.pyr, _m, .40 * t, .19 * t, .15 * t, 0, 0, .92);
      } else {
        M4.trs(_m, b.x, gy + .6 + b.hgt + .16, b.z, 0, b.rot, 0, b.w * 1.16, .32, b.d * 1.16);
        pushInst(M.box, _m, .34 * t, .30 * t, .26 * t, 0, 0, .94);
      }
      // chimney
      if (close && b.roof) {
        M4.trs(_m, b.x + b.w * .22, gy + .6 + b.hgt + b.hgt * .45, b.z + b.d * .2, 0, b.rot, 0, .5, 1.5, .5);
        pushInst(M.box, _m, .32 * t, .27 * t, .24 * t, 0, 0, .96);
      }
    }
    // town banner
    const gy = groundH(hub.x, hub.z);
    M4.trs(_m, hub.x, gy + 3.6, hub.z, 0, 0, 0, .24, 7.2, .24);
    pushInst(M.box, _m, .22, .18, .14, 0, 0, .9);
    M4.trs(_m, hub.x + 1.0, gy + 5.6, hub.z, 0, 0, 0, 1.9, 1.7, .07);
    pushInst(M.box, _m, .74, .16, .16, .10, .05, .7);
    // a warm brazier so towns read at night
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + .5, r = 11;
      const bx = hub.x + Math.cos(a) * r, bz = hub.z + Math.sin(a) * r;
      const by = groundH(bx, bz);
      M4.trs(_m, bx, by + .8, bz, 0, 0, 0, .5, 1.6, .5);
      pushInst(M.cyl, _m, .24, .21, .18, 0, 0, .95);
      const fl = .7 + Math.sin(R.time * 6 + i) * .3;
      M4.trs(_m, bx, by + 1.8, bz, 0, 0, 0, .8, .8, .8);
      pushInst(M.sph, _m, 1.0, .55, .18, 1.4 * fl, 0, .2);
      if ((R.frame + i * 7) % 5 === 0 && V.dist2(px, pz, bx, bz) < 120 * 120)
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
    if ((R.frame + p.raid) % 4 === 0)
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
  gl.uniform1f(pp.u.uExposure, 1.06);
  gl.uniform1f(pp.u.uFlash, R.flash);
  gl.uniform3fv(pp.u.uFlashCol, R.flashCol);
  gl.uniform1f(pp.u.uDamage, R.dmgVig);
  gl.uniform1f(pp.u.uTime, R.time);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE);
  gl.activeTexture(gl.TEXTURE0);
}
