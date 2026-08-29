/* =========================================================================
   IDLE QUEST — 09 UI
   Mobile-first HUD, virtual stick + gesture camera, world-space nameplates
   and floating combat text on a 2D overlay, minimap, and every panel.
   ========================================================================= */

const uiDirty = { tracker: 1, quests: 1, bag: 1, all: 1 };
const INPUT = { mx: 0, mz: 0, jump: false, sprint: false, stickId: -1, camId: -1, lastTap: 0 };
let FX = null, FXC = null, MMC = null;

/* ------------------------------ TOASTS / BANNER / CHAT ------------------------------ */
function toast(html, kind) {
  const box = $('toasts');
  const t = el('div', 'toast' + (kind === 'big' ? ' big' : ''), html);
  box.appendChild(t);
  while (box.children.length > 5) box.removeChild(box.firstChild);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 340); }, kind === 'big' ? 3200 : 2600);
}
let bannerT = null;
function banner(title, sub) {
  const b = $('banner');
  $('bTitle').textContent = title;
  $('bSub').textContent = sub || '';
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => b.classList.remove('on'), 2700);
}
const CHAT_MAX = 60;
const CHAT_LOG = [];
function chatPush(kind, text) {
  CHAT_LOG.push({ k: kind, t: text });
  if (CHAT_LOG.length > CHAT_MAX) CHAT_LOG.shift();
  const c = $('chat');
  const pre = { say: '', guild: '[Guild] ', trade: '[Trade] ', world: '[World] ', sys: '', loot: '', kill: '' }[kind] || '';
  const d = el('div', 'c-' + kind, esc(pre + text));
  c.appendChild(d);
  while (c.children.length > 22) c.removeChild(c.firstChild);
  c.scrollTop = c.scrollHeight;
}

let _onceT = 0;
/** Rate-limited system chatter, so repeated auto-play decisions do not spam. */
function chatPushOnce(text) {
  if (G.t - _onceT < 20) return;
  _onceT = G.t;
  chatPush('sys', text);
}

/* ------------------------------ TOOLTIP ------------------------------ */
function itemTooltipHTML(it, cmp) {
  if (!it) return '';
  let h = '<div class="tn q' + it.t + '">' + esc(it.n) + '</div>';
  h += '<div class="tt">' + RARITY[it.t].n + ' · ' + SLOT_BY[it.sl].n + ' · Item Level ' + it.il + '</div>';
  if (it.w) h += '<div class="st">' + fmt(it.w) + ' weapon damage</div>';
  for (const k in it.st) {
    const sd = STATS.find(s => s.k === k);
    h += '<div class="st">+' + fmt(it.st[k]) + ' ' + (sd ? sd.n : k) + '</div>';
  }
  for (const a of it.af) {
    const def = AFFIXES.find(x => x.k === a.k);
    h += '<div class="af">' + (def ? def.d(a.v) : a.n) + '</div>';
  }
  h += '<div class="tt" style="margin-top:5px">Score ' + fmt(it.sc) + ' · Sells for ' + fmt(it.val) + 'g</div>';
  if (it.fl) h += '<div class="fl">' + esc(it.fl) + '</div>';
  if (cmp !== undefined) {
    const cs = cmp ? cmp.sc : 0;
    const d = it.sc - cs;
    h += '<div class="cmp">' + (cmp ? 'Equipped: <span class="q' + cmp.t + '">' + esc(cmp.n) + '</span> (' + fmt(cs) + ')' : 'Nothing equipped') +
      '<br><b style="color:' + (d >= 0 ? '#4ad24a' : '#e0492f') + '">' + (d >= 0 ? '▲ +' : '▼ ') + fmt(Math.abs(d)) + ' score</b></div>';
  }
  return h;
}
function showTip(html, x, y) {
  const t = $('tip');
  t.innerHTML = html;
  t.classList.add('on');
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = clamp(x - w / 2, 6, innerWidth - w - 6) + 'px';
  t.style.top = clamp(y - h - 14, 6, innerHeight - h - 6) + 'px';
}
function hideTip() { $('tip').classList.remove('on'); }

