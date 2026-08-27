/* =========================================================================
   IDLE QUEST — 11 MAIN
   Boot sequence, persistence, offline catch-up, resize/quality and the
   frame loop that stitches simulation, meta-server and renderer together.
   ========================================================================= */

const SAVE_KEY = 'idlequest.save.v1';
const SET = { rscale: 1.0, quality: 2, volm: 0.72, vols: 0.82, perf: false };
let bootStage = 0, chosenClass = 'warrior';

/* ------------------------------ SAVE / LOAD ------------------------------ */
function packRoster() {
  const out = [];
  for (const r of ROSTER) {
    out.push([r.n, r.c, r.lv, +r.lp.toFixed(3), Math.round(r.gs), Math.round(r.gold),
      r.gt.join(','), r.gi.join(','), r.g, r.st, +r.skill.toFixed(3),
      Math.round(r.x), Math.round(r.z), Math.round(r.respect), Math.round(r.kills),
      Math.round(r.quests), Math.round(r.bosses), Math.round(r.raids), r.deaths, r.best,
      r.title, r.sk, r.hr, r.z2, r.pvp]);
  }
  return out;
}
function unpackRoster(arr) {
  ROSTER.length = 0;
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    ROSTER.push({
      i, n: a[0], c: a[1], lv: a[2], lp: a[3], gs: a[4], gold: a[5],
      gt: a[6].split(',').map(Number), gi: a[7].split(',').map(Number),
      g: a[8], st: a[9], act: Math.random() * 40, skill: a[10],
      x: a[11], z: a[12], tx: a[11], tz: a[12],
      respect: a[13], kills: a[14], quests: a[15], bosses: a[16], raids: a[17],
      deaths: a[18], best: a[19], title: a[20], sk: a[21], hr: a[22], z2: a[23], pvp: a[24] || 0,
      av: null, online: 1, hof: 0, mythicAt: 0,
    });
  }
}
function packGuilds() {
  return GUILDS.map(g => [g.n, g.members, Math.round(g.respect), g.wins, g.losses, g.raids, g.bosses, g.motto, g.col, g.playerGuild ? 1 : 0]);
}
function unpackGuilds(arr) {
  GUILDS.length = 0;
  arr.forEach((a, i) => GUILDS.push({
    i, n: a[0], members: a[1], respect: a[2], wins: a[3], losses: a[4], raids: a[5],
    bosses: a[6], motto: a[7], col: a[8], playerGuild: !!a[9], founded: 0,
  }));
}
function saveGame() {
  const p = G.player; if (!p) return;
  try {
    const data = {
      v: 1, ts: Date.now(),
      season: { num: SEASON.num, start: SEASON.start, ended: SEASON.ended, champions: SEASON.champions },
      mythic: Array.from(MYTHIC_HOLDERS),
      set: SET,
      p: {
        n: p.name, c: p.cls, lv: p.level, xp: p.xp, gold: p.gold,
        gear: p.gear, bags: p.bags, quests: p.quests, done: p.done, doneCount: p.doneCount,
        kills: p.kills, deaths: p.deaths, bossKills: p.bossKills, raidKills: p.raidKills,
        guild: p.guild, respect: p.respect, playtime: p.playtime, stats: p.stats,
        autoOn: p.autoOn, autoMode: p.autoMode, x: p.x, z: p.z,
        skin: p.skin, hair: p.hair, seenZones: p.seenZones, mythic: p.mythic,
      },
      roster: packRoster(), guilds: packGuilds(),
      lock: RAID_LOCK, wars: WAR_LOG.slice(0, 30),
      uid: ITEM_UID,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { console.warn('save failed', e); return false; }
}
function loadGame() {
  let raw;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function applySave(d) {
  SEASON.num = d.season.num; SEASON.start = d.season.start;
  SEASON.ended = !!d.season.ended; SEASON.champions = d.season.champions || [];
  MYTHIC_HOLDERS.clear(); (d.mythic || []).forEach(x => MYTHIC_HOLDERS.add(x));
  Object.assign(SET, d.set || {});
  R.quality = SET.quality;
  A.volMusic = SET.volm; A.volSfx = SET.vols;
  unpackRoster(d.roster); unpackGuilds(d.guilds);
  Object.assign(RAID_LOCK, d.lock || {});
  WAR_LOG.length = 0; (d.wars || []).forEach(w => WAR_LOG.push(w));
  ITEM_UID = d.uid || 1;
  const s = d.p;
  const p = makePlayer(s.n, s.c);
  p.level = s.lv; p.xp = s.xp; p.gold = s.gold;
  p.gear = s.gear || {}; p.bags = s.bags || [];
  p.quests = s.quests || []; p.done = s.done || {}; p.doneCount = s.doneCount || 0;
  p.kills = s.kills || 0; p.deaths = s.deaths || 0; p.bossKills = s.bossKills || 0; p.raidKills = s.raidKills || 0;
  p.guild = s.guild == null ? null : s.guild; p.respect = s.respect || 0;
  p.playtime = s.playtime || 0; p.stats = Object.assign(p.stats, s.stats || {});
  p.autoOn = !!s.autoOn; p.autoMode = s.autoMode || 'all';
  p.skin = s.skin || 0; p.hair = s.hair || 0; p.seenZones = s.seenZones || {}; p.mythic = s.mythic || 0;
  p.x = s.x != null ? s.x : p.x; p.z = s.z != null ? s.z : p.z; p.y = groundH(p.x, p.z);
  p.st = calcStats(p); p.resMax = resourceMax(p); p.hp = p.st.hpMax;
  p.res = CLASS_BY[p.cls].res === 'rage' ? 0 : p.resMax;
  styleFromGear(p, p.gear, p.cls);
  G.player = p;
  return d.ts;
}

/* ------------------------------ OFFLINE ------------------------------ */
function playerOffline(ms) {
  const p = G.player;
  if (!p.autoOn) return null;
  const secs = Math.min(ms / 1000, SEASON_MS / 1000);
  if (secs < 60) return null;
  const before = { lv: p.level, gold: p.gold, gs: p.st.gs, items: 0 };
  // idle earns at 62% of active pace — being there still matters
  const EFF = 0.62;
  const step = Math.min(120, Math.max(10, secs / 900));
  const n = Math.min(Math.ceil(secs / step), 2000);
  const realStep = secs / n;
  const rng = new RNG((Date.now() & 0x7fffffff) | 1);
  let items = 0;
  for (let i = 0; i < n; i++) {
    const gearFit = clamp(p.st.gs / Math.max(1, refPrimary(p.level) * 5.2), 0.25, 1.3);
    const eff = EFF * (0.7 + gearFit * 0.5);
    let lp = levelRate(p.level, eff) * realStep;
    while (lp >= 1) { p.level++; lp -= 1; }
    p.xp += lp * xpNeed(p.level);
    while (p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level++; }
    p.gold += (3.2 + p.level * 1.4) * realStep * 0.34 * EFF;
    p.kills += realStep * 0.30 * EFF;
    // loot rolls
    if (rng.f() < 0.055 * realStep * EFF) {
      const q = rng.chance(.2) ? 3 : 1;
      let tier = rollTier(rng, q, 0);
      if (tier === 5 && (p.level < MYTHIC_MIN_LEVEL || q < MYTHIC_MIN_SOURCE || !metaCanMythic(p))) tier = 4;
      const ilvl = Math.max(1, Math.round(p.level * 2.45 + rng.r(-6, 10) + tier * 3));
      const it = genItem(rng, ilvl, tier, rng.pick(SLOT_KEYS), p.cls);
      const cur = p.gear[it.sl === 'ring2' ? 'ring1' : it.sl];
      if (!cur || it.sc > cur.sc) {
        p.gear[it.sl] = it; items++;
        if (tier >= 5) { p.mythic = 1; metaClaimMythic(p); }
      } else p.gold += it.val;
      p.stats.itemsFound++;
      p.st = calcStats(p);
    }
    p.doneCount += 0.055 * realStep * EFF * 0.34;
    p.bossKills += 0.010 * realStep * EFF * 0.11;
    p.stats.raidsDone += 0.0042 * realStep * EFF * 0.09;
    p.respect += 0.06 * (1 + p.level / 90) * realStep * EFF;
  }
  p.gold = Math.round(p.gold);
  p.doneCount = Math.round(p.doneCount); p.bossKills = Math.round(p.bossKills);
  p.stats.raidsDone = Math.round(p.stats.raidsDone);
  p.stats.questsDone = p.doneCount; p.stats.bossesKilled = p.bossKills;
  p.st = calcStats(p); p.resMax = resourceMax(p); p.hp = p.st.hpMax;
  styleFromGear(p, p.gear, p.cls);
  return {
    secs, lv: p.level - before.lv, gold: p.gold - before.gold,
    gs: p.st.gs - before.gs, items,
  };
}

/* ------------------------------ RESIZE / QUALITY ------------------------------ */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  const maxDpr = R.quality >= 2 ? 2.5 : R.quality === 1 ? 2.0 : 1.4;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * SET.rscale;
  glResize(w, h, dpr);
  FX.width = Math.floor(w * (window.devicePixelRatio || 1));
  FX.height = Math.floor(h * (window.devicePixelRatio || 1));
  FX.style.width = w + 'px'; FX.style.height = h + 'px';
  R.cssW = w; R.cssH = h;
  R.dpr = (window.devicePixelRatio || 1);
}
function applyQuality() {
  SET.quality = R.quality;
  // grass buffers are quality-dependent — drop them so they rebuild
  for (const [k, g] of GRASS_CACHE) { if (g) { R.gl.deleteVertexArray(g.vao); R.gl.deleteBuffer(g.ib); } }
  GRASS_CACHE.clear();
  for (const [k, c] of TERRAIN) freeTerrainChunk(c);
  TERRAIN.clear();
  onResize();
}

/* ------------------------------ BOOT ------------------------------ */
function bootMsg(pct, msg) {
  $('bootbar').firstElementChild.style.width = pct + '%';
  $('bootmsg').textContent = msg;
}
function buildClassPicker() {
  const box = $('classpick');
  box.innerHTML = '';
  CLASSES.forEach(c => {
    const d = el('div', 'cpick' + (c.id === chosenClass ? ' on' : ''));
    d.innerHTML = '<b>' + c.ic + ' ' + c.n + '</b><span>' + esc(c.blurb) + '</span><div class="role">' + esc(c.role) + ' · ' + c.resN + '</div>';
    d.onclick = () => {
      chosenClass = c.id;
      box.querySelectorAll('.cpick').forEach(x => x.classList.remove('on'));
      d.classList.add('on');
      if (A.ok) sfx('ui', .7, 1.2);
    };
    box.appendChild(d);
  });
}
function randomName() {
  const r = new RNG((Math.random() * 1e9) | 0);
  return randName(r);
}

const BOOT_STEPS = [
  ['Seeding the world', () => { seedNoise(SEED); }],
  ['Raising twelve zones', () => { buildContent(); }],
  ['Laying the roads', () => { buildRoads(); buildRoadField(); }],
  ['Founding towns and lairs', () => { buildPOI(); }],
  ['Waking 1000 adventurers', () => { if (!ROSTER.length) buildRoster(SEED ^ 0xA1DE); }],
  ['Starting the renderer', () => {
    if (!glInit($('gl'))) throw new Error('WebGL2 is not available on this device.');
    buildMeshes(); initParticles();
  }],
  ['Drawing the map', () => { buildMinimapBase(); }],
];

let booted = false;
async function bootUI() {
  if (booted) return; booted = true;
  FX = $('fx'); FXC = FX.getContext('2d');
  MMC = $('mm').getContext('2d');
  buildClassPicker();
  $('pname').value = randomName();
  $('reroll').onclick = () => { $('pname').value = randomName(); if (A.ok) sfx('ui', .7); };

  const saved = loadGame();
  if (saved && saved.p) {
    $('startbtn').textContent = 'Continue';
    $('classpick').style.display = 'none';
    $('namerow').style.display = 'none';
    bootMsg(0, 'save found — ' + esc(saved.p.n) + ', level ' + saved.p.lv);
  }
  $('wipebtn').onclick = () => {
    if (confirm('Delete your save and start fresh?')) { localStorage.removeItem(SAVE_KEY); location.reload(); }
  };
  $('startbtn').onclick = () => startGame(saved);
}

let starting = false;
async function startGame(saved) {
  if (starting) return; starting = true;
  $('startbtn').disabled = true;
  $('classpick').style.pointerEvents = 'none';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    for (let i = 0; i < BOOT_STEPS.length; i++) {
      bootMsg((i / BOOT_STEPS.length) * 100, BOOT_STEPS[i][0] + '…');
      await sleep(16);
      BOOT_STEPS[i][1]();
    }
    bootMsg(96, 'Tuning the orchestra…');
    await sleep(16);
    audioInit(SEED);
    audioResume();
    audioSetVol(SET.volm, SET.vols);
    musicStart();

    let lastTs = 0;
    if (saved && saved.p) {
      lastTs = applySave(saved) || Date.now();
    } else {
      const nm = ($('pname').value || '').trim().replace(/[<>]/g, '').slice(0, 14) || randomName();
      G.player = makePlayer(nm, chosenClass);
      SEASON.start = Date.now();
      SEASON.num = 1;
      lastTs = Date.now();
    }
    // season rollover happened while away?
    if (seasonLeft() <= 0 && !SEASON.ended && SEASON.start > 0) { /* handled after boot */ }

    onResize();
    setupInput();
    buildActionBar();
    G.camYaw = G.player.yaw + PI;
    G.cam.x = G.player.x; G.cam.z = G.player.z + 8; G.cam.y = G.player.y + 6;
    G.lastZone = -1;

    bootMsg(100, 'Entering the world…');
    await sleep(120);
    $('boot').style.transition = 'opacity .5s'; $('boot').style.opacity = '0';
    setTimeout(() => $('boot').remove(), 520);
    $('hud').classList.remove('hidden');
    G.started = true;

    // ---- offline catch-up ----
    const elapsed = Math.max(0, Date.now() - lastTs);
    if (saved && elapsed > 20000) {
      const world = metaOffline(elapsed);
      const mine = playerOffline(elapsed);
      showWelcomeBack(elapsed, mine);
    }
    chatPush('sys', 'Welcome to Idle Quest. Season ' + SEASON.num + ' ends in ' + dur(seasonLeft()) + '.');
    chatPush('world', POP + ' adventurers are online in ' + DB.zones.length + ' zones.');
    if (seasonLeft() <= 0) endSeason();
    if (G.player.autoOn) setAuto(true);

    requestAnimationFrame(loop);
    setInterval(() => { if (G.started) saveGame(); }, 20000);
    window.addEventListener('beforeunload', () => saveGame());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { saveGame(); }
      else { audioResume(); lastFrame = performance.now(); }
    });
  } catch (e) {
    console.error(e);
    bootMsg(100, '');
    $('bootmsg').innerHTML = '<b style="color:#e0492f">' + esc(e.message || 'Failed to start') + '</b>' +
      '<div class="tiny" style="margin-top:6px;max-width:400px">Idle Quest needs WebGL2. Try a recent Chrome, Safari or Firefox, and make sure hardware acceleration is on.</div>';
    $('startbtn').disabled = false;
    starting = false;
  }
}
function showWelcomeBack(ms, mine) {
  let h = '<div class="card center"><b style="color:var(--gold);font-size:15px">WHILE YOU WERE AWAY</b>' +
    '<div class="tiny">' + dur(ms) + ' of world time passed. The other ' + POP + ' adventurers never stopped.</div></div>';
  if (mine && (mine.lv > 0 || mine.gold > 0)) {
    h += '<h4 class="sec">Your idle progress</h4>' +
      '<div class="row"><span class="k">Levels gained</span><b>+' + mine.lv + '</b></div>' +
      '<div class="row"><span class="k">Gold earned</span><b>+' + fmt(mine.gold) + '</b></div>' +
      '<div class="row"><span class="k">Gear score</span><b>+' + fmt(mine.gs) + '</b></div>' +
      '<div class="row"><span class="k">Upgrades equipped</span><b>' + mine.items + '</b></div>';
  } else {
    h += '<div class="tiny center" style="padding:12px">Auto Quest was off, so you earned nothing while away.<br>' +
      'Leave <b style="color:var(--gold)">AUTO QUEST</b> on to keep climbing offline.</div>';
  }
  const hof = hallOfFame(5);
  h += '<h4 class="sec">Top of the world right now</h4>';
  hof.forEach((r, i) => {
    h += '<div class="row"><span class="k">' + (i + 1) + '. ' + esc(r.n) + (r.isPlayer ? ' (you)' : '') + '</span><b>Lv ' + r.lv + '</b></div>';
  });
  h += '<div class="tiny center" style="margin-top:10px">Season ' + SEASON.num + ' ends in <b style="color:var(--gold)">' + dur(seasonLeft()) + '</b></div>';
  openModal('Welcome Back', h);
  sfx('questdone', .9);
}

