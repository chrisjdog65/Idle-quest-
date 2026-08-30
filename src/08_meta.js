/* =========================================================================
   IDLE QUEST — 08 META
   The living server: 1000 AI adventurers, 48 guilds, clan wars, raid nights,
   the world economy, the quest ledger, the Hall of Fame, and the seven-day
   season that wipes it all and crowns a Champion.
   ========================================================================= */

const POP = 1000;
const GUILD_COUNT = 48;
const SEASON_MS = 7 * 24 * 60 * 60 * 1000;      // one real week
const META_STEP = 0.5;                          // roster advance granularity (s)

const ROSTER = [];
const GUILDS = [];
const SEASON = { num: 1, start: 0, ended: false, champions: [], milestone: 0, ascended: [] };
/* During offline catch-up the clock is simulated, so timestamps must come from
   here rather than Date.now() or the ten-minute grace window is meaningless. */
let META_NOW = 0;
function metaNow() { return META_NOW || Date.now(); }
const MYTHIC_HOLDERS = new Set();
/* FIRST BLOOD: boss id -> who took it first. One hundred slots, one season, no retakes.
   The board never quite empties: the tier-8 lairs out in the high zones are usually
   still unclaimed when the crowns are read. */
const FIRSTS = {};
let FIRST_N = 0;
let metaAcc = 0, warT = 180, tradeT = 40, worldEventT = 300;
/* RAID NIGHT: the raid your clan has called, and who answered. One at a time,
   world-wide, so it is an event rather than wallpaper. */
let RAID_CALL = null, raidCallT = 240;

/* ------------------------------ ROSTER ------------------------------ */
const AI_STATES = [
  { k: 'quest', n: 'questing', w: 34, xp: 1.00, gold: 1.00, q: 1, poi: 'camps' },
  { k: 'grind', n: 'grinding mobs', w: 18, xp: 1.12, gold: 1.15, q: 1, poi: 'camps' },
  { k: 'boss', n: 'hunting a world boss', w: 11, xp: 1.30, gold: 1.7, q: 3, poi: 'lairs' },
  { k: 'raid', n: 'in a raid', w: 9, xp: 1.45, gold: 2.3, q: 4, poi: 'portals' },
  { k: 'dungeon', n: 'clearing a dungeon', w: 10, xp: 1.22, gold: 1.5, q: 2, poi: 'ruins' },
  { k: 'pvp', n: 'in a clan skirmish', w: 5, xp: 0.85, gold: 1.2, q: 2, poi: 'ruins' },
  { k: 'trade', n: 'at the trade post', w: 5, xp: 0.10, gold: 2.6, q: 0, poi: 'hubs' },
  { k: 'town', n: 'resting in town', w: 4, xp: 0.05, gold: 0.2, q: 0, poi: 'hubs' },
  { k: 'travel', n: 'travelling', w: 4, xp: 0.30, gold: 0.3, q: 0, poi: 'hubs' },
];
const AI_W = AI_STATES.map(s => s.w);
const AI_STATE_BY = {}; AI_STATES.forEach(s => AI_STATE_BY[s.k] = s);

/* Deliberately the same shape as the player's own kills-per-level curve, so a
   player who leaves Auto Quest running is genuinely competitive with the field
   and the very best AI (high skill roll) still finishes ahead of them. */
function levelRate(L, eff) { return 0.045 * eff / (1 + L / 25); }
function recGearScore(rec) {
  let s = 0;
  for (let i = 0; i < 15; i++) {
    if (!rec.gt[i]) continue;
    s += rec.gi[i] * 1.15 * SLOTS[i].w * RARITY[rec.gt[i] - 1].mult * 2.1;
  }
  return Math.round(s);
}
function recBestTier(rec) { let t = -1; for (let i = 0; i < 15; i++) if (rec.gt[i] - 1 > t) t = rec.gt[i] - 1; return t; }

function buildRoster(seed) {
  ROSTER.length = 0; GUILDS.length = 0; MYTHIC_HOLDERS.clear();
  const rng = new RNG(seed);
  const used = new Set();
  // ---- guilds ----
  for (let i = 0; i < GUILD_COUNT; i++) {
    let n; let guard = 0;
    do { n = '<' + rng.pick(GUILD_A) + ' ' + rng.pick(GUILD_B) + '>'; } while (used.has(n) && guard++ < 60);
    used.add(n);
    GUILDS.push({
      i, n, members: [], respect: 0, wins: 0, losses: 0, raids: 0, bosses: 0,
      motto: rng.pick(['No survivors.', 'For the season.', 'We do not kneel.', 'Loot first, ask later.',
        'Dawn finds us standing.', 'Every wipe is a lesson.', 'Bring your own repair bill.',
        'One more pull.', 'The world owes us nothing.', 'Ascend or perish.']),
      col: rng.pick(['#e0492f', '#4aa3f0', '#54c46a', '#f0c257', '#b45ef0', '#f07ab4', '#5ee0d0', '#e07a3c']),
      founded: 0, playerGuild: false,
    });
  }
  // ---- adventurers ----
  const nameSet = new Set();
  for (let i = 0; i < POP; i++) {
    let n; let guard = 0;
    do { n = randName(rng); if (nameSet.has(n)) n = n + rng.ri(2, 99); } while (nameSet.has(n) && guard++ < 40);
    nameSet.add(n);
    const cls = rng.pick(CLASSES).id;
    const skill = clamp(0.55 + rng.g() * 0.22 + (i < 40 ? 0.30 : 0), 0.30, 1.55);
    const zone = DB.zones[0];
    const rec = {
      i, n, c: cls, lv: 1, lp: 0, gs: 0, gold: rng.ri(0, 40),
      gt: new Array(15).fill(0), gi: new Array(15).fill(0),
      g: -1, st: 'quest', act: rng.r(4, 40), skill,
      x: 0, z: 0, tx: 0, tz: 0,
      respect: 0, kills: 0, quests: 0, bosses: 0, raids: 0, deaths: 0, pvp: 0,
      gen: clamp(0.15 + rng.f() * 0.8, 0.05, 0.98),   // how giving they are
      rel: 0, asked: 0,                               // how they feel about you
      best: -1, av: null, title: rng.chance(.14) ? rng.pick(TITLE_BANK) : '',
      sk: rng.i(SKIN.length), hr: rng.i(HAIRC.length), z2: 0, online: 1,
      hof: 0, mythicAt: 0,
    };
    // scatter across the low-level zones so a fresh season looks busy, not clumped
    const startZones = [DB.zones[0], DB.zones[1], DB.zones[4]].filter(Boolean);
    const sz = rng.pick(startZones);
    const camps = POI.camps.filter(c => c.zone === sz.id);
    const anchor = camps.length && rng.chance(.6) ? rng.pick(camps) : { x: sz.hx, z: sz.hz };
    rec.x = clamp(anchor.x + rng.r(-90, 90), -WORLD_HALF + 30, WORLD_HALF - 30);
    rec.z = clamp(anchor.z + rng.r(-90, 90), -WORLD_HALF + 30, WORLD_HALF - 30);
    rec.z2 = sz.id;
    rec.tx = rec.x; rec.tz = rec.z;
    ROSTER.push(rec);
  }
  // ---- assign guilds (leave ~14% unguilded so recruiting means something) ----
  const shuffled = ROSTER.slice(); rng.shuffle(shuffled);
  let gi = 0;
  for (let i = 0; i < shuffled.length; i++) {
    if (rng.chance(.14)) continue;
    const g = GUILDS[gi % GUILD_COUNT];
    if (g.members.length >= 30) { gi++; continue; }
    g.members.push(shuffled[i].i);
    shuffled[i].g = g.i;
    if ((i & 7) === 7) gi++;
  }
  for (const g of GUILDS) if (!g.members.length) g.members.push(ROSTER[(rng.i(POP))].i);
}