/* ------------------------------ ABILITY BAR ------------------------------ */
const ABPOS = ['big', 's1', 's2', 's3', 's4', 's5'];
/** Ability names have to survive a 52px circle — take the distinctive word. */
function shortAbName(n, big) {
  const cap = big ? 9 : 8;
  if (n.length <= cap) return n;
  const parts = n.split(/[\s-]+/);
  let w = parts[parts.length - 1];
  if (w.length > cap) w = parts.reduce((a, b) => a.length <= b.length ? a : b);
  return w.length <= cap ? w : w.slice(0, cap - 1) + '…';
}
function buildActionBar() {
  const p = G.player, c = CLASS_BY[p.cls];
  const box = $('acts'); box.innerHTML = '';
  c.ab.forEach((ab, i) => {
    if (i >= ABPOS.length) return;
    const b = el('div', 'ab ' + ABPOS[i]);
    b.innerHTML = '<div class="ic">' + ab.ic + '</div><div class="kn">' + esc(shortAbName(ab.n, i === 0)) + '</div>' +
      '<div class="cd"></div><div class="cdn"></div>';
    b.dataset.i = i;
    const fire = e => {
      e.preventDefault(); e.stopPropagation();
      if (!G.target || G.target.dead) {
        const t = pickTarget(p, ab.rng > 6 ? ab.rng : 34);
        if (t) G.target = t;
      }
      castAbility(p, ab, G.target);
      p.autoOn && setAuto(false);
    };
    b.addEventListener('touchstart', fire, { passive: false });
    b.addEventListener('mousedown', fire);
    box.appendChild(b);
  });
  G.abEls = Array.from(box.children);
}
function updateActionBar() {
  const p = G.player, c = CLASS_BY[p.cls];
  if (!G.abEls) return;
  for (let i = 0; i < G.abEls.length; i++) {
    const ab = c.ab[i], b = G.abEls[i];
    const cd = p.cds[ab.id] || 0;
    const total = ab.cd / (1 + p.st.hasteP * .5) || 1;
    const cdEl = b.children[2], cdn = b.children[3];
    if (cd > 0) {
      cdEl.style.setProperty('--a', (cd / total) * 360 + 'deg');
      cdn.textContent = cd > 1 ? Math.ceil(cd) : cd.toFixed(1);
    } else { cdEl.style.setProperty('--a', '0deg'); cdn.textContent = ''; }
    const dis = (ab.cost > 0 && p.res < ab.cost) || (p.gcd > 0 && ab.gcd) || cd > 0;
    b.classList.toggle('dis', !!dis);
  }
}

/* The alive counter is the emotional instrument of the whole finale: one number, huge,
   that holds dead still through the opening casts and then lurches. #tcast/#tCastB/#tCastT
   have been sitting in the markup since the first build with no JavaScript touching them —
   this is what they were for. Every cast is named before it lands, which is the difference
   between "we lost" and "we lost to the Grave Tide at two minutes". */
let ovLastAlive = -1, ovDeltaT = 0;
function ovHudBlock() {
  const O = G.overlord, bar = $('ovbar');
  if (!bar) return;
  if (!O) { if (ovLastAlive !== -1) { bar.classList.remove('on'); ovLastAlive = -1; } return; }
  bar.classList.add('on');
  // never fmt() this one: "1.00K standing" is not the same sentence as "1001 standing"
  $('ovCount').textContent = String(O.alive);
  if (ovLastAlive >= 0 && O.alive < ovLastAlive) {
    $('ovDelta').textContent = '−' + (ovLastAlive - O.alive);
    $('ovDelta').classList.add('on'); ovDeltaT = G.t;
  } else if (G.t - ovDeltaT > 1.5) $('ovDelta').classList.remove('on');
  ovLastAlive = O.alive;
  const cb = $('tcast');
  if (O.cast && O.castT > 0) {
    cb.classList.add('on');
    $('tCastT').textContent = O.cast.n.toUpperCase();
    $('tCastB').style.width = clamp(O.castT / 1.6, 0, 1) * 100 + '%';
  } else cb.classList.remove('on');
}

