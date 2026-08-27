/* =========================================================================
   IDLE QUEST — 09b PANELS
   Every screen: character, bags & trade post, quest log, world map, clans,
   raids & world bosses, Hall of Fame, the social roster, and settings.
   ========================================================================= */

function cellHTML(it, src, i, extra) {
  if (!it) return '<div class="cell e"></div>';
  return '<div class="cell r' + it.t + '" data-tip="' + src + '" data-ti="' + i + '" ' + (extra || '') + '>' +
    it.ic + '<div class="ilv">' + it.il + '</div></div>';
}
function statRow(k, v) {
  const sd = STATS.find(s => s.k === k);
  return '<div class="row"><span class="k">' + (sd ? sd.n : k) + '</span><b>' + fmt(v) + '</b></div>';
}
function pctRow(n, v) { return '<div class="row"><span class="k">' + n + '</span><b>' + (v * 100).toFixed(1) + '%</b></div>'; }

const PANEL_RENDER = {
  /* ---------------------------------------------------------------- CHAR */
  char(tab) {
    const p = G.player, c = CLASS_BY[p.cls], s = p.st;
    if (tab === 0) {
      let h = '<div class="card"><div style="display:flex;gap:10px;align-items:center">' +
        '<div style="font-size:34px">' + c.ic + '</div><div style="flex:1">' +
        '<div style="font-size:17px;font-weight:800;color:var(--gold)">' + esc(p.name) + '</div>' +
        '<div class="tiny">Level ' + p.level + ' ' + c.n + ' · ' + c.role + '</div>' +
        '<div class="tiny">' + (p.guild != null && GUILDS[p.guild] ? esc(GUILDS[p.guild].n) : 'No clan') + '</div>' +
        '</div><div style="text-align:right"><div style="font-size:19px;font-weight:800;color:#9ad2ff">' + fmt(s.gs) + '</div><div class="tiny">gear score</div></div>' +
        '</div></div>';
      const bt = bestTierOf(p.gear);
      if (bt >= 4) h += '<div class="card center" style="border-color:' + RARITY[bt].c + '"><b class="q' + bt + '">' + RARITY[bt].n.toUpperCase() + ' BEARER</b>' +
        (bt === 5 ? '<div class="tiny">One of only ' + MYTHIC_LIMIT + ' Ascendants this season</div>' : '') + '</div>';
      h += '<h4 class="sec">Equipment</h4>';
      SLOT_KEYS.forEach((k, i) => {
        const it = p.gear[k];
        h += '<div class="eqrow">' + (it ? cellHTML(it, 'gear', i) : '<div class="cell e">' + SLOT_BY[k].ic + '</div>') +
          '<div class="info"><div class="n ' + (it ? 'q' + it.t : 'tiny') + '">' + (it ? esc(it.n) : '— empty ' + SLOT_BY[k].n + ' —') + '</div>' +
          '<div class="s">' + (it ? 'ilvl ' + it.il + ' · score ' + fmt(it.sc) + (it.af.length ? ' · ' + it.af.length + ' affixes' : '') : SLOT_BY[k].n) + '</div></div>' +
          (it ? '<div class="btn sm" data-act="unequip" data-v="' + k + '">Off</div>' : '') + '</div>';
      });
      return h;
    }
    if (tab === 1) {
      let h = '<h4 class="sec">Primary</h4>';
      for (const k of ['str', 'agi', 'int', 'sta']) h += statRow(k, s[k]);
      h += '<h4 class="sec">Secondary</h4>';
      h += pctRow('Critical Strike', s.critP) + pctRow('Haste', s.hasteP) + pctRow('Mastery', s.mastP) +
        pctRow('Versatility', s.versP) + pctRow('Leech', s.leechP) + pctRow('Move Speed', s.speedP) +
        pctRow('Damage Reduction', s.drP);
      h += '<h4 class="sec">Combat</h4>';
      h += '<div class="row"><span class="k">Health</span><b>' + fmt(s.hpMax) + '</b></div>';
      h += '<div class="row"><span class="k">Attack Power</span><b>' + fmt(s.ap) + '</b></div>';
      h += '<div class="row"><span class="k">Weapon Damage</span><b>' + fmt(p.wdps) + '</b></div>';
      h += '<div class="row"><span class="k">Effective DPS</span><b>' + fmt(s.dps) + '</b></div>';
      h += '<div class="row"><span class="k">Armor</span><b>' + fmt(s.arm) + '</b></div>';
      const afk = Object.keys(p.af);
      if (afk.length) {
        h += '<h4 class="sec">Affixes</h4>';
        for (const k of afk) {
          const d = AFFIXES.find(a => a.k === k);
          if (d) h += '<div class="row"><span class="k">' + d.n + '</span><b>' + d.d(p.af[k]) + '</b></div>';
        }
      }
      h += '<h4 class="sec">Abilities</h4>';
      for (const ab of c.ab) {
        h += '<div class="row"><span class="k">' + ab.ic + ' <b style="color:#e9e2cf">' + esc(ab.n) + '</b></span><span class="tiny">' +
          (ab.cd ? ab.cd + 's cd · ' : '') + (ab.cost ? ab.cost + ' ' + c.resN.toLowerCase() + ' · ' : '') +
          (ab.cast ? ab.cast + 's cast · ' : 'instant · ') + Math.round(ab.dmg ? ab.dmg * 100 : 0) + '%</span></div>';
      }
      return h;
    }
    // season / lifetime
    const st = p.stats;
    let h = '<h4 class="sec">This Season</h4>';
    const rows = [['Level', p.level], ['Gear Score', s.gs], ['Gold', fmt(p.gold)], ['Kills', p.kills],
    ['Quests Completed', p.doneCount + ' / ' + DB.quests.length], ['World Bosses', p.bossKills + ' / ' + DB.bosses.length],
    ['Raids Cleared', st.raidsDone + ' / ' + DB.raids.length], ['Deaths', p.deaths], ['Respect', Math.round(p.respect)],
    ['Damage Dealt', fmt(st.dmgDone)], ['Damage Taken', fmt(st.dmgTaken)], ['Healing', fmt(st.healed)],
    ['Items Found', st.itemsFound], ['Gold Earned', fmt(st.goldEarned)], ['Distance Travelled', fmt(st.distance) + ' m'],
    ['Time Played', dur(p.playtime * 1000)], ['Seasons Played', (st.seasons || 0) + 1]];
    for (const [k, v] of rows) h += '<div class="row"><span class="k">' + k + '</span><b>' + v + '</b></div>';
    const hof = hallOfFame(1000);
    const rank = hof.findIndex(r => r.isPlayer) + 1;
    h += '<h4 class="sec">Standing</h4><div class="card center"><div style="font-size:26px;font-weight:900;color:var(--gold)">#' + rank + '</div>' +
      '<div class="tiny">of ' + (POP + 1) + ' adventurers this season</div></div>';
    h += '<div class="hr"></div><div class="tiny center">Season ' + SEASON.num + ' ends in <b style="color:var(--gold)">' + dur(seasonLeft()) + '</b><br>' +
      'Everyone resets to level 1. The Champion is crowned.</div>';
    return h;
  },

  /* ---------------------------------------------------------------- BAG */
  bag(tab) {
    const p = G.player;
    if (tab === 0) {
      let h = '<div class="card" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
        '<div style="flex:1"><b style="color:var(--gold)">' + fmt(p.gold) + 'g</b><div class="tiny">' + p.bags.length + ' / ' + p.bagMax + ' slots</div></div>' +
        '<div class="btn grn sm" data-act="equipbest">⚡ Equip Best</div>' +
        '<div class="btn sm" data-act="selljunk">💰 Sell Junk</div></div>';
      if (!p.bags.length) return h + '<div class="tiny center" style="padding:26px">Your bags are empty. Go kill something.</div>';
      h += '<div class="slotgrid">';
      p.bags.forEach((it, i) => { h += cellHTML(it, 'bag', i, 'data-act="bagclick" data-v="' + i + '"'); });
      h += '</div><div class="tiny center" style="margin-top:8px">Tap an item to equip it. Hold to inspect.</div>';
      h += '<h4 class="sec">Bag Contents</h4>';
      p.bags.forEach((it, i) => {
        const cur = p.gear[it.sl === 'ring2' ? 'ring1' : it.sl];
        const d = it.sc - (cur ? cur.sc : 0);
        h += '<div class="eqrow">' + cellHTML(it, 'bag', i) + '<div class="info"><div class="n q' + it.t + '">' + esc(it.n) + '</div>' +
          '<div class="s">' + SLOT_BY[it.sl].n + ' · ilvl ' + it.il + ' · <span style="color:' + (d >= 0 ? '#4ad24a' : '#e0492f') + '">' +
          (d >= 0 ? '+' : '') + fmt(d) + '</span></div></div>' +
          '<div class="btn sm gold" data-act="equip" data-v="' + i + '">Equip</div>' +
          '<div class="btn sm" data-act="sell" data-v="' + i + '">' + fmt(it.val) + 'g</div></div>';
      });
      return h;
    }
    if (tab === 1) {
      let h = '<div class="tiny">Adventurers list gear here constantly. Prices move with the season.</div>';
      if (!TRADE_BOARD.length) return h + '<div class="tiny center" style="padding:26px">The board is empty right now.</div>';
      TRADE_BOARD.forEach((o, i) => {
        const it = o.it;
        const cur = G.player.gear[it.sl === 'ring2' ? 'ring1' : it.sl];
        const d = it.sc - (cur ? cur.sc : 0);
        h += '<div class="eqrow">' + cellHTML(it, 'trade', i) + '<div class="info"><div class="n q' + it.t + '">' + esc(it.n) + '</div>' +
          '<div class="s">' + esc(o.seller) + ' · ilvl ' + it.il + ' · <span style="color:' + (d >= 0 ? '#4ad24a' : '#e0492f') + '">' + (d >= 0 ? '+' : '') + fmt(d) + '</span></div></div>' +
          '<div class="btn sm ' + (G.player.gold >= o.price ? 'gold' : 'dis') + '" data-act="buy" data-v="' + i + '">' + fmt(o.price) + 'g</div></div>';
      });
      return h;
    }
    let h = '';
    if (OFFERS.length) {
      h += '<h4 class="sec">Offers for your gear</h4>';
      for (const o of OFFERS) {
        const it = p.bags.find(b => b.u === o.uid);
        if (!it) continue;
        h += '<div class="eqrow" style="border-color:rgba(240,166,60,.4)"><div class="cell r' + it.t + '">' + it.ic + '</div>' +
          '<div class="info"><div class="n q' + it.t + '">' + esc(it.n) + '</div>' +
          '<div class="s">' + esc(o.buyer) + ' offers <b style="color:var(--gold)">' + fmt(o.price) + 'g</b> (vendor ' + fmt(it.val) + 'g)</div></div>' +
          '<div class="btn sm gold" data-act="offer" data-v="' + o.id + '">Accept</div></div>';
      }
    }
    h += '<div class="tiny">Sell straight to other adventurers at a small premium over vendor price.</div>';
    if (!p.bags.length) return h + '<div class="tiny center" style="padding:26px">Nothing to sell.</div>';
    p.bags.forEach((it, i) => {
      h += '<div class="eqrow">' + cellHTML(it, 'bag', i) + '<div class="info"><div class="n q' + it.t + '">' + esc(it.n) + '</div>' +
        '<div class="s">' + SLOT_BY[it.sl].n + ' · ilvl ' + it.il + '</div></div>' +
        '<div class="btn sm grn" data-act="board" data-v="' + i + '">List ' + fmt(Math.round(it.val * 1.25)) + 'g</div></div>';
    });
    return h;
  },

  /* ---------------------------------------------------------------- QUEST */
  quest(tab) {
    const p = G.player;
    if (tab === 0) {
      if (!p.quests.length) return '<div class="tiny center" style="padding:26px">No active quests.<br>Open <b>Available</b> or turn on <b>Auto Quest</b>.</div>' +
        '<div class="btn wide gold" data-act="autopick">Accept 6 quests near me</div>';
      let h = '<div class="tiny">' + p.quests.length + ' / ' + MAX_QUESTS + ' quests</div>';
      for (const a of p.quests) {
        const q = DB.quests[a.id], done = a.prog >= q.need;
        h += '<div class="card" style="margin-bottom:6px' + (done ? ';border-color:#4ad24a' : '') + '">' +
          '<div style="display:flex;gap:7px"><div style="font-size:20px">' + q.ic + '</div><div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;color:' + (done ? '#4ad24a' : 'var(--gold)') + '">' + esc(q.n) + '</div>' +
          '<div class="tiny">' + esc(DB.zones[q.z].n) + ' · Level ' + q.lv + '</div></div>' +
          '<div style="text-align:right"><b>' + a.prog + '/' + q.need + '</b></div></div>' +
          '<div class="tiny" style="margin-top:5px">' + esc(q.d) + '</div>' +
          '<div class="tiny" style="margin-top:3px;color:#9ad2ff">' + esc(objectiveText(q)) + '</div>' +
          '<div style="display:flex;gap:5px;margin-top:6px">' +
          (done ? '<div class="btn grn sm" data-act="turnin" data-v="' + q.id + '">Turn In (+' + fmt(questXP(p.level, q.t)) + ' xp)</div>'
            : '<div class="btn sm" data-act="track" data-v="' + q.id + '">Navigate</div>') +
          '<div class="btn red sm" data-act="abandon" data-v="' + q.id + '">Abandon</div></div></div>';
      }
      return h;
    }
    if (tab === 1) {
      const zn = zoneAt(p.x, p.z);
      const list = availableQuests(p, null).slice(0, 40);
      let h = '<div class="btn wide gold" data-act="autopick">Accept 6 best quests</div><div class="hr"></div>';
      h += '<div class="tiny">Showing ' + list.length + ' of ' + DB.quests.length + ' quests in the world, sorted by how well they match your level.</div>';
      for (const q of list) {
        h += '<div class="eqrow"><div class="cell" style="border-color:#3a4a66">' + q.ic + '</div>' +
          '<div class="info"><div class="n">' + esc(q.n) + '</div><div class="s">' + esc(DB.zones[q.z].n) + ' · Lv ' + q.lv + ' · ' + esc(objectiveText(q)) + ' ×' + q.need + '</div></div>' +
          '<div class="btn sm gold" data-act="accept" data-v="' + q.id + '">Accept</div></div>';
      }
      return h;
    }
    return '<div class="card center"><div style="font-size:26px;font-weight:900;color:var(--gold)">' + p.doneCount + '</div>' +
      '<div class="tiny">quests completed of ' + DB.quests.length + ' in the world</div>' +
      '<div class="bar" style="margin-top:8px"><i style="width:' + (p.doneCount / DB.quests.length * 100) + '%;background:linear-gradient(180deg,#f0c257,#a8761a)"></i></div></div>' +
      '<h4 class="sec">By Zone</h4>' + DB.zones.map(z => {
        const total = DB.byZone[z.id].length;
        const done = DB.byZone[z.id].filter(q => p.done[q.id]).length;
        return '<div class="row"><span class="k">' + esc(z.n) + '</span><b>' + done + ' / ' + total + '</b></div>';
      }).join('');
  },

  /* ---------------------------------------------------------------- MAP */
  map(tab) {
    const p = G.player;
    if (tab === 0) {
      return '<canvas id="bigmap" width="600" height="600" style="width:100%;max-width:560px;display:block;margin:0 auto;border-radius:12px;border:1px solid var(--edge2)"></canvas>' +
        '<div class="tiny center" style="margin-top:6px">You are the gold arrow. Blue dots are the ' + POP + ' live adventurers. Tap a zone below to set a travel goal.</div>';
    }
    let h = '';
    for (const z of DB.zones) {
      const here = zoneAt(p.x, p.z) === z;
      const total = DB.byZone[z.id].length, done = DB.byZone[z.id].filter(q => p.done[q.id]).length;
      const pop = ROSTER.reduce((a, r) => a + (zoneAt(r.x, r.z) === z ? 1 : 0), 0);
      h += '<div class="card click" data-act="travel" data-v="' + z.id + '" style="margin-bottom:6px' + (here ? ';border-color:var(--gold)' : '') + '">' +
        '<div style="display:flex;gap:8px;align-items:center"><div style="flex:1">' +
        '<b style="color:' + (here ? 'var(--gold)' : '#e9e2cf') + '">' + esc(z.n) + '</b>' +
        '<div class="tiny">Levels ' + z.lvMin + '–' + z.lvMax + ' · ' + esc(z.hub) + ' · ' + esc(z.biome) + '</div>' +
        '<div class="tiny">' + done + '/' + total + ' quests · ' + pop + ' adventurers here</div></div>' +
        '<div class="pill">' + (here ? 'HERE' : 'travel') + '</div></div></div>';
    }
    return h;
  },

  /* ---------------------------------------------------------------- GUILD */
  guild(tab) {
    const p = G.player;
    if (tab === 0) {
      if (p.guild == null || !GUILDS[p.guild]) {
        return '<div class="card center"><b>You have no clan.</b><div class="tiny" style="margin:6px 0">Clans earn respect together, fight clan wars, and run raids. Join one from the <b>Clans</b> tab, or found your own.</div>' +
          '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap"><input id="gname" maxlength="20" placeholder="Clan name" style="background:#0d1320;border:1px solid var(--edge2);color:var(--txt);border-radius:9px;padding:9px 11px;font-family:inherit;font-size:14px">' +
          '<div class="btn gold" data-act="found">Found (5,000g)</div></div></div>';
      }
      const g = GUILDS[p.guild], st = guildStats(g);
      const rank = guildHall(1000).findIndex(x => x.i === g.i) + 1;
      let h = '<div class="card"><div style="display:flex;align-items:center;gap:9px">' +
        '<div style="width:12px;height:38px;border-radius:4px;background:' + g.col + '"></div><div style="flex:1">' +
        '<div style="font-size:17px;font-weight:800;color:var(--gold)">' + esc(g.n) + '</div>' +
        '<div class="tiny">"' + esc(g.motto) + '"</div></div>' +
        '<div style="text-align:right"><div style="font-size:19px;font-weight:800">#' + rank + '</div><div class="tiny">clan rank</div></div></div></div>';
      h += '<div class="grid g3" style="margin-top:6px">' +
        '<div class="card center"><b>' + fmt(Math.round(g.respect)) + '</b><div class="tiny">respect</div></div>' +
        '<div class="card center"><b>' + g.wins + 'W ' + g.losses + 'L</b><div class="tiny">clan wars</div></div>' +
        '<div class="card center"><b>' + st.n + '</b><div class="tiny">members</div></div></div>';
      h += '<div class="grid g3" style="margin-top:6px">' +
        '<div class="card center"><b>' + st.avgLv + '</b><div class="tiny">avg level</div></div>' +
        '<div class="card center"><b>' + fmt(st.gs) + '</b><div class="tiny">total gear</div></div>' +
        '<div class="card center"><b>' + g.raids + '</b><div class="tiny">raids cleared</div></div></div>';
      h += '<h4 class="sec">Roster</h4>';
      const mem = g.members.map(i => ROSTER[i]).filter(Boolean).sort((a, b) => b.lv - a.lv);
      h += '<table class="lb"><tr><th></th><th>Name</th><th>Lv</th><th>Class</th><th>Gear</th><th>Doing</th></tr>';
      if (g.playerGuild) h += '<tr class="me"><td class="rk">★</td><td><b>' + esc(p.name) + '</b></td><td>' + p.level + '</td><td>' + CLASS_BY[p.cls].n + '</td><td>' + fmt(p.st.gs) + '</td><td>you</td></tr>';
      mem.forEach((r, i) => {
        h += '<tr data-act="inspect" data-v="' + r.i + '"><td class="rk">' + (i + 1) + '</td><td class="q' + Math.max(0, r.best) + '">' + esc(r.n) + '</td><td>' + r.lv + '</td><td>' +
          CLASS_BY[r.c].n + '</td><td>' + fmt(r.gs) + '</td><td class="tiny">' + (AI_STATES.find(s => s.k === r.st) || { n: '—' }).n + '</td></tr>';
      });
      h += '</table><div class="btn red wide" style="margin-top:9px" data-act="leave">Leave Clan</div>';
      return h;
    }
    if (tab === 1) {
      const list = guildHall(GUILD_COUNT + 8);
      let h = '<div class="tiny">' + GUILDS.length + ' clans are active this season. Tap to join.</div>';
      list.forEach((g, i) => {
        const st = guildStats(g);
        h += '<div class="card click" data-act="join" data-v="' + g.i + '" style="margin-bottom:5px">' +
          '<div style="display:flex;align-items:center;gap:8px">' +
          '<div class="rk r' + (i + 1) + '" style="width:26px;font-weight:800">' + (i + 1) + '</div>' +
          '<div style="width:8px;height:26px;border-radius:3px;background:' + g.col + '"></div>' +
          '<div style="flex:1;min-width:0"><b>' + esc(g.n) + '</b><div class="tiny">' + st.n + ' members · avg lv ' + st.avgLv + ' · ' + g.wins + 'W/' + g.losses + 'L</div></div>' +
          '<div style="text-align:right"><b style="color:var(--gold)">' + fmt(Math.round(g.respect)) + '</b><div class="tiny">respect</div></div></div></div>';
      });
      return h;
    }
    let h = '<div class="tiny">Clan wars resolve automatically across the season. Respect is staked on every fight.</div>';
    if (!WAR_LOG.length) return h + '<div class="tiny center" style="padding:26px">No wars fought yet.</div>';
    for (const w of WAR_LOG.slice(0, 40)) {
      h += '<div class="row"><span class="k">' + new Date(w.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>' +
        '<span><b style="color:#4ad24a">' + esc(w.w) + '</b> beat <span style="color:#e0492f">' + esc(w.l) + '</span> <b class="tiny">+' + w.s + '</b></span></div>';
    }
    return h;
  },

  /* ---------------------------------------------------------------- RAID */
  raid(tab) {
    const p = G.player;
    if (tab === 0) {
      let h = '<div class="tiny">' + DB.raids.length + ' raids. Bigger tiers mean more encounters, better loot and more clan respect.</div>';
      const list = DB.raids.slice().sort((a, b) => Math.abs(a.lv - p.level) - Math.abs(b.lv - p.level));
      for (const r of list) {
        const err = raidAvailable(r);
        h += '<div class="card" style="margin-bottom:5px">' +
          '<div style="display:flex;gap:8px;align-items:center"><div style="font-size:22px">' + r.ic + '</div>' +
          '<div style="flex:1;min-width:0"><b style="color:var(--gold)">' + esc(r.n) + '</b>' +
          '<div class="tiny">' + esc(DB.zones[r.z].n) + ' · Lv ' + r.lv + ' · ' + r.size + '-player · ' + r.bosses.length + ' bosses</div>' +
          '<div class="tiny">Rewards ' + fmt(r.gold) + 'g · ' + r.respect + ' respect · <span class="q' + r.lootTier + '">' + RARITY[r.lootTier].n + '+</span> loot</div></div>' +
          '<div class="btn sm ' + (err ? 'dis' : 'gold') + '" data-act="raid" data-v="' + r.id + '">' + (err ? esc(err) : 'Enter') + '</div></div></div>';
      }
      return h;
    }
    let h = '<div class="tiny">' + DB.bosses.length + ' world bosses roam the zones. They respawn on timers.</div>';
    const list = DB.bosses.slice().sort((a, b) => Math.abs(a.lv - p.level) - Math.abs(b.lv - p.level));
    for (const b of list) {
      const up = (BOSS_STATE[b.id] || 0) <= G.t;
      h += '<div class="eqrow"><div class="cell" style="border-color:#8a35c8;font-size:19px">' + b.ic + '</div>' +
        '<div class="info"><div class="n" style="color:#ff8a6a">' + esc(b.n) + ', ' + esc(b.t) + '</div>' +
        '<div class="s">' + esc(DB.zones[b.z].n) + ' · Lv ' + b.lv + ' · ' + b.mech.length + ' mechanics · <span class="q' + b.lootTier + '">' + RARITY[b.lootTier].n + '+</span></div></div>' +
        '<div class="btn sm ' + (up ? '' : 'dis') + '" data-act="travelboss" data-v="' + b.id + '">' + (up ? 'Track' : 'Down') + '</div></div>';
    }
    return h;
  },

  /* ---------------------------------------------------------------- HOF */
  hof(tab) {
    if (tab === 0) {
      const list = hallOfFame(100);
      let h = '<div class="tiny">Top 100 of ' + (POP + 1) + ' adventurers · Season ' + SEASON.num + ' · ends in <b style="color:var(--gold)">' + dur(seasonLeft()) + '</b></div>';
      h += '<table class="lb"><tr><th>#</th><th>Name</th><th>Lv</th><th>Class</th><th>Gear</th><th>Best</th><th>Clan</th><th>Gold</th></tr>';
      list.forEach((r, i) => {
        const g = r.g >= 0 && GUILDS[r.g] ? GUILDS[r.g].n : '—';
        h += '<tr class="' + (r.isPlayer ? 'me' : '') + '" data-act="inspect" data-v="' + r.i + '">' +
          '<td class="rk r' + (i + 1) + '">' + (i + 1) + '</td>' +
          '<td class="q' + Math.max(0, r.best) + '">' + esc(r.n) + (r.title ? ' <span class="tiny">' + esc(r.title) + '</span>' : '') + '</td>' +
          '<td>' + r.lv + '</td><td class="tiny">' + CLASS_BY[r.c].n + '</td><td>' + fmt(r.gs) + '</td>' +
          '<td class="q' + Math.max(0, r.best) + '">' + (r.best >= 0 ? RARITY[r.best].n.slice(0, 4) : '—') + '</td>' +
          '<td class="tiny">' + esc(g) + '</td><td class="tiny">' + fmt(r.gold) + '</td></tr>';
      });
      return h + '</table>';
    }
    if (tab === 1) {
      const list = guildHall(20);
      let h = '<div class="tiny">Top 20 clans by respect, power, wars won and raids cleared.</div>';
      h += '<table class="lb"><tr><th>#</th><th>Clan</th><th>Members</th><th>Avg Lv</th><th>Respect</th><th>W/L</th><th>Raids</th></tr>';
      list.forEach((g, i) => {
        const st = guildStats(g);
        h += '<tr class="' + (g.playerGuild ? 'me' : '') + '" data-act="guildinfo" data-v="' + g.i + '">' +
          '<td class="rk r' + (i + 1) + '">' + (i + 1) + '</td><td style="color:' + g.col + '">' + esc(g.n) + '</td>' +
          '<td>' + st.n + '</td><td>' + st.avgLv + '</td><td><b>' + fmt(Math.round(g.respect)) + '</b></td>' +
          '<td class="tiny">' + g.wins + '/' + g.losses + '</td><td>' + g.raids + '</td></tr>';
      });
      h += '</table><div class="tiny center" style="margin-top:8px">Tap a clan to see its full roster.</div>';
      return h;
    }
    if (tab === 2) {
      let h = '<div class="card center"><b style="color:#ff3f5f;font-size:16px">THE ASCENDANTS</b>' +
        '<div class="tiny" style="margin-top:4px">Only <b>' + MYTHIC_LIMIT + '</b> adventurers in the entire world may ever bear Mythic gear in a season. ' +
        (MYTHIC_LIMIT - MYTHIC_HOLDERS.size) + ' seat(s) remain.</div></div>';
      const holders = [];
      for (const id of MYTHIC_HOLDERS) {
        if (id === -1 && G.player) holders.push(playerAsRecord());
        else if (ROSTER[id]) holders.push(ROSTER[id]);
      }
      if (!holders.length) return h + '<div class="tiny center" style="padding:26px">No one has ascended yet this season.<br>Mythic gear drops from the hardest raids and world bosses.</div>';
      holders.sort((a, b) => hofScore(b) - hofScore(a));
      for (const r of holders) {
        h += '<div class="card" style="border-color:#ff3f5f;margin-top:6px"><div style="display:flex;gap:8px;align-items:center">' +
          '<div style="font-size:26px">' + CLASS_BY[r.c].ic + '</div><div style="flex:1">' +
          '<b class="q5">' + esc(r.n) + '</b><div class="tiny">Level ' + r.lv + ' ' + CLASS_BY[r.c].n + ' · ' + fmt(r.gs) + ' gear · ' +
          (r.g >= 0 && GUILDS[r.g] ? esc(GUILDS[r.g].n) : 'no clan') + '</div></div></div></div>';
      }
      return h;
    }
    let h = '<div class="tiny">Every season ends with a Champion. Their name stays here forever.</div>';
    if (!SEASON.champions.length) return h + '<div class="tiny center" style="padding:26px">No season has ended yet.<br>Season ' + SEASON.num + ' ends in <b style="color:var(--gold)">' + dur(seasonLeft()) + '</b>.</div>';
    for (const c of SEASON.champions) {
      h += '<div class="card" style="margin-bottom:6px;border-color:var(--gold)"><div style="display:flex;gap:8px;align-items:center">' +
        '<div style="font-size:24px">🏆</div><div style="flex:1"><b style="color:var(--gold)">Season ' + c.num + ' — ' + esc(c.champ.n) + '</b>' +
        '<div class="tiny">Level ' + c.champ.lv + ' ' + CLASS_BY[c.champ.c].n + ' · ' + fmt(c.champ.gs) + ' gear · ' +
        (c.champ.best >= 0 ? RARITY[c.champ.best].n : '—') + ' · ' + esc(c.champ.guild || 'no clan') + '</div>' +
        '<div class="tiny">Top clan: ' + esc(c.guild ? c.guild.n : '—') + ' · you finished #' + c.playerRank + ' at level ' + c.playerLv + '</div></div></div></div>';
    }
    return h;
  },

  /* ---------------------------------------------------------------- SOCIAL */
  social(tab) {
    if (tab === 0) {
      const near = ROSTER.slice().sort((a, b) => V.dist2(a.x, a.z, G.player.x, G.player.z) - V.dist2(b.x, b.z, G.player.x, G.player.z)).slice(0, 60);
      let h = '<div class="tiny">' + POP + ' adventurers are online. Nearest first — every one of them is really out there.</div>';
      h += '<table class="lb"><tr><th>Name</th><th>Lv</th><th>Class</th><th>Doing</th><th>Zone</th><th>Dist</th></tr>';
      for (const r of near) {
        const zn = zoneAt(r.x, r.z);
        const d = V.dist(r.x, r.z, G.player.x, G.player.z);
        h += '<tr data-act="inspect" data-v="' + r.i + '"><td class="q' + Math.max(0, r.best) + '">' + esc(r.n) + '</td><td>' + r.lv + '</td>' +
          '<td class="tiny">' + CLASS_BY[r.c].n + '</td><td class="tiny">' + (AI_STATES.find(s => s.k === r.st) || { n: '—' }).n + '</td>' +
          '<td class="tiny">' + esc(zn ? zn.n : '—') + '</td><td class="tiny">' + Math.round(d) + 'm</td></tr>';
      }
      return h + '</table>';
    }
    let h = '<div class="tiny">World, clan and trade chatter from the whole server.</div><div style="margin-top:6px">';
    for (let i = CHAT_LOG.length - 1; i >= 0; i--) {
      const c = CHAT_LOG[i];
      h += '<div class="c-' + c.k + '" style="font-size:12px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)">' + esc(c.t) + '</div>';
    }
    return h + '</div>';
  },

  /* ---------------------------------------------------------------- OPTS */
  opts(tab) {
    if (tab === 0) {
      const p = G.player;
      return '<h4 class="sec">Auto Quest</h4>' +
        '<div class="tiny">The AI plays the whole game for you: picks and completes quests, kills bosses, runs raids, equips upgrades, sells junk, joins a clan and banks gold. Toggle it any time.</div>' +
        '<div class="btn wide ' + (p.autoOn ? 'grn' : 'gold') + '" style="margin-top:7px" data-act="toggleauto">' + (p.autoOn ? 'Auto Quest is ON — tap to stop' : 'Turn Auto Quest ON') + '</div>' +
        '<h4 class="sec">Auto Priorities</h4>' +
        ['all', 'quest', 'boss', 'raid', 'grind'].map(m =>
          '<div class="btn wide' + (p.autoMode === m ? ' gold' : '') + '" style="margin-bottom:4px" data-act="automode" data-v="' + m + '">' +
          ({ all: 'Everything (recommended)', quest: 'Quests only', boss: 'Hunt world bosses', raid: 'Raid nonstop', grind: 'Grind mobs' })[m] + '</div>').join('') +
        '<h4 class="sec">Save</h4>' +
        '<div class="btn wide" data-act="save">Save now</div>' +
        '<div class="btn wide red" style="margin-top:5px" data-act="wipe">Delete save & restart season</div>' +
        '<div class="tiny center" style="margin-top:8px">The game saves automatically every 20 seconds and when you leave.</div>';
    }
    if (tab === 1) {
      return '<h4 class="sec">Quality</h4>' +
        [['High', 2], ['Medium', 1], ['Low', 0]].map(([n, v]) =>
          '<div class="btn wide' + (R.quality === v ? ' gold' : '') + '" style="margin-bottom:4px" data-act="quality" data-v="' + v + '">' + n + '</div>').join('') +
        '<div class="tiny">High: 4× MSAA, 2048 shadows, grass, bloom, 430m view. Medium halves it. Low turns off grass and post for maximum frame rate.</div>' +
        '<h4 class="sec">Resolution scale</h4>' +
        [['Native (sharpest)', 100], ['90%', 90], ['80%', 80], ['70%', 70]].map(([n, v]) =>
          '<div class="btn wide' + (Math.round(SET.rscale * 100) === v ? ' gold' : '') + '" style="margin-bottom:4px" data-act="rscale" data-v="' + v + '">' + n + '</div>').join('') +
        '<h4 class="sec">Renderer</h4>' +
        '<div class="row"><span class="k">Backend</span><b>WebGL2' + (R.hdr ? ' HDR' : '') + '</b></div>' +
        '<div class="row"><span class="k">MSAA</span><b>' + (R.msaa || 'off') + '×</b></div>' +
        '<div class="row"><span class="k">Shadow map</span><b>' + R.shadowSize + 'px</b></div>' +
        '<div class="row"><span class="k">Buffer</span><b>' + R.w + '×' + R.h + '</b></div>' +
        '<div class="row"><span class="k">Frame rate</span><b>' + (R.fps | 0) + ' fps</b></div>' +
        '<div class="btn wide' + (SET.perf ? ' gold' : '') + '" style="margin-top:8px" data-act="perf">' +
        (SET.perf ? 'Hide the on-screen counter' : 'Show an on-screen performance counter') + '</div>';
    }
    if (tab === 2) {
      return '<h4 class="sec">Music</h4>' +
        '<input type="range" min="0" max="100" value="' + Math.round(A.volMusic * 100) + '" data-act="volm" style="width:100%">' +
        '<div class="tiny">A live orchestral score — it changes for towns, wilds, combat, bosses, raids and night. Nothing is a recording; every note is synthesised as you play.</div>' +
        '<h4 class="sec">Sound Effects</h4>' +
        '<input type="range" min="0" max="100" value="' + Math.round(A.volSfx * 100) + '" data-act="vols" style="width:100%">' +
        '<h4 class="sec">Now playing</h4>' +
        '<div class="row"><span class="k">Cue</span><b>' + (A.state || '—') + '</b></div>' +
        '<div class="row"><span class="k">Tempo</span><b>' + A.bpm + ' bpm</b></div>' +
        '<div class="row"><span class="k">Mode</span><b>' + (A.score ? A.score.mode : '—') + '</b></div>' +
        '<div class="btn wide" style="margin-top:8px" data-act="mute">' + (A.muted ? 'Unmute' : 'Mute all audio') + '</div>';
    }
    return '<div class="card"><b style="color:var(--gold)">IDLE QUEST</b>' +
      '<div class="tiny" style="margin-top:5px">A 3D open-world idle MMO in a single HTML file. No engine, no assets, no server — the terrain, the music, the items, the quests and all ' + POP + ' rival adventurers are generated in your browser.</div></div>' +
      '<h4 class="sec">The world</h4>' +
      '<div class="row"><span class="k">Zones</span><b>' + DB.zones.length + '</b></div>' +
      '<div class="row"><span class="k">Quests</span><b>' + DB.quests.length + '</b></div>' +
      '<div class="row"><span class="k">World bosses</span><b>' + DB.bosses.length + '</b></div>' +
      '<div class="row"><span class="k">Raids</span><b>' + DB.raids.length + '</b></div>' +
      '<div class="row"><span class="k">Live adventurers</span><b>' + POP + '</b></div>' +
      '<div class="row"><span class="k">Clans</span><b>' + GUILDS.length + '</b></div>' +
      '<div class="row"><span class="k">Rarity tiers</span><b>6 (Common → Mythic)</b></div>' +
      '<div class="row"><span class="k">Level cap</span><b>none</b></div>' +
      '<div class="row"><span class="k">Item cap</span><b>none</b></div>' +
      '<div class="row"><span class="k">Season length</span><b>7 real days</b></div>' +
      '<div class="row"><span class="k">World size</span><b>' + (WORLD_SIZE / 1000).toFixed(1) + ' km²</b></div>' +
      '<h4 class="sec">Controls</h4>' +
      '<div class="tiny">Left half of the screen: move (push to the edge to sprint). Right half: swipe to look, pinch to zoom, tap an enemy to target. ' +
      'Buttons bottom-right are your abilities. On a keyboard: WASD, Space, 1–6, Tab to target, F for auto.</div>';
  },
};

/* ------------------------------ PANEL ACTIONS ------------------------------ */
function PANEL_ACT(a, v, node) {
  const p = G.player;
  switch (a) {
    case 'equip': equipItem(p, +v); uiDirty.bag = 1; renderPanel(); break;
    case 'bagclick': equipItem(p, +v); renderPanel(); break;
    case 'unequip': {
      const it = p.gear[v];
      if (it) { delete p.gear[v]; p.bags.push(it); p.st = calcStats(p); styleFromGear(p, p.gear, p.cls); sfx('ui', .7); }
      renderPanel(); break;
    }
    case 'sell': {
      const it = p.bags[+v];
      if (it) { p.bags.splice(+v, 1); giveGold(p, it.val); sfx('coin', .9); }
      renderPanel(); break;
    }
    case 'board': sellToBoard(+v); renderPanel(); break;
    case 'offer': acceptOffer(+v); renderPanel(); break;
    case 'buy': buyTrade(+v); renderPanel(); break;
    case 'equipbest': { const n = autoEquipBest(p); toast(n ? 'Equipped ' + n + ' upgrade' + (n > 1 ? 's' : '') : 'Nothing better in your bags.', 'sys'); renderPanel(); break; }
    case 'selljunk': { const r = sellJunk(p); toast(r.n ? 'Sold ' + r.n + ' items for ' + fmt(r.g) + 'g' : 'No junk to sell.', 'sys'); renderPanel(); break; }
    case 'accept': acceptQuest(p, +v); renderPanel(); break;
    case 'abandon': abandonQuest(p, +v); renderPanel(); break;
    case 'turnin': turnInQuest(p, +v); renderPanel(); break;
    case 'autopick': { let n = 0; for (const q of availableQuests(p, null)) { if (n >= 6) break; if (acceptQuest(p, q.id)) n++; } renderPanel(); break; }
    case 'track': { const q = DB.quests[+v]; AUTO.setGoalZone(q.z); toast('Navigating to ' + esc(DB.zones[q.z].n), 'sys'); panelClose(); break; }
    case 'travel': { AUTO.setGoalZone(+v); toast('Travelling to ' + esc(DB.zones[+v].n), 'sys'); panelClose(); break; }
    case 'travelboss': { const b = DB.bosses[+v]; AUTO.setGoal(b.x, b.z2, 'boss'); toast('Tracking ' + esc(b.n), 'sys'); panelClose(); break; }
    case 'raid': startRaid(+v); break;
    case 'join': joinGuild(+v); renderPanel(); break;
    case 'leave': leaveGuild(); renderPanel(); break;
    case 'found': { const inp = $('gname'); foundGuild(inp && inp.value ? inp.value : 'The ' + p.name + ' Company'); renderPanel(); break; }
    case 'guildinfo': { PANEL_TAB.guild = 0; showGuildInspect(+v); break; }
    case 'inspect': showAIInspect(+v === -1 ? null : ROSTER[+v]); break;
    case 'toggleauto': setAuto(!p.autoOn); renderPanel(); break;
    case 'automode': p.autoMode = v; AUTO.reset(); renderPanel(); break;
    case 'quality': R.quality = +v; applyQuality(); renderPanel(); break;
    case 'rscale': SET.rscale = +v / 100; onResize(); renderPanel(); break;
    case 'save': saveGame(); toast('Saved.', 'sys'); break;
    case 'wipe': if (confirm('Delete your save and start a fresh season?')) { localStorage.removeItem(SAVE_KEY); location.reload(); } break;
    case 'findplayer': { const r = ROSTER[+v]; if (r) { AUTO.setGoal(r.x, r.z, 'travel', r.n); toast('Marked ' + esc(r.n) + ' on your map', 'sys'); panelClose(); } break; }
    case 'perf': SET.perf = !SET.perf; renderPanel(); break;
    case 'mute': A.muted = !A.muted; audioSetVol(A.volMusic, A.volSfx); renderPanel(); break;
  }
}
/* range inputs need their own binding */
document.addEventListener('input', e => {
  const a = e.target && e.target.dataset && e.target.dataset.act;
  if (a === 'volm') { A.volMusic = e.target.value / 100; audioSetVol(A.volMusic, A.volSfx); SET.volm = A.volMusic; }
  if (a === 'vols') { A.volSfx = e.target.value / 100; audioSetVol(A.volMusic, A.volSfx); SET.vols = A.volSfx; }
});

/* ------------------------------ INSPECT ------------------------------ */
function showAIInspect(rec) {
  if (!rec) return;
  const g = rec.g >= 0 && GUILDS[rec.g] ? GUILDS[rec.g] : null;
  const cls = CLASS_BY[rec.c];
  const hof = hallOfFame(1000);
  const rank = hof.findIndex(r => r.i === rec.i) + 1;
  let h = '<div class="card"><div style="display:flex;gap:10px;align-items:center">' +
    '<div style="font-size:32px">' + cls.ic + '</div><div style="flex:1">' +
    '<div style="font-size:17px;font-weight:800" class="q' + Math.max(0, rec.best) + '">' + esc(rec.n) + (rec.title ? ' <span class="tiny">' + esc(rec.title) + '</span>' : '') + '</div>' +
    '<div class="tiny">Level ' + rec.lv + ' ' + cls.n + ' · ' + (g ? esc(g.n) : 'no clan') + '</div>' +
    '<div class="tiny">Currently ' + (AI_STATES.find(s => s.k === rec.st) || { n: '—' }).n + ' in ' + esc((zoneAt(rec.x, rec.z) || { n: '?' }).n) + '</div>' +
    '</div><div style="text-align:right"><div style="font-size:20px;font-weight:800;color:var(--gold)">#' + rank + '</div><div class="tiny">world rank</div></div></div></div>';
  h += '<h4 class="sec">Gear</h4><div class="slotgrid">';
  for (let i = 0; i < 15; i++) {
    if (!rec.gt[i]) { h += '<div class="cell e">' + SLOTS[i].ic + '</div>'; continue; }
    h += '<div class="cell r' + (rec.gt[i] - 1) + '">' + SLOTS[i].ic + '<div class="ilv">' + rec.gi[i] + '</div></div>';
  }
  h += '</div>';
  h += '<h4 class="sec">Record</h4>' +
    '<div class="row"><span class="k">Gear Score</span><b>' + fmt(rec.gs) + '</b></div>' +
    '<div class="row"><span class="k">Best Rarity</span><b class="q' + Math.max(0, rec.best) + '">' + (rec.best >= 0 ? RARITY[rec.best].n : '—') + '</b></div>' +
    '<div class="row"><span class="k">Gold</span><b>' + fmt(rec.gold) + '</b></div>' +
    '<div class="row"><span class="k">Kills</span><b>' + fmt(rec.kills) + '</b></div>' +
    '<div class="row"><span class="k">Quests</span><b>' + fmt(rec.quests) + '</b></div>' +
    '<div class="row"><span class="k">World Bosses</span><b>' + fmt(rec.bosses) + '</b></div>' +
    '<div class="row"><span class="k">Raids</span><b>' + fmt(rec.raids) + '</b></div>' +
    '<div class="row"><span class="k">Deaths</span><b>' + fmt(rec.deaths) + '</b></div>' +
    '<div class="row"><span class="k">Respect</span><b>' + fmt(Math.round(rec.respect)) + '</b></div>';
  if (g) h += '<h4 class="sec">Clan</h4><div class="card click" data-act="guildinfo" data-v="' + g.i + '"><b style="color:' + g.col + '">' + esc(g.n) + '</b><div class="tiny">"' + esc(g.motto) + '" · ' + g.members.length + ' members · ' + fmt(Math.round(g.respect)) + ' respect</div></div>';
  h += '<div class="btn wide" style="margin-top:10px" data-act="findplayer" data-v="' + rec.i + '">Show on map</div>';
  openModal(rec.n, h);
}
function showGuildInspect(gi) {
  const g = GUILDS[gi]; if (!g) return;
  const st = guildStats(g);
  const rank = guildHall(1000).findIndex(x => x.i === g.i) + 1;
  let h = '<div class="card"><div style="display:flex;gap:9px;align-items:center">' +
    '<div style="width:12px;height:42px;border-radius:4px;background:' + g.col + '"></div><div style="flex:1">' +
    '<div style="font-size:17px;font-weight:800;color:var(--gold)">' + esc(g.n) + '</div>' +
    '<div class="tiny">"' + esc(g.motto) + '"</div>' +
    '<div class="tiny">' + st.n + ' members · avg level ' + st.avgLv + ' · best gear ' + (st.best >= 0 ? RARITY[st.best].n : '—') + '</div></div>' +
    '<div style="text-align:right"><div style="font-size:20px;font-weight:800">#' + rank + '</div><div class="tiny">clan rank</div></div></div></div>';
  h += '<div class="grid g3" style="margin-top:6px">' +
    '<div class="card center"><b>' + fmt(Math.round(g.respect)) + '</b><div class="tiny">respect</div></div>' +
    '<div class="card center"><b>' + g.wins + 'W ' + g.losses + 'L</b><div class="tiny">wars</div></div>' +
    '<div class="card center"><b>' + g.raids + '</b><div class="tiny">raids</div></div></div>';
  h += '<h4 class="sec">Full Roster</h4><table class="lb"><tr><th>#</th><th>Name</th><th>Lv</th><th>Class</th><th>Gear</th><th>Best</th><th>Doing</th></tr>';
  const mem = g.members.map(i => ROSTER[i]).filter(Boolean).sort((a, b) => b.lv - a.lv);
  mem.forEach((r, i) => {
    h += '<tr data-act="inspect" data-v="' + r.i + '"><td class="rk">' + (i + 1) + '</td><td class="q' + Math.max(0, r.best) + '">' + esc(r.n) + '</td>' +
      '<td>' + r.lv + '</td><td class="tiny">' + CLASS_BY[r.c].n + '</td><td>' + fmt(r.gs) + '</td>' +
      '<td class="q' + Math.max(0, r.best) + '">' + (r.best >= 0 ? RARITY[r.best].n.slice(0, 4) : '—') + '</td>' +
      '<td class="tiny">' + (AI_STATES.find(s => s.k === r.st) || { n: '—' }).n + '</td></tr>';
  });
  h += '</table>';
  if (!g.playerGuild) h += '<div class="btn wide gold" style="margin-top:9px" data-act="join" data-v="' + g.i + '">Join ' + esc(g.n) + '</div>';
  openModal(g.n, h);
}
function openModal(title, html) {
  PANEL = PANEL || 'hof';
  $('panel').classList.add('on');
  $('ptitle').textContent = title;
  $('ptabs').innerHTML = '<div class="tab on" data-act="back">‹ Back</div>';
  $('ptabs').firstChild.onclick = () => { sfx('ui', .6); panelOpen2(); };
  $('pbody').innerHTML = html;
  $('pbody').scrollTop = 0;
  bindPanelActions($('pbody'));
  sfx('open', .6);
}

/* ------------------------------ SEASON END SCREEN ------------------------------ */
function showSeasonEnd(rec) {
  const box = $('seasonend');
  const c = rec.champ;
  let h = '<h2>SEASON ' + rec.num + ' COMPLETE</h2>' +
    '<div class="tiny" style="letter-spacing:.24em;text-transform:uppercase;color:#9aa3b4">The world resets. A champion is crowned.</div>';
  h += '<div class="champ"><div class="tiny" style="letter-spacing:.3em;color:var(--gold)">IDLE QUEST CHAMPION</div>' +
    '<div class="cn">' + esc(c.n) + '</div>' +
    '<div class="tiny" style="color:#c9bda0;margin-top:4px">Level ' + fmt(c.lv) + ' ' + CLASS_BY[c.c].n + ' · ' + fmt(c.gs) + ' gear score</div>' +
    '<div class="tiny" style="color:#c9bda0">Best gear: <b class="q' + Math.max(0, c.best) + '">' + (c.best >= 0 ? RARITY[c.best].n : '—') + '</b>' +
    (c.guild ? ' · ' + esc(c.guild) : '') + '</div>' +
    (c.isPlayer ? '<div style="margin-top:8px;color:#4ad24a;font-weight:800;letter-spacing:.1em">THAT IS YOU.</div>' : '') +
    '</div>';
  if (rec.guild) h += '<div class="card" style="max-width:420px;margin:0 auto"><b style="color:var(--gold)">Champion Clan</b>' +
    '<div style="font-size:17px;font-weight:800;margin-top:2px">' + esc(rec.guild.n) + '</div>' +
    '<div class="tiny">' + fmt(rec.guild.respect) + ' respect</div></div>';
  h += '<div class="card" style="max-width:420px;margin:12px auto"><b style="color:var(--gold)">Your Season</b>' +
    '<div style="font-size:22px;font-weight:900">#' + rec.playerRank + '</div>' +
    '<div class="tiny">finished at level ' + rec.playerLv + ' of ' + (POP + 1) + ' adventurers</div></div>';
  h += '<div style="max-width:420px;margin:0 auto"><h4 class="sec">Final Top 10</h4>' +
    rec.top.map((r, i) => '<div class="row"><span class="k">' + (i + 1) + '. ' + esc(r.n) + (r.isPlayer ? ' (you)' : '') + '</span><b>Lv ' + r.lv + ' · ' + fmt(r.gs) + '</b></div>').join('') + '</div>';
  h += '<button class="bigbtn" style="margin-top:20px" id="newseason">Begin Season ' + (rec.num + 1) + '</button>';
  box.innerHTML = h;
  box.classList.add('on');
  $('newseason').onclick = () => { box.classList.remove('on'); startNewSeason(); sfx('levelup', 1); };
  sfx('levelup', 1);
}