/* ------------------------------ ROSTER ADVANCE ------------------------------ */
const _mrng = new RNG(12345);
function advanceRec(rec, dt, fast) {
  if (!rec.online) return;
  rec.act -= dt;
  if (rec.act <= 0) {
    const s = _mrng.wpick(AI_STATES, AI_W);
    rec.st = s.k;
    rec.act = _mrng.r(22, 110);
    // pick a destination appropriate to the activity and their level
    const pool = POI[s.poi] || POI.camps;
    let best = null, bs = -1;
    for (let t = 0; t < 6; t++) {
      const p = pool[_mrng.i(pool.length)];
      const zn = DB.zones[p.zone];
      const fit = 1 - Math.min(1, Math.abs(rec.lv - (zn.lvMin + zn.lvMax) / 2) / 60);
      const sc = fit + _mrng.f() * .35;
      if (sc > bs) { bs = sc; best = p; }
    }
    if (best) {
      rec.tx = best.x + _mrng.r(-18, 18); rec.tz = best.z + _mrng.r(-18, 18); rec.z2 = best.zone;
      // the lair already carries its boss id; it used to be picked and thrown away
      rec.tgtBoss = (s.k === 'boss' && best.boss != null) ? best.boss : null;
    }
  }
  const S = AI_STATE_BY[rec.st] || AI_STATES[0];
  const eff = rec.skill * (0.72 + Math.min(1.0, rec.gs / Math.max(1, refPrimary(rec.lv) * 5.2)) * 0.55) * S.xp;
  rec.lp += levelRate(rec.lv, eff) * dt;
  const lvBefore = rec.lv;
  while (rec.lp >= 1) { rec.lp -= 1; rec.lv++; }
  if (lvBefore < ASCEND_LEVEL && rec.lv >= ASCEND_LEVEL) tryAscend(rec, fast);
  rec.gold += (2.4 + rec.lv * 1.15) * S.gold * dt * 0.32;
  rec.kills += S.xp * dt * 0.42;
  if (S.k === 'quest') rec.quests += dt * 0.055;
  if (S.k === 'boss') {
    rec.bosses += dt * 0.010;
    /* FIRST BLOOD. Only hunters who have actually out-levelled their boss can take it,
       so the race is decided by who gets there first -- not by who was born with the
       best skill roll. Skill is weighted deliberately mildly (FB.SKILL) or the forty
       elite records at indices 0-39 take most of the hundred. Exponential form so a
       600-second offline step and a 0.5-second live step give the same expected pace. */
    if (rec.tgtBoss != null && !FIRSTS[rec.tgtBoss]) {
      const bd = DB.bosses[rec.tgtBoss];
      if (bd && rec.lv >= bd.lv) {
        const over = Math.min(FB.OVERMAX, (rec.lv - bd.lv) / FB.OVER);
        const tier = Math.floor(rec.tgtBoss / 12);
        const rate = FB.RATE * (1 - FB.SKILL + rec.skill * FB.SKILL) * (0.5 + over)
          / (1 + tier * FB.TIER);
        if (_mrng.f() < 1 - Math.exp(-rate * dt)) claimFirst(rec.tgtBoss, rec, fast);
      }
    }
  }
  if (S.k === 'raid') rec.raids += dt * 0.0042;
  if (S.k === 'pvp' && _mrng.chance(dt * 0.02)) rec.pvp++;
  rec.respect += dt * 0.06 * (1 + rec.lv / 90) * S.xp;

  // ---- loot rolls ----
  /* One Bernoulli trial per call, however long the step. At metaOffline's coarse steps
     (30-600 s) the rate is 1.6-33, so a single roll saturated at "one drop chance per
     step" and an offline world came back with a third of a live world's gear. Roll the
     expected count instead, capped so one step cannot re-gear a whole character. */
  let lootN = 0;
  { let r = 0.055 * S.xp * dt;
    while (r >= 1 && lootN < 6) { lootN++; r -= 1; }
    if (_mrng.f() < r) lootN++; }
  for (let lr = 0; lr < lootN; lr++) {
    const slot = _mrng.i(15);
    let tier = rollTier(_mrng, S.q, rec.skill * 0.25);
    if (tier >= 5) tier = 4;                   // Mythic is awarded, never dropped
    const ilvl = Math.max(1, Math.round(rec.lv * 2.45 + _mrng.r(-6, 10) + tier * 3));
    const newScore = ilvl * 1.15 * SLOTS[slot].w * RARITY[tier].mult * 2.1;
    const oldScore = rec.gt[slot] ? rec.gi[slot] * 1.15 * SLOTS[slot].w * RARITY[rec.gt[slot] - 1].mult * 2.1 : 0;
    if (newScore > oldScore) {
      rec.gt[slot] = tier + 1; rec.gi[slot] = ilvl;
      rec.gs = recGearScore(rec);
      const bt = recBestTier(rec);
      if (bt > rec.best) {
        rec.best = bt;
        // (a call to a claimMythic() that never existed lived here -- Mythic seats
        //  belong to tryAscend alone, and a tier-5 drop cannot roll anyway)
        if (!fast && bt >= 4 && bt < 5) {
          chatPush('loot', '[' + rec.n + ']: Legendary drop — ' + LEGEND_NAMES[_mrng.i(LEGEND_NAMES.length)] + '!');
        }
      }
    }
  }
  // deaths happen; they cost gold, never levels
  if (_mrng.f() < 0.0025 * dt * (2 - rec.skill)) { rec.deaths++; rec.gold *= 0.97; }
  // guild contribution
  if (rec.g >= 0) GUILDS[rec.g].respect += dt * 0.06 * (1 + rec.lv / 90) * S.xp;

  // drift toward the destination when there is no avatar driving them
  if (!rec.av) {
    const dx = rec.tx - rec.x, dz = rec.tz - rec.z;
    const d = Math.hypot(dx, dz);
    if (d > 2) {
      const step = Math.min(d, 5.6 * dt);
      rec.x += dx / d * step; rec.z += dz / d * step;
    }
  }
}
/** Claim a world boss's first kill. `who` is a roster record, or null for the player. */
function claimFirst(bid, who, quiet) {
  if (bid == null || bid < 0 || FIRSTS[bid]) return false;
  const bd = DB.bosses[bid]; if (!bd) return false;
  const isPlayer = !who;
  const nm = isPlayer ? G.player.name : who.n;
  FIRST_N++;
  FIRSTS[bid] = { n: nm, i: isPlayer ? -1 : who.i, lv: isPlayer ? G.player.level : who.lv,
    at: metaNow(), place: FIRST_N, g: isPlayer ? (G.player.guild == null ? -1 : G.player.guild) : who.g };
  const title = 'First to ' + bd.n;
  if (isPlayer) {
    G.player.title = title;
    if (!quiet) {
      banner('FIRST BLOOD', bd.n + ', ' + bd.t);
      chatPush('kill', '\u2726 YOU are first to ' + bd.n + ' \u2014 ' + FIRST_N + ' of ' + DB.bosses.length + ' claimed');
      toast('<b style="color:#ffd766">FIRST BLOOD</b><div class="tiny">' + esc(bd.n) + ' \u00b7 nobody had killed it</div>', 'big');
      sfx('levelup', 1); R.flash = .6; R.flashCol = [1, .85, .5];
    }
  } else {
    who.title = title;
    if (!quiet) chatPush('kill', '\u2726 ' + nm + ' is first to ' + bd.n +
      (who.g >= 0 && GUILDS[who.g] ? ' ' + GUILDS[who.g].n : '') +
      ' \u2014 ' + FIRST_N + ' of ' + DB.bosses.length + ' claimed');
  }
  uiDirty.all = 1;
  return true;
}
/** How many firsts stand to one name. Used for the Trailblazer crown. */
function firstsBy(name) {
  let n = 0;
  for (const k in FIRSTS) if (FIRSTS[k].n === name) n++;
  return n;
}
function firstsLeaders() {
  const by = {};
  for (const k in FIRSTS) {
    const f = FIRSTS[k];
    if (!by[f.n]) by[f.n] = { n: f.n, c: 0, isPlayer: f.i === -1, g: f.g, first: f.place };
    by[f.n].c++;
    if (f.place < by[f.n].first) by[f.n].first = f.place;
  }
  return Object.keys(by).map(k => by[k]).sort((a, b) => (b.c - a.c) || (a.first - b.first));
}
function mythicAvailable(who) {
  if (MYTHIC_HOLDERS.size < MYTHIC_LIMIT) return true;
  return MYTHIC_HOLDERS.has(who === G.player ? -1 : who.i);
}
/** Dress a roster record in a full Mythic set at their current level. */
function grantMythicSetRec(rec) {
  const ilvl = mythicIlvl(rec.lv, SEASON.num);
  for (let i = 0; i < 15; i++) { rec.gt[i] = 6; rec.gi[i] = ilvl; }
  rec.gs = recGearScore(rec);
  rec.best = 5;
}
/** Dress the player in a full Mythic set; anything replaced goes to the bags. */
function grantMythicSetPlayer() {
  const p = G.player;
  const rng = new RNG(((Date.now() ^ (p.level * 7919)) & 0x7fffffff) | 1);
  const ilvl = mythicIlvl(p.level, SEASON.num);
  for (const k of SLOT_KEYS) {
    const it = genItem(rng, ilvl, 5, k, p.cls);
    const old = p.gear[k];
    p.gear[k] = it;
    if (old && p.bags.length < p.bagMax) p.bags.push(old);
  }
  p.mythic = 1;
  p.st = calcStats(p); p.resMax = resourceMax(p); p.hp = p.st.hpMax;
  styleFromGear(p, p.gear, p.cls);
  uiDirty.bag = 1;
}
/** The race prize: the first three to ASCEND_LEVEL are crowned Ascendants. */
function tryAscend(who, quiet) {
  const isPlayer = who === G.player;
  const key = isPlayer ? -1 : who.i;
  if (MYTHIC_HOLDERS.has(key)) return false;
  if (MYTHIC_HOLDERS.size >= MYTHIC_LIMIT) return false;
  MYTHIC_HOLDERS.add(key);
  const place = MYTHIC_HOLDERS.size;
  const nm = isPlayer ? G.player.name : who.n;
  if (isPlayer) grantMythicSetPlayer(); else { who.mythicAt = metaNow(); grantMythicSetRec(who); }
  SEASON.ascended.push({ n: nm, place, lv: who.lv || (isPlayer ? G.player.level : 0), at: metaNow(), isPlayer });
  const ord = ['first', 'second', 'third'][place - 1] || place + 'th';
  const mp = Math.round((mythicPower(SEASON.num) - 1) * 100);
  chatPush('world', '\u2605 ' + nm + ' is the ' + ord + ' adventurer to reach level ' + ASCEND_LEVEL +
    ' \u2014 ASCENDANT, clad in Mythic' + (mp > 0 ? ' of the ' + ordinal(SEASON.num) + ' Forging (+' + mp + '%)' : '') +
    '. ' + (MYTHIC_LIMIT - place) + ' seat(s) left.');
  if (isPlayer) { banner('ASCENDANT', 'Level ' + ASCEND_LEVEL + ' \u2014 you are Ascendant #' + place); R.flash = 1; R.flashCol = [1, .3, .4]; }
  else if (!quiet) toast('<b class="q5">ASCENDANT</b><div class="tiny">' + esc(nm) + ' reached level ' + ASCEND_LEVEL + ' \u2014 seat ' + place + ' of ' + MYTHIC_LIMIT + '</div>', 'sys');

  if (place >= MYTHIC_LIMIT && !SEASON.milestone) {
    SEASON.milestone = metaNow();
    chatPush('world', '\u2554\u2550 ALL ' + MYTHIC_LIMIT + ' ASCENDANT SEATS CLAIMED \u2014 the season ends in ' +
      Math.round(SEASON_GRACE_MS / 60000) + ' minutes \u2550\u2557');
    if (!quiet) {
      banner('FINAL ' + Math.round(SEASON_GRACE_MS / 60000) + ' MINUTES', 'Last push \u2014 level and gear crowns are decided now'); sfx('roar', 1);
      // the augury: your odds of walking out of the Overlord, measured by the real model
      const odds = ovSurvivalOdds();
      chatPush('sys', 'The augurs cast your fate against the Overlord: you walk away in ' +
        Math.round(odds * 100) + '% of the tellings. Gear up.');
    }
  }
  return true;
}
function metaCanMythic(p) { return mythicAvailable(p); }
function metaClaimMythic(p) { return tryAscend(p); }

/* ------------------------------ TICK ------------------------------ */
function metaTick(dt) {
  /* While the Overlord holds, the world stops. The finale was resolved against a snapshot
     of the roster; letting it keep levelling and looting underneath the result screen
     would leave the survivor list disagreeing with the leaderboard beside it. */
  if (ovIsActive()) { ovAckTick(dt); return; }
  metaAcc += dt;
  let steps = 0;
  while (metaAcc >= META_STEP && steps++ < 4) {
    metaAcc -= META_STEP;
    for (let i = 0; i < ROSTER.length; i++) advanceRec(ROSTER[i], META_STEP, false);
  }
  if (metaAcc > META_STEP * 8) metaAcc = 0;

  // ---- clan wars ----
  warT -= dt;
  if (warT <= 0) { warT = 150 + Math.random() * 200; runClanWar(); }
  // ---- trade chatter & offers ----
  tickConvo(dt);
  tradeT -= dt;
  if (tradeT <= 0) {
    tradeT = 22 + Math.random() * 40;
    postTradeOffer(); pruneOffers();
    if (Math.random() < .45) makeIncomingOffer();
    if (Math.random() < .30) aiAskPlayer();
  }
  // ---- raid night ----
  raidCallT -= dt;
  if (raidCallT <= 0) {
    raidCallT = RN.CALL_MIN + Math.random() * (RN.CALL_MAX - RN.CALL_MIN);
    if (!RAID_CALL && !G.inRaid) callRaid();
  }
  // a call nobody answered in time resolves itself as news
  if (RAID_CALL && !G.inRaid && metaNow() > RAID_CALL.at + 180000) resolveCalledRaid();
  // ---- world events ----
  worldEventT -= dt;
  if (worldEventT <= 0) { worldEventT = 240 + Math.random() * 300; worldEvent(); }
  // ---- season clock ----
  checkSeason();
}
/** Fast-forward the whole server by `ms` of real time (used on load). */
function metaOffline(ms) {
  const secs = Math.min(ms / 1000, SEASON_MS / 1000);
  if (secs < 5) return null;
  const step = secs > 86400 ? 600 : secs > 3600 ? 240 : 30;
  const n = Math.min(Math.ceil(secs / step), 4200);
  const realStep = secs / n;
  const startTs = Date.now() - secs * 1000;
  for (let s = 0; s < n; s++) {
    META_NOW = startTs + s * realStep * 1000;      // simulated wall clock
    for (let i = 0; i < ROSTER.length; i++) advanceRec(ROSTER[i], realStep, true);
    if ((s % 12) === 0) runClanWar(true);
    if ((s % 9) === 0) { if (RAID_CALL) resolveCalledRaid(); callRaid(); }
    if (SEASON.milestone && META_NOW > SEASON.milestone + SEASON_GRACE_MS) break;
    if (META_NOW > SEASON.start + SEASON_MS) break;   // the 7-day backstop ends the roster's season too
  }
  META_NOW = 0;
  // scatter everyone to sensible places so the world looks lived-in on return
  for (const rec of ROSTER) {
    const pool = POI.camps;
    let best = pool[(Math.random() * pool.length) | 0];
    for (let t = 0; t < 5; t++) {
      const p = pool[(Math.random() * pool.length) | 0];
      const zn = DB.zones[p.zone];
      if (Math.abs(rec.lv - (zn.lvMin + zn.lvMax) / 2) < Math.abs(rec.lv - (DB.zones[best.zone].lvMin + DB.zones[best.zone].lvMax) / 2)) best = p;
    }
    rec.x = best.x + (Math.random() - .5) * 60; rec.z = best.z + (Math.random() - .5) * 60;
    rec.tx = rec.x; rec.tz = rec.z; rec.z2 = best.zone;
  }
  return { secs };
}