/* ------------------------------ HUD ------------------------------ */
let hudT = 0;
function updateHUD(dt) {
  const p = G.player; if (!p) return;
  hudT -= dt;
  const c = CLASS_BY[p.cls];
  const hpP = clamp(p.hp / p.st.hpMax, 0, 1) * 100;
  $('pHp').style.width = hpP + '%';
  $('pHpT').textContent = fmt(Math.max(0, p.hp)) + ' / ' + fmt(p.st.hpMax);
  const rp = clamp(p.res / p.resMax, 0, 1) * 100;
  const rEl = $('pRes');
  rEl.style.width = rp + '%';
  rEl.style.background = 'linear-gradient(180deg,' + c.resC + ',' + c.resC + '99)';
  $('pResT').textContent = c.resN + ' ' + Math.round(p.res);
  const need = xpNeed(p.level);
  $('pXp').style.width = clamp(p.xp / need, 0, 1) * 100 + '%';
  $('pXpT').textContent = Math.floor(p.xp / need * 100) + '%';
  $('pLvl').textContent = p.level;
  $('pIcon').textContent = c.ic;

  if (hudT > 0) { updateActionBar(); return; }
  hudT = 0.2;
  $('pName').textContent = p.name;
  $('pGuild').textContent = p.guild != null && GUILDS[p.guild] ? GUILDS[p.guild].n : '<no clan>';
  $('gold').innerHTML = fmt(p.gold) + ' <span style="opacity:.7">g</span>';
  $('sNum').textContent = SEASON.num;
  const fin = seasonFinalCall();
  // What actually ends the season is the race to ASCEND_LEVEL, so show that
  // once it is under way; the seven-day clock is only the outer backstop.
  const seats = MYTHIC_HOLDERS.size;
  $('sLeft').textContent = fin ? 'FINAL ' + durShort(seasonLeft())
    : seats > 0 ? seats + '/' + MYTHIC_LIMIT + ' ★ · ' + durShort(seasonLeft())
      : durShort(seasonLeft());
  $('season').classList.toggle('final', fin);
  $('season').title = fin
    ? 'All Ascendant seats claimed — the Overlord rises when this hits zero'
    : 'Season ends 10 minutes after the third adventurer reaches level ' + ASCEND_LEVEL;
  // once the final call is running, the season chip stops counting down to a reset
  // and starts counting down to the thing at the end of it
  if (G.overlord) { $('sLeft').textContent = 'THE OVERLORD'; $('season').classList.add('ovarm'); }
  else if (fin) { $('sLeft').textContent = 'OVERLORD ' + durShort(seasonLeft()); $('season').classList.add('ovarm'); }
  else $('season').classList.remove('ovarm');
  ovHudBlock();
  const hh = Math.floor(G.tod * 24), mm = Math.floor((G.tod * 24 % 1) * 60);
  $('clock').textContent = pad2(hh) + ':' + pad2(mm);

  // target frame
  const t = G.target;
  const tf = $('tframe');
  if (t && !t.dead) {
    tf.classList.add('on');
    $('tName').textContent = t.name + (t.title ? ', ' + t.title : '');
    $('tLvl').textContent = 'Lv ' + t.level + (t.kind === 'boss' ? ' ★' : t.rank === 1 ? ' ◆' : '');
    const th = clamp(t.hp / t.hpMax, 0, 1) * 100;
    $('tHp').style.width = th + '%';
    $('tHpT').textContent = fmt(Math.max(0, t.hp)) + ' / ' + fmt(t.hpMax);
  } else tf.classList.remove('on');

  // cast bar
  const cb = $('castbar');
  if (p.casting) {
    cb.classList.add('on');
    $('cLbl').textContent = p.casting.ab.n;
    $('cBar').style.width = clamp(p.casting.t / p.casting.dur, 0, 1) * 100 + '%';
  } else cb.classList.remove('on');

  // interact prompt
  const ip = $('interact');
  const near = nearestPOI(p.x, p.z, null, 16);
  if (near && (near.k === 'hub' || near.k === 'raid' || near.k === 'lair')) {
    ip.classList.add('on');
    ip.textContent = near.k === 'hub' ? '📜 ' + near.n + ' — tap for quests'
      : near.k === 'raid' ? '🐉 ' + near.n + ' — tap to enter raid'
        : '☠ ' + near.n;
    ip.onclick = () => {
      sfx('open', .8);
      if (near.k === 'hub') panelOpen('quest');
      else if (near.k === 'raid') panelOpen('raid');
      else if (near.k === 'lair') { const b = G.ents.find(e => e.kind === 'boss'); if (b) G.target = b; }
    };
  } else ip.classList.remove('on');

  if (uiDirty.tracker) { renderTracker(); uiDirty.tracker = 0; }
  const soc = document.querySelector('#bar .mb[data-p="social"]');
  if (soc) soc.classList.toggle('alert', PENDING.length > 0);
  updateActionBar();
  // auto-play status line
  $('autostate').innerHTML = p.autoOn ? AUTO.statusHTML() : '';
  if (SET.perf) {
    $('perf').classList.add('on');
    $('perf').textContent = (R.fps | 0) + ' fps · ' + R.drawCalls + ' draws · ' + fmt(R.tris) + ' tris\n' +
      G.ents.length + ' entities · ' + POP + ' AI · ' + R.w + '×' + R.h;
  } else $('perf').classList.remove('on');
}
function renderTracker() {
  const p = G.player, box = $('tracker');
  let h = '';
  const list = p.quests.slice(0, 6);
  for (const a of list) {
    const q = DB.quests[a.id];
    const done = a.prog >= q.need;
    h += '<div class="trk"><div class="t">' + esc(q.n) + '</div><div class="o' + (done ? ' done' : '') + '"><span>' +
      esc(objectiveText(q)) + '</span><span>' + a.prog + '/' + q.need + '</span></div></div>';
  }
  if (p.quests.length > 6) h += '<div class="trk"><div class="o">+' + (p.quests.length - 6) + ' more…</div></div>';
  box.innerHTML = h;
}
function objectiveText(q) {
  switch (q.t) {
    case 'kill': return 'Slay ' + q.tgt;
    case 'elite': return 'Slay ' + q.tgt;
    case 'collect': return 'Gather ' + q.tgt;
    case 'explore': return 'Reach ' + q.tgt;
    case 'escort': return 'Escort to ' + q.tgt;
    case 'boss': return 'Defeat ' + q.tgt;
  }
  return q.tgt;
}