/* ------------------------------ MAIN LOOP ------------------------------ */
let lastFrame = 0, fpsAcc = 0, fpsN = 0, autoSampleT = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  if (!G.started || R.lost) return;
  if (!lastFrame) lastFrame = ts;
  let dt = (ts - lastFrame) / 1000;
  lastFrame = ts;
  if (dt > 0.1) dt = 0.1;
  if (dt <= 0) dt = 1 / 60;
  G.dt = dt; G.t += dt; R.time = G.t;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { R.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

  const p = G.player;

  // ---- day / night ----
  G.tod = (G.tod + dt / DAY_LEN) % 1;
  sunDir(G.tod, R.sun);
  R.sky = skyColors(G.tod);
  if (R.sun[1] < 0.06) {   // moonlight: flip the light so nights still read
    R.sun[0] = -R.sun[0]; R.sun[1] = Math.max(0.22, -R.sun[1]); R.sun[2] = -R.sun[2];
    const l = Math.hypot(R.sun[0], R.sun[1], R.sun[2]) || 1;
    R.sun[0] /= l; R.sun[1] /= l; R.sun[2] /= l;
  }

  // ---- input ----
  const keys = G.keys || {};
  if (!p.autoOn) {
    let kx = 0, kz = 0;
    if (keys.KeyW || keys.ArrowUp) kz += 1;
    if (keys.KeyS || keys.ArrowDown) kz -= 1;
    if (keys.KeyA || keys.ArrowLeft) kx -= 1;
    if (keys.KeyD || keys.ArrowRight) kx += 1;
    if (kx || kz) {
      const cy = G.camYaw;
      INPUT.mx = Math.sin(cy) * kz + Math.cos(cy) * kx;
      INPUT.mz = Math.cos(cy) * kz - Math.sin(cy) * kx;
      INPUT.sprint = !!keys.ShiftLeft || INPUT.sprintToggle;
    } else if (INPUT.stickId < 0) { INPUT.mx = 0; INPUT.mz = 0; }
    if (INPUT.sprintToggle) INPUT.sprint = true;
  }

  // ---- simulate ----
  if (!G.paused) {
    AUTO.update(dt, p);
    updatePlayer(dt, INPUT);
    INPUT.jump = false;
    updateWorld(dt);
    raidTick(dt);
    metaTick(dt);
    updateParticles(dt);
    autoSampleT -= dt;
    if (autoSampleT <= 0) { autoSampleT = 1; AUTO.sample(p); }
  }
  updateCamera(dt, p);

  // ---- render ----
  R.flash = Math.max(0, R.flash - dt * 2.2);
  renderScene(G.cam, dt);
  drawOverlay();
  drawMinimap(dt);
  updateHUD(dt);
  if (PANEL && (R.frame % 30) === 0 && (PANEL === 'hof' || PANEL === 'social' || PANEL === 'guild')) {
    // live leaderboards refresh while you watch them
    if ($('ptabs').firstChild && $('ptabs').firstChild.dataset.act !== 'back') renderPanel();
  }
  if (PANEL === 'map' && $('bigmap')) drawBigMap();
}