/* ------------------------------ CLAN WARS ------------------------------ */
const WAR_LOG = [];
function guildPower(g) {
  let p = 0;
  for (const mi of g.members) {
    const r = ROSTER[mi]; if (!r) continue;
    p += r.lv * 12 + r.gs * 0.5;
  }
  if (g.playerGuild && G.player) p += G.player.level * 12 + (G.player.st ? G.player.st.gs * 0.5 : 0);
  return p;
}
function runClanWar(quiet) {
  if (GUILDS.length < 2) return;
  const a = GUILDS[(Math.random() * GUILDS.length) | 0];
  let b = GUILDS[(Math.random() * GUILDS.length) | 0];
  let guard = 0;
  while (b === a && guard++ < 10) b = GUILDS[(Math.random() * GUILDS.length) | 0];
  if (a === b) return;
  const pa = guildPower(a), pb = guildPower(b);
  const chance = pa / (pa + pb + 1e-6);
  const aWins = Math.random() < chance;
  const w = aWins ? a : b, l = aWins ? b : a;
  const stake = Math.round(40 + Math.min(pa, pb) * 0.02);
  w.wins++; l.losses++;
  w.respect += stake; l.respect = Math.max(0, l.respect - stake * 0.4);
  WAR_LOG.unshift({ t: metaNow(), w: w.n, l: l.n, s: stake, wi: w.i, li: l.i });
  if (WAR_LOG.length > 60) WAR_LOG.pop();
  if (!quiet) {
    chatPush('world', '⚑ CLAN WAR — ' + w.n + ' defeated ' + l.n + ' (+' + stake + ' respect)');
    if (G.player && G.player.guild != null) {
      if (w.i === G.player.guild) { toast('<b style="color:var(--grn)">Your clan won a war!</b> +' + stake + ' respect', 'sys'); sfx('questdone', .7); G.player.respect += Math.round(stake * .3); }
      else if (l.i === G.player.guild) { toast('<b style="color:var(--red)">Your clan lost a war</b> against ' + esc(w.n), 'sys'); }
    }
  }
}

/* ------------------------------ TRADE ------------------------------ */
const TRADE_BOARD = [];
function postTradeOffer() {
  const rng = new RNG((Math.random() * 1e9) | 0);
  const seller = ROSTER[rng.i(ROSTER.length)];
  if (!seller) return;
  const tier = rng.wpick([0, 1, 2, 3, 4], [.24, .34, .26, .13, .03]);
  const ilvl = Math.max(1, Math.round(seller.lv * 2.45 + rng.r(-10, 14)));
  const it = genItem(rng, ilvl, tier, rng.pick(SLOT_KEYS), G.player ? G.player.cls : 'warrior');
  const price = Math.round(it.val * rng.r(0.85, 1.9));
  TRADE_BOARD.unshift({ it, price, seller: seller.n, sid: seller.i, t: Date.now(), id: (Math.random() * 1e9) | 0 });
  if (TRADE_BOARD.length > 34) TRADE_BOARD.pop();
  if (tier >= 3 && Math.random() < .5) chatPush('trade', '[' + seller.n + ']: WTS [' + it.n + '] ' + fmt(price) + 'g');
}
function buyTrade(idx) {
  const p = G.player, o = TRADE_BOARD[idx];
  if (!o) return false;
  if (p.gold < o.price) { toast('Not enough gold.', 'sys'); sfx('error', .7); return false; }
  p.gold -= o.price;
  giveItem(p, o.it);
  const s = ROSTER[o.sid]; if (s) s.gold += o.price;
  TRADE_BOARD.splice(idx, 1);
  sfx('coin', 1);
  chatPush('trade', 'You bought [' + o.it.n + '] from ' + o.seller + ' for ' + fmt(o.price) + 'g');
  return true;
}
/* Adventurers also come to you: a real offer on something in your bags. */
const OFFERS = [];
function makeIncomingOffer() {
  const p = G.player;
  if (!p || !p.bags.length) return;
  // offer on the best thing in the bag, and shop around for a buyer who can pay
  let idx = 0;
  for (let i = 1; i < p.bags.length; i++) if (p.bags[i].val > p.bags[idx].val) idx = i;
  const it = p.bags[idx];
  if (it.t < 1) return;
  let buyer = null;
  for (let t = 0; t < 12; t++) {
    const c = ROSTER[(Math.random() * ROSTER.length) | 0];
    if (c && c.gold >= it.val * 1.2) { buyer = c; break; }
  }
  if (!buyer) return;
  const price = Math.round(it.val * (1.15 + Math.random() * 0.9));
  const o = { uid: it.u, price, buyer: buyer.n, bid: buyer.i, t: Date.now(), id: (Math.random() * 1e9) | 0 };
  OFFERS.unshift(o);
  if (OFFERS.length > 8) OFFERS.pop();
  chatPush('trade', '[' + buyer.n + '] whispers: I will pay ' + fmt(price) + 'g for your [' + it.n + ']');
  toast('<b style="color:#f0a63c">Trade offer</b><div class="tiny">' + esc(buyer.n) + ' offers ' + fmt(price) + 'g for <span class="q' + it.t + '">' + esc(it.n) + '</span></div>', 'sys');
  sfx('coin', .7);
}
function acceptOffer(oid) {
  const p = G.player;
  const oi = OFFERS.findIndex(o => o.id === oid);
  if (oi < 0) return false;
  const o = OFFERS[oi];
  const bi = p.bags.findIndex(b => b.u === o.uid);
  if (bi < 0) { OFFERS.splice(oi, 1); return false; }
  const it = p.bags[bi];
  p.bags.splice(bi, 1);
  giveGold(p, o.price);
  const b = ROSTER[o.bid]; if (b) b.gold = Math.max(0, b.gold - o.price);
  OFFERS.splice(oi, 1);
  p.stats.offersTaken = (p.stats.offersTaken || 0) + 1;
  sfx('coin', 1);
  chatPush('trade', 'You sold [' + it.n + '] to ' + o.buyer + ' for ' + fmt(o.price) + 'g');
  return true;
}
function pruneOffers() {
  const p = G.player; if (!p) return;
  for (let i = OFFERS.length - 1; i >= 0; i--) {
    if (Date.now() - OFFERS[i].t > 180000 || !p.bags.some(b => b.u === OFFERS[i].uid)) OFFERS.splice(i, 1);
  }
}
function sellToBoard(bagIdx) {
  const p = G.player, it = p.bags[bagIdx];
  if (!it) return false;
  const price = Math.round(it.val * (1.0 + Math.random() * .5));
  p.bags.splice(bagIdx, 1);
  giveGold(p, price);
  sfx('coin', 1);
  const buyer = ROSTER[(Math.random() * ROSTER.length) | 0];
  chatPush('trade', (buyer ? buyer.n : 'A merchant') + ' bought your [' + it.n + '] for ' + fmt(price) + 'g');
  return true;
}

/* ------------------------------ SOCIAL: GIVE & ASK ------------------------------ */
/* Adventurers have a generosity trait and remember how you have treated them.
   Ask one for gold and sometimes they hand it over, sometimes they tell you to
   get lost — and they will ask you for things right back. */

const CONVO = [];        // pending replies, resolved on game time so tabs can throttle
const PENDING = [];      // requests AI adventurers have made of you

const YES_GOLD = [
  'sure, grabbed plenty today. sending it over',
  'yeah np, pay it forward some time',
  'take it, i just cleared a raid',
  'ha, you caught me in a good mood',
  'fine fine, here. dont spend it all in the inn',
  'we are in the same clan basically. here',
];
const NO_GOLD = [
  'sorry, saving for a mount',
  'lol no',
  'i literally just repaired, im broke',
  'ask someone in a bigger clan',
  'nah im good thanks',
  'do i look like a bank',
  'maybe when you hit my level',
];
const YES_ITEM = [
  'actually yeah, this is dead weight for me. take it',
  'i replaced this an hour ago, all yours',
  'sure, its not my spec anyway',
  'here, dont sell it for 3g',
];
const NO_ITEM = [
  'cant, saving it for my offspec',
  'that one is bis for me sorry',
  'nothing spare right now',
  'i vendor everything, sorry',
  'i would but ive got nothing you could use',
];
const THANKS = ['thanks!! genuinely', 'oh nice, appreciate it', 'legend. ty', 'wasnt expecting that, cheers', 'ty ty ty'];
const AI_ASK_GOLD = [
  'hey, any chance you can spare {g}? repair bill is brutal',
  'short {g} for a mount, help a guy out?',
  'wtb {g} loan, ill pay back i promise',
  'got {g} spare? getting destroyed out here',
];
const AI_ASK_ITEM = [
  'saw your gear — got anything spare for a {c}?',
  'any old gear you dont need? im running greens still',
  'ill take literally any upgrade if youve got a spare',
];

function relOf(rec) { return rec.rel || 0; }
function convoSay(rec, text, kind) {
  chatPush(kind || 'say', '[' + rec.n + '] whispers: ' + text);
}
function queueReply(rec, secs, fn) { CONVO.push({ rec, t: secs, fn }); }
function tickConvo(dt) {
  for (let i = CONVO.length - 1; i >= 0; i--) {
    const c = CONVO[i];
    c.t -= dt;
    if (c.t <= 0) { CONVO.splice(i, 1); try { c.fn(); } catch (e) { console.warn(e); } }
  }
}