/* ------------------------------ 2D OVERLAY ------------------------------ */
const _pv = [0, 0, 0];
function worldToScreen(x, y, z, out) {
  M4.project(R.vp, x, y, z, _pv);
  if (_pv[2] <= 0.02) return false;
  out[0] = (_pv[0] / _pv[2] * 0.5 + 0.5) * R.cssW;
  out[1] = (1 - (_pv[1] / _pv[2] * 0.5 + 0.5)) * R.cssH;
  out[2] = _pv[2];
  return true;
}
const _sp = [0, 0, 0];
function drawOverlay() {
  const g = FXC; if (!g) return;
  const p = G.player;
  g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  g.clearRect(0, 0, R.cssW, R.cssH);
  g.textAlign = 'center';
  g.lineJoin = 'round';

  // ---- nameplates ----
  // Walls hide people. Near a town, a plate only draws when you and the owner
  // are in the same room (or both outdoors); otherwise names float through the
  // timber as though the building were not there.
  let hubNear = false;
  for (const hub of POI.hubs) { if (V.dist2(p.x, p.z, hub.x, hub.z) < 130 * 130) { hubNear = true; break; } }
  const plates = [];
  for (const e of G.ents) {
    const d = V.dist(e.x, e.z, p.x, p.z);
    if (d > 78 || e.dead) continue;
    if (hubNear && buildingAt(e.x, e.y + 0.9, e.z) !== G.indoorB) continue;
    plates.push({ e, d });
  }
  plates.sort((a, b) => b.d - a.d);
  for (let i = 0; i < plates.length; i++) {
    const e = plates[i].e, d = plates[i].d;
    const hy = e.y + (e.scale || 1) * (e.kind === 'boss' ? 4.6 : 2.15);
    if (!worldToScreen(e.x, hy, e.z, _sp)) continue;
    const sx = _sp[0], sy = _sp[1];
    const alpha = clamp(1 - (d - 55) / 24, 0.15, 1);
    const isTarget = G.target === e;
    const scale = clamp(1.25 - d / 90, .62, 1.1);
    g.globalAlpha = alpha;
    if (e.kind === 'ai') {
      const rec = e.rec;
      g.font = '700 ' + (11 * scale) + 'px Trebuchet MS,sans-serif';
      const gname = rec.g >= 0 && GUILDS[rec.g] ? GUILDS[rec.g].n : '';
      g.fillStyle = '#000'; g.globalAlpha = alpha * .55;
      g.fillText(e.name, sx + 1, sy + 1);
      g.globalAlpha = alpha;
      g.fillStyle = rec.best >= 5 ? '#ff3f5f' : rec.best >= 4 ? '#ff9a1f' : '#7ee0f0';
      g.fillText(e.name, sx, sy);
      g.font = '' + (9 * scale) + 'px Trebuchet MS,sans-serif';
      g.fillStyle = '#9aa3b4';
      g.fillText('‹' + rec.lv + '› ' + (gname || CLASS_BY[rec.c].n), sx, sy + 11 * scale);
    } else {
      const w = (e.kind === 'boss' ? 72 : 46) * scale, h = 4.6 * scale;
      const frac = clamp(e.hp / e.hpMax, 0, 1);
      g.globalAlpha = alpha * .8;
      g.fillStyle = '#05070c';
      g.fillRect(sx - w / 2 - 1, sy - 1, w + 2, h + 2);
      g.globalAlpha = alpha;
      g.fillStyle = e.kind === 'boss' ? '#c81f3d' : e.rank === 1 ? '#e07a1f' : '#c8362a';
      g.fillRect(sx - w / 2, sy, w * frac, h);
      if (isTarget) { g.strokeStyle = '#f0c257'; g.lineWidth = 1.4; g.strokeRect(sx - w / 2 - 2, sy - 2, w + 4, h + 4); }
      g.font = '700 ' + (10.5 * scale) + 'px Trebuchet MS,sans-serif';
      g.fillStyle = '#000'; g.globalAlpha = alpha * .6;
      g.fillText(e.name + ' ' + e.level, sx + 1, sy - 3 + 1);
      g.globalAlpha = alpha;
      g.fillStyle = e.kind === 'boss' ? '#ff8a6a' : e.rank === 1 ? '#f0c257' : '#e6dcc8';
      g.fillText(e.name + ' ' + e.level, sx, sy - 3);
    }
    // chat bubble
    if (e.bubbleT > 0 && e.bubble) {
      const by = sy - 22 * scale;
      g.font = '' + (11 * scale) + 'px Trebuchet MS,sans-serif';
      const tw = g.measureText(e.bubble).width + 14;
      g.globalAlpha = alpha * clamp(e.bubbleT, 0, 1) * .92;
      g.fillStyle = 'rgba(10,14,22,.92)';
      roundRect(g, sx - tw / 2, by - 14, tw, 19, 7); g.fill();
      g.strokeStyle = 'rgba(240,194,87,.3)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#dfe6f2';
      g.fillText(e.bubble, sx, by);
    }
  }
  g.globalAlpha = 1;

  // ---- player name ----
  if (worldToScreen(p.x, p.y + 2.3, p.z, _sp)) {
    g.font = '700 12px Trebuchet MS,sans-serif';
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(p.name, _sp[0] + 1, _sp[1] + 1);
    g.fillStyle = '#f0c257'; g.fillText(p.name, _sp[0], _sp[1]);
  }

  // ---- floating combat text ----
  for (const d of G.dmg) {
    const t = d.t / 1.5;
    if (hubNear && buildingAt(d.x, d.y + 0.9, d.z) !== G.indoorB) continue;   // same wall rule as the plates
    if (!worldToScreen(d.x + d.ox, d.y + t * 2.4, d.z, _sp)) continue;
    const a = t < .75 ? 1 : (1 - t) * 4;
    g.globalAlpha = clamp(a, 0, 1);
    const big = d.k === 'crit';
    g.font = (big ? '900 ' : '700 ') + (big ? 24 : 16) * clamp(1.2 - _sp[2] / 70, .55, 1.1) + 'px Trebuchet MS,sans-serif';
    g.fillStyle = '#000'; g.fillText(txtOf(d), _sp[0] + 1.5, _sp[1] + 1.5);
    g.fillStyle = d.k === 'crit' ? '#ffd766' : d.k === 'heal' ? '#54c46a' : d.k === 'in' ? '#ff6a6a'
      : d.k === 'dot' ? '#c88ae0' : d.k === 'ally' ? '#8ab4f0' : '#ffffff';
    g.fillText(txtOf(d), _sp[0], _sp[1]);
  }
  g.globalAlpha = 1;

  // ---- boss health bar ----
  const boss = G.ents.find(e => e.kind === 'boss' && !e.dead && e.st === 'chase');
  if (boss) drawBossBar(g, boss);
  // ---- raid progress ----
  if (G.inRaid) {
    g.font = '700 11px Trebuchet MS,sans-serif';
    g.fillStyle = '#f0c257'; g.textAlign = 'center';
    g.fillText(G.inRaid.r.n + '  —  encounter ' + (G.inRaid.boss + 1) + '/' + G.inRaid.r.bosses.length, R.cssW / 2, 112);
  }
}
function txtOf(d) {
  if (d.k === 'heal') return '+' + fmt(d.v);
  if (d.k === 'shield') return 'ABSORB';
  return fmt(d.v);
}
function drawBossBar(g, b) {
  const w = Math.min(R.cssW * .62, 380), h = 12;
  const x = (R.cssW - w) / 2, y = (G.target && !G.target.dead ? 84 : 56);
  g.globalAlpha = .95;
  g.fillStyle = 'rgba(5,7,12,.85)'; roundRect(g, x - 2, y - 2, w + 4, h + 4, 5); g.fill();
  const frac = clamp(b.hp / b.hpMax, 0, 1);
  const grd = g.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, '#e0553f'); grd.addColorStop(1, '#8e1a12');
  g.fillStyle = grd; roundRect(g, x, y, w * frac, h, 4); g.fill();
  g.strokeStyle = 'rgba(240,194,87,.5)'; g.lineWidth = 1; roundRect(g, x - 2, y - 2, w + 4, h + 4, 5); g.stroke();
  g.font = '700 11px Trebuchet MS,sans-serif'; g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.fillText(b.name + (b.title ? ', ' + b.title : '') + '   ' + Math.ceil(frac * 100) + '%', R.cssW / 2, y + h - 2);
  g.globalAlpha = 1;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/* ------------------------------ MINIMAP ------------------------------ */