/* ------------------------------ BIG MAP ------------------------------ */
let bigMapT = 0;
function drawBigMap() {
  bigMapT -= G.dt; if (bigMapT > 0) return; bigMapT = 0.3;
  const cv = $('bigmap'); if (!cv) return;
  const g = cv.getContext('2d'), S = cv.width;
  g.clearRect(0, 0, S, S);
  if (mmBase) g.drawImage(mmBase, 0, 0, S, S);
  const w2 = (x, z) => [(x + WORLD_HALF) / WORLD_SIZE * S, (z + WORLD_HALF) / WORLD_SIZE * S];
  g.strokeStyle = 'rgba(150,125,85,.5)'; g.lineWidth = 1.6;
  for (const s of ROADS) { const a = w2(s.ax, s.az), b = w2(s.bx, s.bz); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  // zone labels
  g.font = '700 11px Trebuchet MS,sans-serif'; g.textAlign = 'center';
  for (const z of DB.zones) {
    const m = w2(z.cx, z.cz);
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillText(z.n, m[0] + 1, m[1] + 1);
    g.fillStyle = '#efe6cf'; g.fillText(z.n, m[0], m[1]);
    g.fillStyle = 'rgba(240,194,87,.75)'; g.font = '9px Trebuchet MS,sans-serif';
    g.fillText('lv ' + z.lvMin + '–' + z.lvMax, m[0], m[1] + 12);
    g.font = '700 11px Trebuchet MS,sans-serif';
  }
  // adventurers
  g.fillStyle = 'rgba(90,208,255,.85)';
  for (const r of ROSTER) { const m = w2(r.x, r.z); g.fillRect(m[0] - 1, m[1] - 1, 2, 2); }
  // POIs
  g.font = '12px sans-serif';
  for (const h of POI.hubs) { const m = w2(h.x, h.z); g.fillText('🏰', m[0], m[1] + 4); }
  for (const l of POI.portals) { const m = w2(l.x, l.z); g.fillText('🐉', m[0], m[1] + 4); }
  // player
  const m = w2(G.player.x, G.player.z);
  g.fillStyle = '#f0c257'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(m[0], m[1], 5, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = '700 10px Trebuchet MS,sans-serif';
  g.fillText('YOU', m[0], m[1] - 8);
}

/* ------------------------------ GO ------------------------------ */
window.addEventListener('resize', () => { if (R.ok) onResize(); });
window.addEventListener('orientationchange', () => setTimeout(() => { if (R.ok) onResize(); }, 300));
window.addEventListener('error', e => {
  if (!G.started) return;
  console.error('runtime error', e.error || e.message);
});
document.addEventListener('DOMContentLoaded', bootUI);
if (document.readyState !== 'loading') bootUI();