/** Gold an adventurer would plausibly part with. */
function askAmountFor(rec) {
  return Math.max(25, Math.round(Math.min(rec.gold * 0.18, 200 + rec.lv * 90)));
}
/** Ask an adventurer for gold. Sometimes yes, sometimes no — like a real player. */
function askForGold(rec) {
  const p = G.player;
  rec.asked = (rec.asked || 0) + 1;
  const amount = askAmountFor(rec);
  chatPush('say', '[You] whisper ' + rec.n + ': any chance you could spare some gold?');
  toast('<span class="tiny">' + esc(rec.n) + ' is typing…</span>', 'sys');
  queueReply(rec, 1.2 + Math.random() * 2.8, () => {
    const afford = rec.gold > amount * 2.2;
    let chance = 0.10 + rec.gen * 0.55 + clamp(relOf(rec), -1, 1) * 0.30;
    chance -= Math.min(0.45, (rec.asked - 1) * 0.18);           // pestering wears thin
    if (!afford) chance *= 0.25;
    if (Math.random() < chance) {
      rec.gold = Math.max(0, rec.gold - amount);
      giveGold(p, amount);
      rec.rel = relOf(rec) - 0.12;
      convoSay(rec, pickOf(YES_GOLD) + ' (+' + fmt(amount) + 'g)', 'trade');
      toast('<b style="color:var(--gold)">' + esc(rec.n) + ' sent you ' + fmt(amount) + 'g</b>', 'sys');
      sfx('coin', 1);
    } else {
      rec.rel = relOf(rec) - 0.05;
      convoSay(rec, pickOf(NO_GOLD));
      sfx('error', .5);
    }
    if (PANEL) renderPanel();
  });
}
/** Ask an adventurer for an item. */
function askForItem(rec) {
  const p = G.player;
  rec.asked = (rec.asked || 0) + 1;
  chatPush('say', '[You] whisper ' + rec.n + ': got any spare gear you could pass me?');
  toast('<span class="tiny">' + esc(rec.n) + ' is typing…</span>', 'sys');
  queueReply(rec, 1.4 + Math.random() * 3.2, () => {
    let chance = 0.06 + rec.gen * 0.42 + clamp(relOf(rec), -1, 1) * 0.32;
    chance -= Math.min(0.40, (rec.asked - 1) * 0.16);
    if (Math.random() < chance) {
      const rng = new RNG((Math.random() * 1e9) | 0);
      // they hand over something from their own level bracket, never their best
      const tier = rng.wpick([0, 1, 2, 3], [.18, .40, .32, .10]);
      const ilvl = Math.max(1, Math.round(rec.lv * 2.45 * rng.r(.72, .98)));
      const it = genItem(rng, ilvl, tier, rng.pick(SLOT_KEYS), p.cls);
      giveItem(p, it);
      rec.rel = relOf(rec) - 0.15;
      convoSay(rec, pickOf(YES_ITEM), 'trade');
      toast('<b style="color:var(--gold)">' + esc(rec.n) + ' sent you</b> <span class="q' + it.t + '">' + esc(it.n) + '</span>', 'sys');
    } else {
      rec.rel = relOf(rec) - 0.05;
      convoSay(rec, pickOf(NO_ITEM));
      sfx('error', .5);
    }
    if (PANEL) renderPanel();
  });
}
function pickOf(a) { return a[(Math.random() * a.length) | 0]; }

/** Send gold to an adventurer. They notice, and they remember. */
function sendGold(rec, amount) {
  const p = G.player;
  amount = Math.min(Math.floor(amount), p.gold);
  if (amount < 1) { toast('You have no gold to send.', 'sys'); sfx('error', .6); return false; }
  p.gold -= amount;
  rec.gold += amount;
  rec.rel = relOf(rec) + Math.min(0.6, amount / Math.max(400, p.gold + amount) * 1.4 + 0.12);
  p.stats.goldGiven = (p.stats.goldGiven || 0) + amount;
  chatPush('trade', 'You sent ' + fmt(amount) + 'g to ' + rec.n);
  sfx('coin', 1);
  queueReply(rec, 0.9 + Math.random() * 2.2, () => convoSay(rec, pickOf(THANKS), 'trade'));
  return true;
}
/** Send an item from your bags to an adventurer. */
function sendItem(rec, bagIdx) {
  const p = G.player, it = p.bags[bagIdx];
  if (!it) return false;
  p.bags.splice(bagIdx, 1);
  rec.rel = relOf(rec) + 0.18 + Math.min(0.4, it.t * 0.09);
  p.stats.itemsGiven = (p.stats.itemsGiven || 0) + 1;
  // it actually lands on them: if it beats what they have, they wear it
  const si = SLOT_BY[it.sl].i;
  const oldScore = rec.gt[si] ? rec.gi[si] * 1.15 * SLOTS[si].w * RARITY[rec.gt[si] - 1].mult * 2.1 : 0;
  const newScore = it.il * 1.15 * SLOTS[si].w * RARITY[it.t].mult * 2.1;
  let worn = false;
  if (newScore > oldScore) {
    rec.gt[si] = it.t + 1; rec.gi[si] = it.il; rec.gs = recGearScore(rec); worn = true;
    const nb = recBestTier(rec);
    if (nb > rec.best) rec.best = nb;    // or their next own upgrade re-announces your gift as their drop
  }
  else rec.gold += it.val;
  chatPush('trade', 'You sent [' + it.n + '] to ' + rec.n);
  sfx('coin', 1);
  queueReply(rec, 0.9 + Math.random() * 2.4, () =>
    convoSay(rec, worn ? pickOf(THANKS) + ' equipping it now' : pickOf(THANKS), 'trade'));
  uiDirty.bag = 1;
  return true;
}

/* ---- adventurers asking YOU for things ---- */
function aiAskPlayer() {
  const p = G.player;
  if (!p || PENDING.length > 3) return;
  const near = ROSTER.filter(r => V.dist2(r.x, r.z, p.x, p.z) < 220 * 220);
  const pool = near.length ? near : ROSTER;
  const rec = pool[(Math.random() * pool.length) | 0];
  if (!rec || rec.lv > p.level + 30) return;
  const wantItem = p.bags.length > 2 && Math.random() < 0.42;
  const amount = Math.max(50, Math.round((60 + p.level * 45) * (0.6 + Math.random())));
  if (!wantItem && p.gold < amount * 3) return;
  const msg = wantItem
    ? pickOf(AI_ASK_ITEM).replace('{c}', CLASS_BY[rec.c].n.toLowerCase())
    : pickOf(AI_ASK_GOLD).replace(/\{g\}/g, fmt(amount) + 'g');
  const req = { id: (Math.random() * 1e9) | 0, rid: rec.i, kind: wantItem ? 'item' : 'gold', amount, msg, t: Date.now() };
  PENDING.push(req);
  chatPush('say', '[' + rec.n + '] whispers: ' + msg);
  toast('<b style="color:#f0a63c">' + esc(rec.n) + '</b> <span class="tiny">' + esc(msg) + '</span>' +
    '<div class="tiny">Social → Whispers to answer</div>', 'sys');
  sfx('ui', .8, 1.4);
}
function answerRequest(id, accept) {
  const p = G.player;
  const i = PENDING.findIndex(r => r.id === id);
  if (i < 0) return false;
  const req = PENDING[i];
  const rec = ROSTER[req.rid];
  PENDING.splice(i, 1);
  if (!rec) return false;
  if (!accept) {
    rec.rel = relOf(rec) - 0.10;
    queueReply(rec, 0.8 + Math.random() * 1.6, () => convoSay(rec, pickOf(['all good, worth a shot', 'np', 'fair enough', 'cheers anyway'])));
    if (PANEL) renderPanel();
    return true;
  }
  if (req.kind === 'gold') { if (!sendGold(rec, req.amount)) return false; }
  else {
    // give away the least useful thing in the bag
    let worst = -1;
    for (let k = 0; k < p.bags.length; k++) {
      const cur = p.gear[p.bags[k].sl === 'ring2' ? 'ring1' : p.bags[k].sl];
      if (cur && p.bags[k].sc > cur.sc) continue;                 // never give an upgrade away
      if (worst < 0 || p.bags[k].sc < p.bags[worst].sc) worst = k;
    }
    if (worst < 0) { toast('Nothing spare to give.', 'sys'); sfx('error', .6); return false; }
    sendItem(rec, worst);
  }
  rec.rel = relOf(rec) + 0.25;
  if (PANEL) renderPanel();
  return true;
}

/* ------------------------------ WORLD EVENTS ------------------------------ */
const WORLD_EVENTS = [
  b => '⚔ ' + b.n + ' has awoken in ' + DB.zones[b.z].n + '!',
  b => '☠ A war band marches on ' + DB.zones[b.z].n + '.',
  b => '✦ Ley lines surge over ' + DB.zones[b.z].n + ' — bonus experience nearby.',
  b => '🜁 Merchant caravans have reached ' + DB.zones[b.z].hub + '.',
];
function worldEvent() {
  const b = DB.bosses[(Math.random() * DB.bosses.length) | 0];
  const f = WORLD_EVENTS[(Math.random() * WORLD_EVENTS.length) | 0];
  chatPush('world', f(b));
}

/* ------------------------------ GUILDS (player) ------------------------------ */
function joinGuild(gi) {
  const p = G.player, g = GUILDS[gi];
  if (!g) return false;
  if (p.guild != null) leaveGuild();
  p.guild = gi; g.playerGuild = true;
  chatPush('guild', 'You have joined ' + g.n + '. ' + g.motto);
  toast('Joined <b>' + esc(g.n) + '</b>', 'sys');
  sfx('questdone', .8);
  return true;
}
function leaveGuild() {
  const p = G.player;
  if (p.guild == null) return;
  const g = GUILDS[p.guild];
  if (g) g.playerGuild = false;
  chatPush('guild', 'You have left ' + (g ? g.n : 'your clan') + '.');
  p.guild = null;
}
function foundGuild(name) {
  const p = G.player;
  if (p.gold < 5000) { toast('Founding a clan costs 5,000g.', 'sys'); sfx('error', .7); return false; }
  p.gold -= 5000;
  const g = {
    i: GUILDS.length, n: '<' + name.replace(/[<>]/g, '').slice(0, 20) + '>', members: [], respect: 50,
    wins: 0, losses: 0, raids: 0, bosses: 0, motto: 'Founded by ' + p.name + '.',
    col: '#f0c257', founded: Date.now(), playerGuild: true,
  };
  // recruit a handful of unguilded adventurers
  let taken = 0;
  for (const r of ROSTER) {
    if (r.g >= 0 || taken >= 9) continue;
    r.g = g.i; g.members.push(r.i); taken++;
  }
  GUILDS.push(g);
  p.guild = g.i;
  chatPush('world', '⚑ ' + p.name + ' has founded ' + g.n + '!');
  toast('Founded <b>' + esc(g.n) + '</b> with ' + taken + ' recruits', 'sys');
  sfx('levelup', .8);
  return true;
}

/* ------------------------------ RAIDS ------------------------------ */
const RAID_LOCK = {};
function raidAvailable(r) {
  const p = G.player;
  if (p.level < r.lv) return 'Requires level ' + r.lv;
  const until = RAID_LOCK[r.id] || 0;
  if (Date.now() < until) return 'Locked ' + durShort(until - Date.now());
  return null;
}
/** A clan calls a raid. The player's own clan calls disproportionately often --
    it is the only one they can answer, and an event nobody can attend is wallpaper. */