let mmT = 0, mmBase = null;
function buildMinimapBase() {
  const N = 384;
  mmBase = document.createElement('canvas'); mmBase.width = N; mmBase.height = N;
  const g = mmBase.getContext('2d');
  const img = g.createImageData(N, N);
  const col = [0, 0, 0];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -WORLD_HALF + (i / N) * WORLD_SIZE;
    const z = -WORLD_HALF + (j / N) * WORLD_SIZE;
    const h = terrainH(x, z);
    const o = (j * N + i) * 4;
    if (h < WATER_Y) { img.data[o] = 22; img.data[o + 1] = 52; img.data[o + 2] = 78; }
    else {
      const zn = zoneAt(x, z); const c = zn ? zn.col : [.4, .5, .3];
      const sh = clamp(0.55 + h / 200, .4, 1.25);
      img.data[o] = clamp(c[0] * sh * 255, 0, 255);
      img.data[o + 1] = clamp(c[1] * sh * 255, 0, 255);
      img.data[o + 2] = clamp(c[2] * sh * 255, 0, 255);
    }
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
function drawMinimap(dt) {
  mmT -= dt; if (mmT > 0) return; mmT = 0.14;
  const g = MMC; if (!g) return;
  const p = G.player, S = 208, half = S / 2;
  const range = 190;                        // world units shown across the map
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.arc(half, half, half, 0, TAU); g.clip();
  // terrain slice
  if (mmBase) {
    const px = (p.x + WORLD_HALF) / WORLD_SIZE * mmBase.width;
    const pz = (p.z + WORLD_HALF) / WORLD_SIZE * mmBase.height;
    const srcR = range / WORLD_SIZE * mmBase.width;
    g.imageSmoothingEnabled = true;
    g.fillStyle = '#0a1018'; g.fillRect(0, 0, S, S);
    g.drawImage(mmBase, px - srcR, pz - srcR, srcR * 2, srcR * 2, 0, 0, S, S);
  }
  const w2m = (wx, wz) => [half + (wx - p.x) / range * half, half + (wz - p.z) / range * half];
  // roads
  g.strokeStyle = 'rgba(120,100,70,.55)'; g.lineWidth = 2;
  for (const s of ROADS) {
    if (Math.abs(s.ax - p.x) > range + 160 || Math.abs(s.az - p.z) > range + 160) continue;
    const a = w2m(s.ax, s.az), b = w2m(s.bx, s.bz);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  // POIs
  for (const poi of POI.all) {
    const dx = poi.x - p.x, dz = poi.z - p.z;
    if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
    const m = w2m(poi.x, poi.z);
    g.font = '11px sans-serif'; g.textAlign = 'center';
    const ic = poi.k === 'hub' ? '🏰' : poi.k === 'raid' ? '🐉' : poi.k === 'lair' ? '☠' : poi.k === 'ruin' ? '🗿' : '';
    if (ic) g.fillText(ic, m[0], m[1] + 4);
    else { g.fillStyle = 'rgba(220,120,60,.8)'; g.fillRect(m[0] - 1.5, m[1] - 1.5, 3, 3); }
  }
  // AI adventurers (roster, not just avatars — the world feels populated)
  g.fillStyle = 'rgba(90,208,255,.55)';
  let shown = 0;
  for (const r of ROSTER) {
    const dx = r.x - p.x, dz = r.z - p.z;
    if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
    const m = w2m(r.x, r.z);
    g.fillRect(m[0] - .8, m[1] - .8, 1.6, 1.6);
    if (++shown > 220) break;
  }
  // mobs
  for (const e of G.ents) {
    if (!e.isMob || e.dead) continue;
    const m = w2m(e.x, e.z);
    g.fillStyle = e.kind === 'boss' ? '#ff3f5f' : e.rank === 1 ? '#ffa53f' : '#e0604a';
    const s = e.kind === 'boss' ? 4 : 2.4;
    g.fillRect(m[0] - s / 2, m[1] - s / 2, s, s);
  }
  // quest targets
  g.strokeStyle = '#f0c257'; g.lineWidth = 1.4;
  if (AUTO.goal) {
    const m = w2m(AUTO.goal[0], AUTO.goal[1]);
    g.beginPath(); g.arc(clamp(m[0], 4, S - 4), clamp(m[1], 4, S - 4), 5, 0, TAU); g.stroke();
  }
  // player arrow
  g.save(); g.translate(half, half); g.rotate(-G.camYaw);
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(0, 2.6); g.lineTo(-4.4, 5); g.closePath();
  g.fill(); g.stroke();
  g.restore();
  g.restore();
  // compass ring
  g.strokeStyle = 'rgba(240,194,87,.22)'; g.lineWidth = 1;
  g.beginPath(); g.arc(half, half, half - 1, 0, TAU); g.stroke();
}

/* ------------------------------ INPUT ------------------------------ */
function setupInput() {
  const stick = $('stick'), knob = $('knob');
  const SR = 52;
  let sx0 = 0, sy0 = 0;
  const stickRect = () => stick.getBoundingClientRect();

  function startStick(id, x, y) {
    INPUT.stickId = id;
    const r = stickRect();
    // re-centre the stick under the finger for comfort
    if (Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) > r.width * .6) {
      stick.style.left = (x - r.width / 2 - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sal')) || 0)) + 'px';
      stick.style.bottom = 'auto';
      stick.style.top = (y - r.height / 2) + 'px';
    }
    const rr = stickRect();
    sx0 = rr.left + rr.width / 2; sy0 = rr.top + rr.height / 2;
    stick.classList.add('act');
    moveStick(x, y);
  }
  function moveStick(x, y) {
    let dx = x - sx0, dy = y - sy0;
    const d = Math.hypot(dx, dy);
    if (d > SR) { dx = dx / d * SR; dy = dy / d * SR; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    const m = Math.min(1, d / SR);
    if (m < 0.14) { INPUT.mx = 0; INPUT.mz = 0; return; }
    // joystick is camera-relative
    const ax = dx / (d || 1) * m, az = dy / (d || 1) * m;
    const cy = G.camYaw;
    // Camera-relative basis. Right must match the view matrix, whose x axis is
    // cross(up, eye-target) = (-cos yaw, sin yaw) — not its negation.
    const fx = Math.sin(cy), fz = Math.cos(cy);
    const rx = -Math.cos(cy), rz = Math.sin(cy);
    INPUT.mx = fx * (-az) + rx * ax;
    INPUT.mz = fz * (-az) + rz * ax;
    INPUT.sprint = m > 0.92;
  }
  function endStick() {
    INPUT.stickId = -1; INPUT.mx = 0; INPUT.mz = 0; INPUT.sprint = false;
    knob.style.transform = ''; stick.classList.remove('act');
    stick.style.left = ''; stick.style.top = ''; stick.style.bottom = '';
  }

  let camLast = null, pinchD = 0, tapStart = 0, tapPos = null, moved = 0;
  function onDown(id, x, y, target) {
    if (target && target.closest && target.closest('.ab,#bar,#panel,#autobtn,#jump,#sprint,#interact,#boot,#seasonend,.mb')) return;
    if (INPUT.stickId < 0 && x < innerWidth * 0.46 && y > innerHeight * 0.28) { startStick(id, x, y); return; }
    if (INPUT.camId < 0) {
      INPUT.camId = id; camLast = [x, y]; tapStart = performance.now(); tapPos = [x, y]; moved = 0;
    }
  }
  function onMove(id, x, y) {
    if (id === INPUT.stickId) { moveStick(x, y); return; }
    if (id === INPUT.camId && camLast) {
      const dx = x - camLast[0], dy = y - camLast[1];
      moved += Math.abs(dx) + Math.abs(dy);
      G.camYaw -= dx * 0.0062;
      G.camPitch = clamp(G.camPitch + dy * 0.0052, -0.28, 1.32);
      camLast = [x, y];
    }
  }
  function onUp(id, x, y) {
    if (id === INPUT.stickId) { endStick(); return; }
    if (id === INPUT.camId) {
      INPUT.camId = -1; camLast = null;
      if (moved < 12 && performance.now() - tapStart < 320 && tapPos) tapSelect(tapPos[0], tapPos[1]);
    }
  }
  const cv = document.body;
  cv.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) onDown(t.identifier, t.clientX, t.clientY, e.target);
    if (e.touches.length === 2) {
      pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
    if (e.target && e.target.closest && !e.target.closest('#panel,#boot,#seasonend,input')) e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) onMove(t.identifier, t.clientX, t.clientY);
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinchD) G.camDist = clamp(G.camDist * (pinchD / d), 3.2, 20);
      pinchD = d;
    }
    if (e.target && e.target.closest && !e.target.closest('#panel,#boot,#seasonend,input')) e.preventDefault();
  }, { passive: false });
  const upH = e => { for (const t of e.changedTouches) onUp(t.identifier, t.clientX, t.clientY); pinchD = 0; };
  cv.addEventListener('touchend', upH, { passive: true });
  cv.addEventListener('touchcancel', upH, { passive: true });

  // ---- mouse (desktop) ----
  cv.addEventListener('mousedown', e => { if (e.button === 0) onDown(-9, e.clientX, e.clientY, e.target); });
  window.addEventListener('mousemove', e => onMove(-9, e.clientX, e.clientY));
  window.addEventListener('mouseup', e => onUp(-9, e.clientX, e.clientY));
  window.addEventListener('wheel', e => { G.camDist = clamp(G.camDist + e.deltaY * 0.01, 3.2, 20); }, { passive: true });

  // ---- keyboard ----
  const keys = {};
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = 1;
    if (e.code === 'Space') { INPUT.jump = true; e.preventDefault(); }
    if (e.code === 'Tab') { G.target = pickTarget(G.player, 40); e.preventDefault(); }
    if (e.code === 'KeyF') { setAuto(!G.player.autoOn); }
    if (e.code.startsWith('Digit')) {
      const i = parseInt(e.code.slice(5)) - 1;
      const c = CLASS_BY[G.player.cls];
      if (c.ab[i]) { if (!G.target || G.target.dead) G.target = pickTarget(G.player, 34); castAbility(G.player, c.ab[i], G.target); }
    }
    if (e.code === 'Escape') panelClose();
  });
  window.addEventListener('keyup', e => { keys[e.code] = 0; });
  G.keys = keys;

  // ---- buttons ----
  const btn = (id, fn) => {
    const el2 = $(id);
    el2.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
    el2.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); fn(); });
  };
  btn('jump', () => { INPUT.jump = true; });
  btn('sprint', () => { INPUT.sprintToggle = !INPUT.sprintToggle; $('sprint').classList.toggle('on', INPUT.sprintToggle); sfx('ui', .6); });
  btn('autobtn', () => setAuto(!G.player.autoOn));
  document.querySelectorAll('#bar .mb').forEach(b => {
    const fn = e => { e.preventDefault(); e.stopPropagation(); panelOpen(b.dataset.p); };
    b.addEventListener('touchstart', fn, { passive: false });
    b.addEventListener('mousedown', fn);
  });
  $('pclose').addEventListener('click', panelClose);
  $('panel').addEventListener('click', e => { if (e.target.id === 'panel') panelClose(); });
}
function tapSelect(x, y) {
  const p = G.player;
  let best = null, bd = 70 * 70;
  for (const e of G.ents) {
    if (e.dead) continue;
    if (V.dist2(e.x, e.z, p.x, p.z) > 90 * 90) continue;
    if (!worldToScreen(e.x, e.y + (e.scale || 1) * 1.1, e.z, _sp)) continue;
    const d = (_sp[0] - x) ** 2 + (_sp[1] - y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  if (best && best.isMob) { G.target = best; sfx('ui', .6, 1.3); }
  else if (best && best.kind === 'ai') { showAIInspect(best.rec); }
  else G.target = null;
}
function setAuto(on) {
  const p = G.player;
  p.autoOn = on;
  $('autobtn').classList.toggle('on', on);
  $('autoIc').textContent = on ? '■' : '▶';
  $('autoTx').textContent = on ? 'AUTO ON' : 'AUTO QUEST';
  sfx(on ? 'questdone' : 'ui', .7);
  if (on) { toast('<b style="color:var(--gold)">Auto Quest engaged</b><div class="tiny">Questing, looting, bosses, raids, gear and clans — all handled.</div>', 'sys'); AUTO.reset(); }
  else { INPUT.mx = 0; INPUT.mz = 0; }
}

/* ------------------------------ PANELS ------------------------------ */
let PANEL = null, PANEL_TAB = {};
const PANEL_DEF = {
  char: { t: 'Character', tabs: ['Gear', 'Stats', 'Season'] },
  bag: { t: 'Inventory', tabs: ['Bags', 'Trade Post', 'Sell'] },
  quest: { t: 'Quests', tabs: ['Active', 'Available', 'Completed'] },
  map: { t: 'World Map', tabs: ['Map', 'Zones'] },
  guild: { t: 'Clan', tabs: ['My Clan', 'Clans', 'Wars'] },
  raid: { t: 'Raids & Bosses', tabs: ['Raids', 'World Bosses'] },
  hof: { t: 'Hall of Fame', tabs: ['Top 100', 'Top 20 Clans', 'Ascendants', 'Past Seasons'] },
  social: { t: 'Adventurers', tabs: ['Online', 'Whispers', 'Chat'] },
  opts: { t: 'Settings', tabs: ['Game', 'Graphics', 'Audio', 'About'] },
};
function panelOpen(which) {
  if (PANEL === which) { panelClose(); return; }
  PANEL = which;
  const def = PANEL_DEF[which];
  $('ptitle').textContent = def.t;
  const tabs = $('ptabs'); tabs.innerHTML = '';
  def.tabs.forEach((t, i) => {
    const e = el('div', 'tab' + ((PANEL_TAB[which] || 0) === i ? ' on' : ''), esc(t));
    e.onclick = () => { PANEL_TAB[which] = i; sfx('ui', .6); panelOpen2(); };
    tabs.appendChild(e);
  });
  $('panel').classList.add('on');
  document.querySelectorAll('#bar .mb').forEach(b => b.classList.toggle('on', b.dataset.p === which));
  sfx('open', .7);
  panelOpen2();
}
function panelOpen2() {
  const def = PANEL_DEF[PANEL];
  const tabs = $('ptabs').children;
  for (let i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', (PANEL_TAB[PANEL] || 0) === i);
  renderPanel();
}
function panelClose() {
  PANEL = null;
  $('panel').classList.remove('on');
  document.querySelectorAll('#bar .mb').forEach(b => b.classList.remove('on'));
  hideTip();
}
function renderPanel() {
  if (!PANEL) return;
  const body = $('pbody');
  const tab = PANEL_TAB[PANEL] || 0;
  body.scrollTop = body.scrollTop;
  body.innerHTML = PANEL_RENDER[PANEL] ? PANEL_RENDER[PANEL](tab) : '';
  bindPanelActions(body);
}
function bindPanelActions(root) {
  root.querySelectorAll('[data-act]').forEach(e => {
    e.addEventListener('click', ev => {
      ev.stopPropagation();
      const a = e.dataset.act, v = e.dataset.v;
      PANEL_ACT(a, v, e);
    });
  });
  root.querySelectorAll('[data-tip]').forEach(e => {
    const show = ev => {
      const src = e.dataset.tip, i = +e.dataset.ti;
      let it = null, cmp;
      if (src === 'bag') { it = G.player.bags[i]; cmp = G.player.gear[it && (it.sl === 'ring2' ? 'ring1' : it.sl)]; }
      else if (src === 'gear') { it = G.player.gear[SLOT_KEYS[i]]; }
      else if (src === 'trade') { const o = TRADE_BOARD[i]; if (o) { it = o.it; cmp = G.player.gear[it.sl === 'ring2' ? 'ring1' : it.sl]; } }
      if (it) { const r = e.getBoundingClientRect(); showTip(itemTooltipHTML(it, cmp), r.left + r.width / 2, r.top); }
    };
    e.addEventListener('mouseenter', show);
    e.addEventListener('touchstart', show, { passive: true });
    e.addEventListener('mouseleave', hideTip);
  });
}
