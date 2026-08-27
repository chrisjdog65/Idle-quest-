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
const SEASON = { num: 1, start: 0, ended: false, champions: [] };
const MYTHIC_HOLDERS = new Set();
let metaAcc = 0, warT = 180, tradeT = 40, worldEventT = 300;

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
    if (best) { rec.tx = best.x + _mrng.r(-18, 18); rec.tz = best.z + _mrng.r(-18, 18); rec.z2 = best.zone; }
  }
  const S = AI_STATES.find(s => s.k === rec.st) || AI_STATES[0];
  const eff = rec.skill * (0.72 + Math.min(1.0, rec.gs / Math.max(1, refPrimary(rec.lv) * 5.2)) * 0.55) * S.xp;
  rec.lp += levelRate(rec.lv, eff) * dt;
  while (rec.lp >= 1) { rec.lp -= 1; rec.lv++; }
  rec.gold += (2.4 + rec.lv * 1.15) * S.gold * dt * 0.32;
  rec.kills += S.xp * dt * 0.42;
  if (S.k === 'quest') rec.quests += dt * 0.055;
  if (S.k === 'boss') rec.bosses += dt * 0.010;
  if (S.k === 'raid') rec.raids += dt * 0.0042;
  if (S.k === 'pvp' && _mrng.chance(dt * 0.02)) rec.pvp++;
  rec.respect += dt * 0.06 * (1 + rec.lv / 90) * S.xp;

  // ---- loot rolls ----
  const rate = 0.055 * S.xp * dt;
  if (_mrng.f() < rate) {
    const slot = _mrng.i(15);
    let tier = rollTier(_mrng, S.q, rec.skill * 0.25);
    if (tier === 5 && (rec.lv < MYTHIC_MIN_LEVEL || S.q < MYTHIC_MIN_SOURCE || !mythicAvailable(rec))) tier = 4;
    const ilvl = Math.max(1, Math.round(rec.lv * 2.45 + _mrng.r(-6, 10) + tier * 3));
    const newScore = ilvl * 1.15 * SLOTS[slot].w * RARITY[tier].mult * 2.1;
    const oldScore = rec.gt[slot] ? rec.gi[slot] * 1.15 * SLOTS[slot].w * RARITY[rec.gt[slot] - 1].mult * 2.1 : 0;
    if (newScore > oldScore) {
      rec.gt[slot] = tier + 1; rec.gi[slot] = ilvl;
      rec.gs = recGearScore(rec);
      const bt = recBestTier(rec);
      if (bt > rec.best) {
        rec.best = bt;
        if (bt === 5) claimMythic(rec);
        if (!fast && bt >= 4) {
          chatPush('loot', '[' + rec.n + ']: ' + (bt === 5 ? 'ASCENDANT' : 'Legendary') + ' drop — ' +
            (bt === 5 ? MYTHIC_NAMES[_mrng.i(MYTHIC_NAMES.length)] : LEGEND_NAMES[_mrng.i(LEGEND_NAMES.length)]) + '!');
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
function mythicAvailable(who) {
  if (MYTHIC_HOLDERS.size < MYTHIC_LIMIT) return true;
  return MYTHIC_HOLDERS.has(who === G.player ? -1 : who.i);
}
function claimMythic(rec) {
  const key = rec === G.player ? -1 : rec.i;
  if (MYTHIC_HOLDERS.has(key)) return true;
  if (MYTHIC_HOLDERS.size >= MYTHIC_LIMIT) return false;
  MYTHIC_HOLDERS.add(key);
  rec.mythicAt = Date.now();
  const nm = rec === G.player ? G.player.name : rec.n;
  chatPush('world', '★ ' + nm + ' has become an ASCENDANT — ' + (MYTHIC_LIMIT - MYTHIC_HOLDERS.size) + ' Ascendant seat(s) remain this season.');
  if (rec === G.player) { banner('ASCENDANT', 'You bear Mythic gear — one of only three'); R.flash = 1; R.flashCol = [1, .3, .4]; }
  return true;
}
function metaCanMythic(p) { return mythicAvailable(p); }
function metaClaimMythic(p) { return claimMythic(p); }

/* ------------------------------ TICK ------------------------------ */
function metaTick(dt) {
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
  tradeT -= dt;
  if (tradeT <= 0) { tradeT = 22 + Math.random() * 40; postTradeOffer(); pruneOffers(); if (Math.random() < .45) makeIncomingOffer(); }
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
  const step = secs > 3600 ? 240 : 30;
  const n = Math.min(Math.ceil(secs / step), 4200);
  const realStep = secs / n;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < ROSTER.length; i++) advanceRec(ROSTER[i], realStep, true);
    if ((s % 12) === 0) runClanWar(true);
  }
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
  WAR_LOG.unshift({ t: Date.now(), w: w.n, l: l.n, s: stake, wi: w.i, li: l.i });
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
  const idx = (Math.random() * p.bags.length) | 0;
  const it = p.bags[idx];
  if (it.t < 1) return;
  const buyer = ROSTER[(Math.random() * ROSTER.length) | 0];
  if (!buyer || buyer.gold < it.val) return;
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
function startRaid(rid) {
  const p = G.player, r = DB.raids[rid];
  const err = raidAvailable(r);
  if (err) { toast(err, 'sys'); sfx('error', .7); return false; }
  G.inRaid = { r, boss: 0, hp: 0, t: 0, killed: 0, loot: [] };
  RAID_LOCK[r.id] = Date.now() + r.lock;
  panelClose();
  banner(r.n, r.size + '-player raid · ' + r.bosses.length + ' encounters');
  chatPush('guild', 'You have entered ' + r.n + ' with ' + (r.size - 1) + ' allies.');
  musicSet('raid'); sfx('portal', 1);
  // teleport to the portal so the fight happens in the world
  p.x = r.x + 6; p.z = r.zz + 6; p.y = groundH(p.x, p.z);
  raidNextBoss();
  return true;
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
  banner('ENCOUNTER ' + (R2.boss + 1) + '/' + R2.r.bosses.length, bd.n + ', ' + bd.t);
  sfx('roar', 1);
}
function finishRaid(cleared) {
  const R2 = G.inRaid; if (!R2) return;
  const p = G.player, r = R2.r;
  G.inRaid = null;
  if (cleared) {
    p.stats.raidsDone++; p.raidKills += r.bosses.length;
    const gold = giveGold(p, r.gold * (1 + p.level * .05));
    giveXP(p, xpNeed(p.level) * 0.9);
    p.respect += r.respect;
    if (p.guild != null && GUILDS[p.guild]) { GUILDS[p.guild].respect += r.respect; GUILDS[p.guild].raids++; }
    const loot = rollLoot(p, Math.max(r.lv, p.level), r.lootTier, 2 + ((Math.random() * 3) | 0));
    for (const it of loot) giveItem(p, it);
    banner('RAID CLEARED', r.n + ' · +' + fmt(gold) + 'g · +' + r.respect + ' respect');
    chatPush('world', '🏆 ' + p.name + '\'s group cleared ' + r.n + '!');
    musicSet('victory');
    setTimeout(() => { if (!G.inRaid) musicSet('explore'); }, 16000);
  } else {
    banner('RAID FAILED', r.n);
    chatPush('guild', 'The raid wiped in ' + r.n + '.');
  }
}
function raidTick(dt) {
  const R2 = G.inRaid; if (!R2) return;
  R2.t += dt;
  const p = G.player;
  if (p.dead) { finishRaid(false); return; }
  if (R2.cur && R2.cur.dead) {
    R2.boss++; R2.killed++; R2.cur = null;
    if (R2.boss >= R2.r.bosses.length) finishRaid(true);
    else setTimeout(() => { if (G.inRaid) raidNextBoss(); }, 2600);
  }
  if (R2.cur && V.dist(p.x, p.z, R2.r.x, R2.r.zz) > 190) { finishRaid(false); }
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
    title: '', isPlayer: true, x: p.x, z: p.z,
  };
}
function hofScore(r) {
  return r.lv * 1000 + r.gs * 0.55 + r.best * 4200 + r.bosses * 24 + r.raids * 180 + r.quests * 6 + r.respect * 0.6;
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
function seasonLeft() { return Math.max(0, SEASON.start + SEASON_MS - Date.now()); }
function checkSeason() {
  if (SEASON.ended) return;
  if (seasonLeft() > 0) return;
  endSeason();
}
function endSeason() {
  SEASON.ended = true;
  const hof = hallOfFame(100);
  const champ = hof[0];
  const gHall = guildHall(20);
  const rec = {
    num: SEASON.num, ended: Date.now(),
    champ: { n: champ.n, lv: champ.lv, gs: champ.gs, c: champ.c, best: champ.best, guild: champ.g >= 0 && GUILDS[champ.g] ? GUILDS[champ.g].n : '', isPlayer: !!champ.isPlayer },
    guild: gHall[0] ? { n: gHall[0].n, respect: Math.round(gHall[0].respect) } : null,
    top: hof.slice(0, 10).map(r => ({ n: r.n, lv: r.lv, gs: r.gs, isPlayer: !!r.isPlayer })),
    playerRank: hallOfFame(POP + 1).findIndex(r => r.isPlayer) + 1,
    playerLv: G.player ? G.player.level : 0,
  };
  SEASON.champions.unshift(rec);
  if (SEASON.champions.length > 20) SEASON.champions.pop();
  showSeasonEnd(rec);
  musicSet('victory', true);
  saveGame();
}
function startNewSeason() {
  SEASON.num++;
  SEASON.start = Date.now();
  SEASON.ended = false;
  MYTHIC_HOLDERS.clear();
  buildRoster(SEED ^ (SEASON.num * 7919));
  for (const k in RAID_LOCK) delete RAID_LOCK[k];
  for (const k in BOSS_STATE) delete BOSS_STATE[k];
  TRADE_BOARD.length = 0; WAR_LOG.length = 0;
  // reset the player to level 1 with nothing but a plain weapon
  const p = G.player;
  const keepName = p.name, keepCls = p.cls;
  const np = makePlayer(keepName, keepCls);
  np.stats.seasons = (p.stats.seasons || 0) + 1;
  np.autoOn = p.autoOn; np.autoMode = p.autoMode;
  G.player = np;
  G.ents.length = 0; G.proj.length = 0; G.gfx.length = 0; G.dmg.length = 0;
  G.target = null; G.inRaid = null; G.lastZone = -1;
  chatPush('world', '═══ SEASON ' + SEASON.num + ' BEGINS — everyone is level 1 ═══');
  banner('SEASON ' + SEASON.num, 'A new world. Everyone starts at one.');
  uiDirty.all = 1;
  saveGame();
}