function callRaid() {
  if (RAID_CALL || !GUILDS.length) return;
  const p = G.player;
  const mine = p && p.guild != null && GUILDS[p.guild] ? GUILDS[p.guild] : null;
  const g = (mine && Math.random() < 0.55) ? mine : GUILDS[(Math.random() * GUILDS.length) | 0];
  if (!g || !g.members.length) return;
  // the clan picks a raid it can actually clear: median member level decides
  const lv = g.members.map(i => ROSTER[i] ? ROSTER[i].lv : 1).sort((a, b) => a - b)[g.members.length >> 1] || 1;
  const cands = DB.raids.filter(r => r.lv <= lv + 4 && r.lv >= lv - 45);
  if (!cands.length) return;
  const r = cands.sort((a, b) => b.lv - a.lv)[(Math.random() * Math.min(4, cands.length)) | 0];
  const share = RN.ANSWER_LO + Math.random() * (RN.ANSWER_HI - RN.ANSWER_LO);
  const answered = g.members.slice().sort(() => Math.random() - .5)
    .slice(0, Math.max(4, Math.round(g.members.length * share)));
  RAID_CALL = { gid: g.i, rid: r.id, at: metaNow() + RN.MUSTER * 1000, answered, done: 0,
    isMine: !!(mine && g.i === mine.i) };
  const line = g.n + ' CALL ' + r.n.toUpperCase() + ' — ' + answered.length + ' ANSWER';
  if (RAID_CALL.isMine) {
    chatPush('guild', '\u2694 ' + line + ' \u00b7 the doors open in ' + Math.round(RN.MUSTER / 60) + ' minutes');
    toast('<b style="color:#8fc6ff">RAID NIGHT</b><div class="tiny">' + esc(g.n) + ' call ' + esc(r.n) +
      '<br>' + answered.length + ' answer \u00b7 muster at the portal</div>', 'big');
    sfx('portal', .8);
  } else chatPush('world', '\u2694 ' + line);
}
/** Resolve a called raid the player did not attend, and report it as news. */
function resolveCalledRaid() {
  const C = RAID_CALL; if (!C) return;
  const g = GUILDS[C.gid], r = DB.raids[C.rid];
  RAID_CALL = null;
  if (!g || !r) return;
  const lv = C.answered.map(i => ROSTER[i] ? ROSTER[i].lv : 1);
  const avg = lv.reduce((a, b) => a + b, 0) / Math.max(1, lv.length);
  let alive = C.answered.length;
  for (let b = 0; b < r.bosses.length && alive > 0; b++) {
    const risk = raidEncounterRisk(r, DB.bosses[r.bosses[b]], avg);
    for (let k = alive - 1; k >= 0; k--) if (Math.random() < risk) alive--;
  }
  const cleared = alive > 0;
  if (cleared) {
    g.raids++; g.respect += r.respect;
    for (const i of C.answered) { const rec = ROSTER[i]; if (rec) rec.raids++; }
    chatPush('world', '\ud83c\udfc6 ' + g.n + ' cleared ' + r.n + ' \u2014 ' + alive + ' of ' +
      C.answered.length + ' walked out');
  } else {
    chatPush('world', '\u2620 ' + g.n + ' wiped in ' + r.n);
    RAID_LOCK[r.id] = Date.now() + r.lock;
  }
}
/** How much of a party an encounter takes. Level deficit is what kills. */
function raidEncounterRisk(r, bd, avgLv) {
  const deficit = Math.max(0, (bd ? bd.lv : r.lv) - avgLv);
  return clamp(RN.RISK + deficit / RN.RISKLV * 0.28 + r.tier * 0.006, 0.012, RN.RISKMAX);
}
function startRaid(rid) {
  const p = G.player, r = DB.raids[rid];
  const err = raidAvailable(r);
  if (err) { toast(err, 'sys'); sfx('error', .7); return false; }
  G.inRaid = { r, boss: 0, hp: 0, t: 0, killed: 0, loot: [], cur: null, nextT: 0,
    allies: [], aliveN: 0, wentN: 0, fallen: [], deathQ: [] };
  RAID_LOCK[r.id] = Date.now() + r.lock;
  panelClose();
  // teleport to the portal so the fight happens in the world
  p.x = r.x + 6; p.z = r.zz + 6; p.y = groundH(p.x, p.z);
  raidMuster(r);
  const R2 = G.inRaid;
  banner(r.n, R2.wentN ? R2.wentN + ' went in together' : r.bosses.length + ' encounters, alone');
  chatPush('guild', R2.wentN
    ? 'You have entered ' + r.n + ' with ' + R2.wentN + ' of your clan.'
    : 'You have entered ' + r.n + ' alone.');
  musicSet('raid'); sfx('portal', 1);
  raidNextBoss();
  return true;
}
/* Who walks in with you. Your clan first -- that is the whole point -- and only
   if you have none does the world fill in. RN.VISIBLE of them get real bodies in
   a ring around the portal; the rest are carried by the counter, because MAX_AI is
   34 and every nameplate inside 78 m is sorted and occlusion-tested every frame. */
function raidMuster(r) {
  const p = G.player, R2 = G.inRaid;
  const called = RAID_CALL && RAID_CALL.isMine && RAID_CALL.rid === r.id ? RAID_CALL.answered : null;
  let pool = [];
  if (called) pool = called.slice();
  else if (p.guild != null && GUILDS[p.guild]) pool = GUILDS[p.guild].members.slice();
  if (!pool.length) {
    // no clan: the world sends whoever is near and of a level to survive it
    pool = ROSTER.filter(rec => Math.abs(rec.lv - Math.max(r.lv, p.level)) < 40)
      .sort(() => Math.random() - .5).slice(0, r.size - 1).map(rec => rec.i);
  }
  pool = pool.filter(i => ROSTER[i]).slice(0, Math.max(0, r.size - 1));
  R2.wentN = pool.length; R2.aliveN = pool.length;
  // strongest get the bodies, so the ring around you reads as your clan's best
  const ranked = pool.slice().sort((a, b) => ROSTER[b].lv - ROSTER[a].lv);
  const show = new Set(ranked.slice(0, RN.VISIBLE).map(i => i));
  for (const i of pool) {
    const rec = ROSTER[i];
    const a = Math.random() * TAU, rad = 5 + Math.random() * 7;
    let e = null;
    if (show.has(i)) {
      rec.x = p.x + Math.cos(a) * rad; rec.z = p.z + Math.sin(a) * rad;
      rec.tx = rec.x; rec.tz = rec.z;
      e = spawnAIAvatar(rec);
      if (e) e.raidAlly = 1;
    }
    R2.allies.push({ i, rec, e, dead: 0 });
  }
  if (R2.wentN) sfx('questdone', .7);
}
function raidNextBoss() {
  const R2 = G.inRaid; if (!R2) return;
  if (R2.boss >= R2.r.bosses.length) { finishRaid(true); return; }
  const bd = DB.bosses[R2.r.bosses[R2.boss]];
  const p = G.player;
  const a = Math.random() * TAU;
  const bx = p.x + Math.cos(a) * 18, bz = p.z + Math.sin(a) * 18;
  const clone = Object.assign({}, bd, { x: bx, z2: bz, lv: Math.max(bd.lv, R2.r.lv) });
  const e = spawnBoss(clone);
  e.raidBoss = 1; e.hpMax = Math.round(e.hpMax * (0.55 + R2.r.tier * 0.12)); e.hp = e.hpMax;
  e.st = 'chase';
  R2.cur = e;
  /* Roll this encounter's casualties ONCE, now, then spread them across it -- the
     same shape as the Overlord's tape, so what you watch is what actually happened
     and a reload cannot re-roll it. */
  const living = R2.allies.filter(a => !a.dead);
  if (living.length) {
    const avg = living.reduce((s, a) => s + a.rec.lv, 0) / living.length;
    const risk = raidEncounterRisk(R2.r, bd, avg);
    R2.deathQ = [];
    for (const a of living) {
      // your own level relative to the party carries a little of it: a strong
      // adventurer in a weak clan pulls people through
      const own = clamp(1 - (a.rec.lv - avg) / 60, 0.55, 1.5);
      if (Math.random() < risk * own) R2.deathQ.push({ a, at: 4 + Math.random() * 26 });
    }
    R2.deathQ.sort((x, y) => x.at - y.at);
    R2.encT = 0;
  }
  banner('ENCOUNTER ' + (R2.boss + 1) + '/' + R2.r.bosses.length, bd.n + ', ' + bd.t);
  sfx('roar', 1);
}
function finishRaid(cleared) {
  const R2 = G.inRaid; if (!R2) return;
  const p = G.player, r = R2.r;
  G.inRaid = null;
  if (RAID_CALL && RAID_CALL.rid === r.id && RAID_CALL.isMine) RAID_CALL = null;
  for (const a of R2.allies) if (a.e) { a.e.remove = 1; if (a.rec) a.rec.av = null; }
  AUTO.lastRaid = AUTO.t;
  AUTO.goalKind = ''; AUTO.committed = 0; AUTO.thinkT = 0;
  if (cleared) {
    p.stats.raidsDone++; p.raidKills += r.bosses.length;
    const gold = giveGold(p, r.gold * (1 + p.level * .05));
    giveXP(p, xpNeed(p.level) * 0.9);
    p.respect += r.respect;
    if (p.guild != null && GUILDS[p.guild]) { GUILDS[p.guild].respect += r.respect; GUILDS[p.guild].raids++; }
    const loot = rollLoot(p, Math.max(r.lv, p.level), r.lootTier, 2 + ((Math.random() * 3) | 0));
    for (const it of loot) giveItem(p, it);
    const out = R2.aliveN, went = R2.wentN;
    banner('RAID CLEARED', went
      ? out + ' of ' + went + ' walked out · +' + fmt(gold) + 'g'
      : r.n + ' · +' + fmt(gold) + 'g · +' + r.respect + ' respect');
    if (went) {
      const gname = p.guild != null && GUILDS[p.guild] ? GUILDS[p.guild].n : p.name + '\'s group';
      chatPush('world', '\ud83c\udfc6 ' + gname + ' cleared ' + r.n + ' — ' + out + ' of ' + went + ' walked out');
      if (R2.fallen.length) chatPush('guild', 'We lost ' + R2.fallen.map(f => f.n).join(', ') + '.');
      for (const a of R2.allies) if (!a.dead) a.rec.raids++;
    } else chatPush('world', '\ud83c\udfc6 ' + p.name + ' cleared ' + r.n + ' alone!');
    musicSet('victory');
    G.musicState = 'victory';
    G.victoryT = 16;
  } else {
    banner('RAID FAILED', R2.wentN ? R2.wentN - R2.aliveN + ' of ' + R2.wentN + ' fell with you' : r.n);
    const gname2 = p.guild != null && GUILDS[p.guild] ? GUILDS[p.guild].n : p.name + '\'s group';
    chatPush('world', '\u2620 ' + gname2 + ' wiped in ' + r.n);
  }
}
/* Encounter pacing runs on game time, not setTimeout: background tabs throttle
   timers, and a raid must not stall halfway through because of it. */
function raidTick(dt) {
  const R2 = G.inRaid; if (!R2) return;
  R2.t += dt;
  const p = G.player;
  if (p.dead) { finishRaid(false); return; }
  // allies fall at the times this encounter's roll gave them
  if (R2.cur && R2.deathQ && R2.deathQ.length) {
    R2.encT = (R2.encT || 0) + dt;
    while (R2.deathQ.length && R2.deathQ[0].at <= R2.encT) {
      const d = R2.deathQ.shift(), a = d.a;
      if (a.dead) continue;
      a.dead = 1; R2.aliveN--;
      R2.fallen.push({ n: a.rec.n, lv: a.rec.lv, at: Math.round(R2.t) });
      a.rec.deaths++;
      if (a.e && !a.e.dead) ovKillAvatar(a.e);
      // name them: an anonymous number falling is arithmetic, a name is a loss
      chatPush('guild', a.rec.n + ' is down.');
    }
  }
  if (R2.wentN && R2.aliveN <= 0 && R2.cur && !R2.cur.dead) {
    chatPush('guild', 'Everyone is down. You are the last one standing.');
    if (!R2.lastStand) { R2.lastStand = 1; banner('LAST ONE STANDING', R2.r.n); sfx('roar', .8); }
  }
  if (R2.cur && R2.cur.dead) {
    R2.boss++; R2.killed++; R2.cur = null; R2.nextT = 2.6;
    if (R2.boss >= R2.r.bosses.length) { finishRaid(true); return; }
  }
  if (!R2.cur) {
    R2.nextT = (R2.nextT || 0) - dt;
    if (R2.nextT <= 0) raidNextBoss();
    return;
  }
  if (V.dist(p.x, p.z, R2.r.x, R2.r.zz) > 190) finishRaid(false);
}

/* ------------------------------ QUESTS ------------------------------ */
const MAX_QUESTS = 12;
function questXP(level, type) { return Math.round(xpNeed(level) * 0.30 / (1 + level / 25) * (type === 'elite' ? 2.2 : 1)); }
function questGold(level, type) { return Math.round((18 + level * 5.5) * (type === 'elite' ? 2.4 : 1) * (0.8 + Math.random() * 0.5)); }
function availableQuests(p, zoneId) {
  const out = [];
  const zs = zoneId == null ? DB.zones.map(z => z.id) : [zoneId];
  for (const zi of zs) {
    const list = DB.byZone[zi] || [];
    for (const q of list) {
      if (p.done[q.id]) continue;
      if (p.quests.some(a => a.id === q.id)) continue;
      if (q.lv > p.level + 4) continue;
      if (q.lv < p.level - 22) continue;
      out.push(q);
    }
  }
  out.sort((a, b) => Math.abs(a.lv - p.level) - Math.abs(b.lv - p.level));
  return out;
}
function acceptQuest(p, qid) {
  if (p.quests.length >= MAX_QUESTS) { toast('Quest log full (' + MAX_QUESTS + ').', 'sys'); sfx('error', .6); return false; }
  if (p.done[qid] || p.quests.some(a => a.id === qid)) return false;
  const q = DB.quests[qid];
  p.quests.push({ id: qid, prog: 0 });
  sfx('quest', .8);
  toast('<b>Quest accepted</b><div class="tiny">' + esc(q.n) + '</div>', 'sys');
  uiDirty.tracker = 1;
  return true;
}
function abandonQuest(p, qid) {
  const i = p.quests.findIndex(a => a.id === qid);
  if (i >= 0) { p.quests.splice(i, 1); sfx('ui', .6); uiDirty.tracker = 1; }
}
function questProgress(p, type, targetName, amount) {
  let changed = false;
  for (const a of p.quests) {
    const q = DB.quests[a.id];
    if (!q || q.t !== type) continue;
    if (a.prog >= q.need) continue;
    let hit = false;
    if (type === 'kill' || type === 'elite') {
      hit = targetName && (targetName === q.tgt || targetName.indexOf(q.tgt) === 0);
    } else if (type === 'collect') {
      hit = Math.random() < 0.42;
    } else if (type === 'explore' || type === 'escort') {
      hit = targetName === q.tgt || (targetName && q.tgt && targetName.indexOf(q.tgt) >= 0);
    } else if (type === 'boss') {
      hit = true;
    }
    if (!hit) continue;
    a.prog = Math.min(q.need, a.prog + amount);
    changed = true;
    if (a.prog >= q.need) {
      sfx('questdone', .8);
      toast('<b style="color:var(--grn)">Objective complete</b><div class="tiny">' + esc(q.n) + '</div>', 'sys');
    }
  }
  if (changed) uiDirty.tracker = 1;
}
function turnInQuest(p, qid) {
  const i = p.quests.findIndex(a => a.id === qid);
  if (i < 0) return false;
  const a = p.quests[i], q = DB.quests[qid];
  if (a.prog < q.need) { toast('Objectives not complete.', 'sys'); sfx('error', .6); return false; }
  p.quests.splice(i, 1);
  p.done[qid] = 1; p.doneCount++; p.stats.questsDone++;
  const xp = questXP(p.level, q.t), gold = questGold(p.level, q.t);
  giveXP(p, xp); giveGold(p, gold);
  p.respect += 2;
  if (p.guild != null && GUILDS[p.guild]) GUILDS[p.guild].respect += 2;
  if (q.rew) {
    const it = rollLoot(p, p.level, q.t === 'elite' ? 3 : 2, 1)[0];
    giveItem(p, it);
  }
  sfx('questdone', 1);
  toast('<b style="color:var(--gold)">Quest complete</b><div class="tiny">' + esc(q.n) + ' · +' + fmt(xp) + ' xp · +' + fmt(gold) + 'g</div>', 'sys');
  burst(p.x, p.y + 1.2, p.z, 20, 2, 3, .3, 1, .85, .4, 0, 1);
  uiDirty.tracker = 1; uiDirty.quests = 1;
  return true;
}
/** How complete is this quest? Used by the tracker and the auto-play brain. */
function questState(p, a) {
  const q = DB.quests[a.id];
  return { q, done: a.prog >= q.need, prog: a.prog, need: q.need };
}

/* ------------------------------ HOOKS FROM GAMEPLAY ------------------------------ */
function metaOnPlayerLevel(lv) {
  chatPush('sys', 'You reached level ' + lv + '.');
  if (lv % 10 === 0) chatPush('world', '★ ' + G.player.name + ' has reached level ' + lv + '!');
}
function metaBossKilled(p, bd) {
  if (!bd) return;
  if (p.guild != null && GUILDS[p.guild]) { GUILDS[p.guild].bosses++; GUILDS[p.guild].respect += 12; }
  p.respect += 12;
}

/* ------------------------------ LEADERBOARDS ------------------------------ */
function playerAsRecord() {
  const p = G.player;
  const gt = new Array(15).fill(0), gi = new Array(15).fill(0);
  SLOT_KEYS.forEach((k, idx) => { const it = p.gear[k]; if (it) { gt[idx] = it.t + 1; gi[idx] = it.il; } });
  return {
    i: -1, n: p.name, c: p.cls, lv: p.level, gs: p.st ? p.st.gs : 0, gold: p.gold,
    gt, gi, g: p.guild == null ? -1 : p.guild, st: p.autoOn ? 'quest' : 'town',
    respect: p.respect, kills: p.kills, quests: p.doneCount, bosses: p.bossKills,
    raids: p.stats.raidsDone, deaths: p.deaths, pvp: 0, best: bestTierOf(p.gear),
    title: p.title || '', isPlayer: true, x: p.x, z: p.z,
  };
}
/* Level first, then gear, then the rest — "highest level, best gear, best
   overall stats", in that order. */
function hofScore(r) {
  return r.lv * 10000 + r.gs * 1.15 + r.best * 9000 +
    r.bosses * 40 + r.raids * 220 + r.quests * 8 + r.respect * 0.5;
}
function hallOfFame(limit) {
  const all = ROSTER.slice();
  if (G.player) all.push(playerAsRecord());
  all.sort((a, b) => hofScore(b) - hofScore(a));
  return all.slice(0, limit || 100);
}
function guildScore(g) {
  let lv = 0, gs = 0;
  for (const mi of g.members) { const r = ROSTER[mi]; if (r) { lv += r.lv; gs += r.gs; } }
  return g.respect * 2.2 + lv * 6 + gs * 0.12 + g.wins * 45 + g.raids * 30 + g.bosses * 8;
}
function guildHall(limit) {
  const gs = GUILDS.slice();
  gs.sort((a, b) => guildScore(b) - guildScore(a));
  return gs.slice(0, limit || 20);
}
function guildStats(g) {
  let lv = 0, gs = 0, best = -1, n = 0;
  for (const mi of g.members) {
    const r = ROSTER[mi]; if (!r) continue;
    lv += r.lv; gs += r.gs; if (r.best > best) best = r.best; n++;
  }
  if (g.playerGuild && G.player) { lv += G.player.level; gs += G.player.st.gs; n++; const b = bestTierOf(G.player.gear); if (b > best) best = b; }
  return { n, avgLv: n ? Math.round(lv / n) : 0, gs: Math.round(gs), best, power: Math.round(guildScore(g)) };
}

/* ------------------------------ SEASON ------------------------------ */
function seasonLeft() {
  const byClock = SEASON.start + SEASON_MS - Date.now();
  if (SEASON.milestone) return Math.max(0, Math.min(byClock, SEASON.milestone + SEASON_GRACE_MS - Date.now()));
  return Math.max(0, byClock);
}
/** True once the third Ascendant is crowned and the ten-minute clock is live. */
function seasonFinalCall() { return !!SEASON.milestone && !SEASON.ended; }
function checkSeason() {
  if (SEASON.ended) return;
  if (seasonLeft() > 0) return;
  endSeason();
}
/* ========================= THE OVERLORD: THE FINALE =========================
   Available in exactly one window: after the crowns are handed out and before the
   next season begins. It cannot be travelled to, ground, or retried.

   THE WHOLE FIGHT RESOLVES SYNCHRONOUSLY, in one pass, the instant the season ends.
   The 3D battle you watch afterwards is a replay of a tape that is already written.
   That is what makes watching it, idling through it and being asleep for it all
   produce the same answer, and what makes a reload mid-fight impossible to exploit. */
const ETERNAL = { p: [], ai: [] };      // the carry store: survives the wipe

/* Score the player through the SAME pipeline as the 1000. This matters more than it
   looks: p.st.hpMax comes from real item stamina at the player's real rarity multiplier
   while refHP hard-codes 1.55, and p.st.dps skips refDPS's /1.45 and carries versatility
   and mastery. Mixing the two bases hands a perfectly average player 1.64x the effective
   health and 2.58x the damage of an identically-geared adventurer -- which does not move
   the raid's outcome at all, but takes their personal survival from 2% to 34% and quietly
   ends the scarcity of the rarest item in the game. Nothing crashes. There is no symptom. */
function ovPlayerRecord() {
  const p = G.player, gt = new Array(15).fill(0), gi = new Array(15).fill(0);
  SLOT_KEYS.forEach((k, idx) => { const it = p.gear[k]; if (it) { gt[idx] = it.t + 1; gi[idx] = it.il; } });
  return { i: -1, n: p.name, c: p.cls, lv: p.level, gt, gi, gs: recGearScore({ gt, gi }), isPlayer: true };
}
/** Line up all 1001 combatants as flat arrays of damage and effective health. */
function ovMuster(seed) {
  const rng = new RNG(seed);
  const recs = ROSTER.slice();
  recs.push(ovPlayerRecord());
  const n = recs.length;
  const dps = new Float64Array(n), ehp = new Float64Array(n), lv = new Int32Array(n);
  for (let j = 0; j < n; j++) {
    const r = recs[j];
    const gm = 0.55 + r.gs / (refPrimary(r.lv) * 9);       // the gear-fit term updateAIAvatar uses
    dps[j] = refDPS(r.lv) * gm * 1.4 / 1.9;                // per second (refDPS is per swing)
    ehp[j] = refHP(r.lv) * (0.25 + 0.75 * Math.min(2.20, gm)) * rng.r(0.75, 1.30);
    lv[j] = r.lv;
  }
  ehp[n - 1] *= OV.RESOLVE;                                 // the player's one declared edge
  let d0 = 0; for (let j = 0; j < n; j++) d0 += dps[j];
  const sorted = Float64Array.from(ehp).sort();
  return { recs, n, dps, ehp, lv, d0, medEhp: sorted[n >> 1], pIdx: n - 1 };
}
/* One fight. With bossHP = Infinity this is a DRY RUN and `cap` comes back as the most
   cumulative damage the raid ever had on the board.
   TWO INVARIANTS THAT MUST NEVER BE BROKEN, both silent if they are:
   1. cap is the RUNNING PEAK, not the final total. Hungering Gloom heals the boss, so
      cumulative damage is not monotonic and the final total under-sizes the Overlord.
   2. NOTHING in this fight may key off the boss's own health fraction. A low-health
      enrage would make capacity depend on the health being calibrated, and the whole
      50/50 guarantee becomes circular. All escalation is on the clock. */
function ovFight(L, bossHP, seed, wantTape) {
  const rng = new RNG(seed), n = L.n;
  const hp = Float64Array.from(L.ehp);
  const live = new Int32Array(n); for (let j = 0; j < n; j++) live[j] = j;
  const deathAt = wantTape ? new Float32Array(n).fill(-1) : null;
  const log = wantTape ? [] : null;
  let alive = n, boss = bossHP, net = 0, peak = 0, t = 0, esc = 1, castT = rng.r(OV.CASTMIN, OV.CASTMAX);
  let raidDps = L.d0, pAlive = true;
  const kill = k => {                                       // swap-remove: loops stay O(alive)
    const j = live[k]; raidDps -= L.dps[j];
    if (deathAt) deathAt[j] = t;
    if (j === L.pIdx) pAlive = false;
    live[k] = live[--alive];
  };
  while (t < OV.MAXT && alive > 0) {
    const ramp = Math.pow(1 + t / OV.RAMP, OV.RAMPP) * esc;
    const focus = 1 + OV.FOCUS * (1 - alive / n);            // it turns on the few that are left
    net += raidDps * OV.TICK; if (net > peak) peak = net;
    boss -= raidDps * OV.TICK;
    if (boss <= 0) break;
    const wear = OV.GRIND * ramp * focus * OV.TICK, heal = OV.REGEN * OV.TICK;
    for (let k = alive - 1; k >= 0; k--) {
      const j = live[k], e = L.ehp[j];
      const v = Math.min(e, hp[j] - e * wear + e * heal);
      hp[j] = v; if (v <= 0) kill(k);
    }
    castT -= OV.TICK;
    if (castT <= 0 && alive > 0) {
      castT = rng.r(OV.CASTMIN, OV.CASTMAX);
      const m = OV_MECH[rng.wpick(OV_MECH.map((x, i) => i), OV_MECH_W)];
      const sev = m.sev * rng.r(OV.SEVLO, OV.SEVHI) * ramp;  // ONE roll, whole raid
      const cov = Math.min(1, m.cov * rng.r(OV.COVLO, OV.COVHI));
      const before = alive;
      if (sev > 0 && cov > 0) for (let k = alive - 1; k >= 0; k--) {
        const j = live[k];
        if (rng.f() < cov) { hp[j] -= L.ehp[j] * sev; if (hp[j] <= 0) kill(k); }
      }
      /* A heal has to come off `net` too. net tracks the boss's actual health LOSS, which
         is what makes it non-monotonic and what makes peak(net) >= bossHP exactly equivalent
         to the boss dying. Accumulating raw damage instead leaves the calibration blind to
         every heal and under-sizes the boss -- measured cost, 12 points of win rate.
         Not clamped to bossHP: the dry run has nothing to clamp against, and an asymmetry
         between the two paths is exactly what the whole construction cannot survive. */
      if (m.heal) { const h = m.heal * L.d0 * rng.r(0.6, 1.4); boss += h; net -= h; }
      esc *= m.esc;
      if (log) log.push({ t: Math.round(t), n: m.n, d: m.d, cov: +cov.toFixed(2), dead: before - alive, alive });
    }
    t += OV.TICK;
  }
  const fell = boss <= 0;
  /* THE DEATH THROES. Only if it fell -- and this is what makes survival a merit filter
     rather than a lottery: the blast is an absolute magnitude, so the axis it cuts is
     effective health itself. A blast written as a fraction of your own health would kill
     either nobody or everybody. */
  if (fell) {
    const base = Math.pow(1 + t / OV.RAMP, OV.RAMPP) * esc;
    for (let s = 0; s < OV.THROE_N; s++) {
      const blast = OV.THROE_SEV * Math.pow(OV.THROE_GROW, s) * base * L.medEhp * rng.r(0.85, 1.15);
      const before = alive;
      for (let k = alive - 1; k >= 0; k--) {
        const j = live[k];
        hp[j] -= blast * rng.r(1 - OV.THROE_JIT, 1 + OV.THROE_JIT);
        if (hp[j] <= 0) kill(k);
      }
      if (log) log.push({ t: Math.round(t), n: 'THE THROES', d: 'Its death takes the field with it.', cov: 1, dead: before - alive, alive, throe: 1 });
    }
  }
  const out = {
    cap: peak, fell, alive, dur: t, pAlive: pAlive && (fell || alive > 0) && fell,
    bossLeft: fell ? 0 : Math.max(0, boss / bossHP),
    outcome: !fell ? 0 : alive > 0 ? 2 : 1,                  // 0 wipe, 1 pyrrhic, 2 victory
  };
  if (wantTape) {
    out.deathAt = deathAt; out.log = log;
    out.survivors = []; for (let k = 0; k < alive; k++) out.survivors.push(live[k]);
    out.pDeath = deathAt[L.pIdx];
  }
  return out;
}
/* Size the Overlord to the raid it is actually about to face. P(win) = P(this raid beats
   its own median performance) = 0.5, by construction -- no threshold, no tuned health, and
   immune to how strong or how loot-starved the season left the world. */
function ovCalibrate(L, seed) {
  const caps = [];
  for (let i = 0; i < OV.DRY; i++)
    caps.push(ovFight(L, Infinity, ((seed * 0x9E3779B1) ^ (i * 0x85EBCA6B)) | 0, false).cap);
  caps.sort((a, b) => a - b);
  return caps[(OV.DRY - 1) >> 1] * OV.CAL;
}
/* Drawn fresh, never from SEED. SEED is a source literal (20260827), so a fight seeded
   from it would hand every copy of the game the same win/loss schedule per season number
   -- discoverable the first time two players compare notes. Persisted once drawn, so the
   replay is exact and re-entry can never re-roll the result. */
function ovSeedFor() { return ((Math.random() * 0x7fffffff) | 0) || 1; }
function ovIsActive() { return !!(SEASON.ov && SEASON.ov.n === SEASON.num && SEASON.ov.ph >= 1 && SEASON.ov.ph < 5); }
function ovSeasonLevel() { let m = 1; for (const r of ROSTER) if (r.lv > m) m = r.lv; return m; }

/** Fight it. Synchronous, ~20 ms, and the outcome is final the moment this returns. */
function ovResolve(quiet) {
  if (SEASON.ov && SEASON.ov.n === SEASON.num) return SEASON.ov;   // idempotent: never fight twice
  const seed = ovSeedFor();
  const L = ovMuster(seed ^ 0x51ED270B);
  const bossHP = ovCalibrate(L, seed);
  const res = ovFight(L, bossHP, seed, true);
  const lvl = ovSeasonLevel();
  // how many of the 25 augury runs beat the health it was given: the honest odds, after the fact
  let omens = 0;
  for (let i = 0; i < OV.DRY; i++)
    if (ovFight(L, Infinity, ((seed * 0x9E3779B1) ^ (i * 0x85EBCA6B)) | 0, false).cap >= bossHP) omens++;
  const ov = {
    n: SEASON.num, ph: 1, seed, lvl, bossHP: Math.round(bossHP), d0: Math.round(L.d0),
    outcome: res.outcome, alive: res.alive, dur: Math.round(res.dur),
    bossLeft: +res.bossLeft.toFixed(3), omens, dry: OV.DRY,
    pAlive: res.outcome === 2 && res.survivors.indexOf(L.pIdx) >= 0,
    pDeath: res.pDeath >= 0 ? Math.round(res.pDeath) : -1,
    log: res.log.map(x => ({ t: x.t, n: x.n, dead: x.dead, alive: x.alive })),
    names: [], guilds: {},
  };
  // who lived, by name, and what it cost each guild
  const surv = res.survivors.filter(j => j !== L.pIdx).map(j => ROSTER[j]).filter(Boolean);
  ov.names = surv.slice(0, 40).map(r => ({ n: r.n, lv: r.lv, g: r.g }));
  ov.survIdx = surv.map(r => r.i);
  for (const g of GUILDS) ov.guilds[g.n] = { went: g.members.length, out: 0 };
  for (const r of surv) { const g = r.g >= 0 && GUILDS[r.g] ? GUILDS[r.g].n : null; if (g && ov.guilds[g]) ov.guilds[g].out++; }
  SEASON.ov = ov;
  if (!quiet) {
    chatPush('world', ov.outcome === 2 ? '═══ THE WORLD HELD — ' + ov.alive + ' stood ═══'
      : ov.outcome === 1 ? '═══ A HOLLOW VICTORY — it died, and so did everyone ═══'
        : '═══ THE WORLD HAS FALLEN — the Overlord finished at ' + Math.round(ov.bossLeft * 100) + '% ═══');
  }
  return ov;
}
/** Mint a relic and hand it to everyone still standing. Idempotent on SEASON.ov.n. */
function ovAward() {
  const ov = SEASON.ov;
  /* idempotence keys on its own flag: ph is rewound from 3 to 2 to run the live replay,
     and gating on ph alone paid the relics a second time on the next boot */
  if (!ov || ov.paid) return;
  ov.paid = 1;
  if (ov.ph < 3) ov.ph = 3;
  if (ov.outcome !== 2) return;                              // wipe and pyrrhic pay nothing
  const rng = new RNG((ov.seed ^ 0x2545F491) | 0);
  if (ov.pAlive) {
    const it = genItem(rng, eternalIlvl(ov.lvl), ETERNAL_TIER, rng.pick(SLOT_KEYS), G.player.cls);
    it.src = { s: ov.n, k: 'Kaarnathul, the Unmade' };
    ETERNAL.p.push(it);
  }
  /* AI relics are re-granted next season onto roster indices 40+ ONLY. buildRoster gives
     0-39 a skill bonus; relics landing there took 2.25 of the 3 Ascendant seats in testing
     against 0.00 on random indices. Same relics, same count, opposite game. */
  for (const r of ov.survIdx) ETERNAL.ai.push({ il: eternalIlvl(ov.lvl), s: ov.n });
  // over the cap, the OLDEST relics pass out of the world -- a full store used to
  // shut every later season's survivors out entirely
  while (ETERNAL.ai.length > OV.CARRY_MAX) ETERNAL.ai.shift();
}
/* ---- the live battle: a replay of a tape that is already written ---- */
function ovLiveReplayPossible() {
  return !!(G.started && G.player && typeof document !== 'undefined' && !document.hidden && !OV_HEADLESS);
}
let OV_HEADLESS = 0, ovAckT = 0;
/** Stand the Overlord up in the world and put the visible adventurers around it. */
function ovBegin() {
  const ov = SEASON.ov; if (!ov) return;
  const p = G.player;
  for (const e of G.ents) if (e.rec) e.rec.av = null;   // or those 34 records can never re-instantiate
  G.ents.length = 0; G.proj.length = 0; G.dmg.length = 0; G.target = null; G.inRaid = null;
  p.dead = 0; p.ovDown = 0; p.hp = p.st.hpMax;
  const spot = ovArenaSpot(p.x, p.z);
  if (spot) { p.x = spot[0]; p.z = spot[1]; p.y = groundH(p.x, p.z); p.vy = 0; }
  const boss = ovSpawnBoss(ov.lvl, ov.bossHP, p.x, p.z);
  // rebuild the tape from the persisted seed: pure function of (snapshot, seed), ~2 ms
  const L = ovMuster(ov.seed ^ 0x51ED270B);
  const tape = ovFight(L, ov.bossHP, ov.seed, true);
  G.overlord = {
    boss, L, tape, t: 0, rate: Math.max(0.2, tape.dur / OV.SHOW_S),
    li: 0, cast: null, castT: 0, alive: L.n, shown: 0, done: 0, throeT: -1,
  };
  ovArenaSeed(L, tape);
  /* Turn and look at it. The whole beat is the thing being enormous and in front of you,
     and a boom camera left pointing wherever the player last walked shows them a field. */
  G.camYaw = Math.atan2(boss.x - p.x, boss.z - p.z);
  G.camPitch = 0.42; G.camDist = 15;
  G.target = boss;   // the cast bar lives inside the target frame; without a target it renders to nothing
  banner('THE OVERLORD', 'Kaarnathul, the Unmade');
  chatPush('world', '═══ THE OVERLORD RISES — every adventurer alive stands against it ═══');
  musicSet('boss', true);
  if ($('ovbar')) $('ovbar').classList.add('on');
}
/** Advance the replay. Never simulates — only reads what was already decided. */
function ovReplayTick(dt) {
  const O = G.overlord; if (!O || O.done) return;
  const ov = SEASON.ov;
  if (typeof document !== 'undefined' && document.hidden) { ovReplayEnd(); return; }
  O.t += dt * O.rate;
  const tape = O.tape;
  // deaths land exactly when the ledger says they did — same simulation, 34x zoom
  for (const e of G.ents) {
    if (e.kind !== 'ai' || e.dead || e.ovIdx == null) continue;
    const d = tape.deathAt[e.ovIdx];
    if (d >= 0 && O.t >= d) ovKillAvatar(e);
  }
  if (!G.player.ovDown && tape.pDeath >= 0 && O.t >= tape.pDeath) {
    G.player.ovDown = 1; G.player.dead = 1;
    banner('YOU FELL', 'at ' + ovClock(tape.pDeath));
  }
  // named casts drive the bar and the count
  while (O.li < tape.log.length && tape.log[O.li].t <= O.t) {
    const c = tape.log[O.li++];
    O.cast = c; O.castT = 1.6; O.alive = c.alive;
    if (c.dead > 0) toast('<b>' + esc(c.n) + '</b><div class="tiny">−' + c.dead + ' standing</div>', 'big');
    if (c.throe) { R.flash = 1; G.camShake = 0.9; }
    else if (c.dead > 40) G.camShake = Math.min(0.7, 0.2 + c.dead / 600);
  }
  if (O.castT > 0) O.castT -= dt;
  // the boss bar is the race; the counter is the cost
  const frac = Math.max(0, 1 - O.t / Math.max(1, tape.dur));
  O.boss.hp = Math.max(1, O.boss.hpMax * (tape.fell ? frac : Math.max(tape.bossLeft, frac)));
  O.boss.scale = 7 + 5 * Math.min(1, O.t / Math.max(1, tape.dur));   // it grows as the field thins
  if (O.t >= tape.dur + 4) ovReplayEnd();
}
function ovReplayEnd() {
  const O = G.overlord; if (!O || O.done) return;
  O.done = 1;
  const ov = SEASON.ov, tape = O.tape;
  if (tape.fell) { O.boss.hp = 0; O.boss.dead = 1; O.boss.an.dead = 1; }
  banner(ov.outcome === 2 ? 'THE WORLD HELD' : ov.outcome === 1 ? 'A HOLLOW VICTORY' : 'THE WORLD HAS FALLEN',
    ov.outcome === 2 ? ov.alive + ' stood' : ov.outcome === 1 ? 'It died. So did everyone.'
      : 'The Overlord finished at ' + Math.round(ov.bossLeft * 100) + '%');
  musicSet(ov.outcome === 2 ? 'victory' : 'night', true);
  if ($('ovbar')) $('ovbar').classList.remove('on');
  if ($('tcast')) $('tcast').classList.remove('on');
  G.overlord = null;
  ov.ph = 4;
  showSeasonEnd(SEASON.champions[0]);
  saveGame();
}
/** Unattended: after a beat on the result screen, start the next season without a tap. */
function ovAckTick(dt) {
  const ov = SEASON.ov; if (!ov) return;
  if (ov.ph === 2) return;                                   // the replay owns the clock
  if (ov.ph < 4 || !G.player || !G.player.autoOn) return;
  ovAckT += dt;
  if (ovAckT >= OV.ACK_S) { ovAckT = 0; ovStartNextSeason(); }
}
function ovClock(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
/** Your live odds of walking out, shown during the final call. Same pipeline as everyone. */
function ovSurvivalOdds() {
  if (!G.player || !ROSTER.length) return 0;
  const L = ovMuster(0x1234567), seed = 20260827;
  let lived = 0, runs = 9;
  for (let i = 0; i < runs; i++) {
    const s = ((seed * 0x9E3779B1) ^ (i * 0xC2B2AE35)) | 0;
    const hp0 = ovCalibrate(L, s);
    const r = ovFight(L, hp0, s, true);
    if (r.outcome === 2 && r.survivors.indexOf(L.pIdx) >= 0) lived++;
  }
  return lived / runs;
}
function ovStatusLine() {
  const O = G.overlord;
  if (!O) return '';
  return '<b style="color:#7ff2ff">THE OVERLORD</b> · ' + O.alive + ' standing';
}
/** Dress the fresh level-1 player in whatever they carried out. */
function ovCarryApplyPlayer(np) {
  for (const it of ETERNAL.p) {
    const old = np.gear[it.sl];
    np.gear[it.sl] = it;
    if (old && np.bags.length < np.bagMax) np.bags.push(old);
  }
}
/** And the AI bearers, never onto the elite block. */
function ovCarryApplyRoster() {
  if (!ETERNAL.ai.length) return;
  const rng = new RNG((SEASON.num * 2654435761) | 0);
  const taken = new Set();
  for (const rel of ETERNAL.ai) {
    let i = 0, guard = 0;
    do { i = 40 + rng.i(Math.max(1, ROSTER.length - 40)); } while (taken.has(i) && guard++ < 40);
    taken.add(i);
    const rec = ROSTER[i]; if (!rec) continue;
    const sl = rng.i(15);
    rec.gt[sl] = ETERNAL_TIER + 1; rec.gi[sl] = rel.il;
    rec.gs = recGearScore(rec); rec.best = ETERNAL_TIER;
  }
}
function endSeason(quiet) {
  if (SEASON.ended && SEASON.ov && SEASON.ov.n === SEASON.num) return;   // startGame has no ended-guard; do not crown or fight twice
  SEASON.ended = true;
  const all = hallOfFame(POP + 1);
  // two separate crowns: highest level, and greatest gear power
  const byLevel = all.slice().sort((a, b) => (b.lv - a.lv) || (b.gs - a.gs))[0];
  const byGear = all.slice().sort((a, b) => (b.gs - a.gs) || (b.lv - a.lv))[0];
  const capsule = r => ({
    n: r.n, lv: r.lv, gs: r.gs, c: r.c, best: r.best,
    guild: r.g >= 0 && GUILDS[r.g] ? GUILDS[r.g].n : '', isPlayer: !!r.isPlayer,
  });
  // top guild is crowned purely on respect, as its own title
  const byRespect = GUILDS.slice().sort((a, b) => b.respect - a.respect)[0];
  // and the Trailblazer: most world-boss firsts taken across the whole season
  const blazers = firstsLeaders();
  const blazer = blazers[0] || null;
  const rec = {
    num: SEASON.num, ended: Date.now(),
    champ: capsule(byLevel),
    gearChamp: capsule(byGear),
    sweep: byLevel.n === byGear.n && byLevel.isPlayer === byGear.isPlayer,
    guild: byRespect ? { n: byRespect.n, respect: Math.round(byRespect.respect),
      members: byRespect.members.length, wins: byRespect.wins, isPlayerGuild: !!byRespect.playerGuild } : null,
    ascended: SEASON.ascended.slice(),
    blazer: blazer ? { n: blazer.n, c: blazer.c, isPlayer: !!blazer.isPlayer,
      guild: blazer.g >= 0 && GUILDS[blazer.g] ? GUILDS[blazer.g].n : '' } : null,
    firstsTaken: FIRST_N, firstsTotal: DB.bosses.length,
    playerFirsts: G.player ? firstsBy(G.player.name) : 0,
    top: all.slice(0, 10).map(r => ({ n: r.n, lv: r.lv, gs: r.gs, isPlayer: !!r.isPlayer })),
    playerRank: all.findIndex(r => r.isPlayer) + 1,
    playerGearRank: all.slice().sort((a, b) => b.gs - a.gs).findIndex(r => r.isPlayer) + 1,
    playerLv: G.player ? G.player.level : 0,
  };
  SEASON.champions.unshift(rec);
  // the roll of champions is permanent — every season ever played, kept forever
  if (SEASON.champions.length > 400) SEASON.champions.pop();
  /* The Overlord rises the moment the crowns are handed out. Resolving it HERE, before
     showSeasonEnd and before the saveGame two lines down, is what persists the verdict
     for free and makes a reload mid-finale impossible to re-roll. */
  const ov = ovResolve(quiet);
  rec.ov = { outcome: ov.outcome, alive: ov.alive, dur: ov.dur, bossLeft: ov.bossLeft,
    omens: ov.omens, dry: ov.dry, pAlive: ov.pAlive, lvl: ov.lvl };
  ovAward();
  if (ovLiveReplayPossible()) { ov.ph = 2; ovBegin(); }
  else { ov.ph = 4; showSeasonEnd(rec); musicSet('victory', true); }
  saveGame();
}
function startNewSeason() {
  SEASON.num++;
  SEASON.start = Date.now();
  SEASON.ended = false;
  SEASON.milestone = 0;
  SEASON.ascended = [];
  MYTHIC_HOLDERS.clear();
  // ETERNAL is deliberately NOT cleared here. Mythic dies with its season; relics do not.
  SEASON.ov = null;
  buildRoster(SEED ^ (SEASON.num * 7919));
  ovCarryApplyRoster();
  for (const k in RAID_LOCK) delete RAID_LOCK[k];
  for (const k in BOSS_STATE) delete BOSS_STATE[k];
  for (const k in FIRSTS) delete FIRSTS[k];
  FIRST_N = 0;
  TRADE_BOARD.length = 0; WAR_LOG.length = 0;
  /* open whispers and queued replies reference pre-wipe roster indices; left alive
     they re-point at whoever the rebuilt roster puts at that index */
  PENDING.length = 0; CONVO.length = 0;
  RAID_CALL = null; raidCallT = 240;
  if (typeof AUTO !== 'undefined') { AUTO.reset(); AUTO._snap = null; }
  // reset the player to level 1 with nothing but a plain weapon
  const p = G.player;
  const keepName = p.name, keepCls = p.cls;
  const np = makePlayer(keepName, keepCls);
  np.stats.seasons = (p.stats.seasons || 0) + 1;
  np.autoOn = p.autoOn; np.autoMode = p.autoMode;
  /* Whatever you carried out of the Overlord comes with you into a level-1 world.
     This is the only gear in the game that survives a wipe. */
  ovCarryApplyPlayer(np);
  np.st = calcStats(np); np.resMax = resourceMax(np); np.hp = np.st.hpMax;
  styleFromGear(np, np.gear, np.cls);
  G.player = np;
  G.ents.length = 0; G.proj.length = 0; G.gfx.length = 0; G.dmg.length = 0;
  G.target = null; G.inRaid = null; G.lastZone = -1;
  chatPush('world', '═══ SEASON ' + SEASON.num + ' BEGINS — everyone is level 1 ═══');
  banner('SEASON ' + SEASON.num, 'A new world. Everyone starts at one.');
  uiDirty.all = 1;
  saveGame();
}
