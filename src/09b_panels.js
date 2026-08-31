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
    // everything above dies with the season; everything below does not
    h += '<h4 class="sec">For All Time</h4>';
    const life = [['Achievements', '<span style="color:#ffd766">' + (p.achN || 0) + '</span> <span class="tiny">/ ' + ACH_TOTAL + '</span>'],
    ['Earned this season', '+' + (p.achS || 0)], ['Lifetime kills', fmt(playerLife(p, 'kills'))],
    ['Lifetime quests', fmt(playerLife(p, 'quests'))], ['Lifetime bosses', fmt(playerLife(p, 'bosses'))],
    ['Lifetime gold earned', fmt(playerLife(p, 'earn'))], ['Highest level reached', achStat(p, 'maxLv', true)],
    ['Best gear score ever', fmt(achStat(p, 'maxGs', true))], ['Ascensions', playerLedger(p).asc],
    ['Season crowns', playerLedger(p).crowns], ['Eternal relics', ETERNAL.p.length]];
    for (const [k, v] of life) h += '<div class="row"><span class="k">' + k + '</span><b>' + v + '</b></div>';
    const hof = hallOfFame(POP + 1);
    const rank = hof.findIndex(r => r.isPlayer) + 1;
    h += '<h4 class="sec">Standing</h4><div class="card center"><div style="font-size:26px;font-weight:900;color:var(--gold)">#' + rank + '</div>' +
      '<div class="tiny">of ' + (POP + 1) + ' adventurers this season</div></div>';
    const seats = MYTHIC_LIMIT - MYTHIC_HOLDERS.size;
    h += '<div class="hr"></div><div class="tiny center">' +
      (seasonFinalCall()
        ? '<b style="color:#ff6a80">FINAL ' + durShort(seasonLeft()) + '</b> — all Ascendant seats are gone.'
        : 'The season ends <b style="color:var(--gold)">10 minutes</b> after the third adventurer reaches level ' +
          ASCEND_LEVEL + '.<br><b style="color:var(--gold)">' + seats + ' of ' + MYTHIC_LIMIT +
          '</b> Ascendant seats remain · outer limit ' + durShort(seasonLeft())) +
      '<br>Then everyone resets to level 1 and two Champions are crowned: highest level, and greatest gear.</div>';
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
      p.bags.forEach((it, i) => { h += cellHTML(it, 'bag', i, 'data-act="bagclick" data-v="' + it.u + '"'); });
      h += '</div><div class="tiny center" style="margin-top:8px">Tap an item to equip it. Hold to inspect.</div>';
      h += '<h4 class="sec">Bag Contents</h4>';
      p.bags.forEach((it, i) => {
        const cur = p.gear[it.sl === 'ring2' ? 'ring1' : it.sl];
        const d = it.sc - (cur ? cur.sc : 0);
        h += '<div class="eqrow">' + cellHTML(it, 'bag', i) + '<div class="info"><div class="n q' + it.t + '">' + esc(it.n) + '</div>' +
          '<div class="s">' + SLOT_BY[it.sl].n + ' · ilvl ' + it.il + ' · <span style="color:' + (d >= 0 ? '#4ad24a' : '#e0492f') + '">' +
          (d >= 0 ? '+' : '') + fmt(d) + '</span></div></div>' +
          '<div class="btn sm gold" data-act="equip" data-v="' + it.u + '">Equip</div>' +
          '<div class="btn sm" data-act="sell" data-v="' + it.u + '">' + fmt(it.val) + 'g</div></div>';
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
          '<div class="btn sm ' + (G.player.gold >= o.price ? 'gold' : 'dis') + '" data-act="buy" data-v="' + o.id + '">' + fmt(o.price) + 'g</div></div>';
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
        '<div class="btn sm grn" data-act="board" data-v="' + it.u + '">List ' + fmt(Math.round(it.val * 1.25)) + 'g</div></div>';
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
          CLASS_BY[r.c].n + '</td><td>' + fmt(r.gs) + '</td><td class="tiny">' + (AI_STATE_BY[r.st] || { n: '—' }).n + '</td></tr>';
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
      const left = MYTHIC_LIMIT - MYTHIC_HOLDERS.size;
      let h = '<div class="card center" style="border-color:#ff3f5f"><b style="color:#ff3f5f;font-size:16px">THE ASCENDANTS</b>' +
        '<div class="tiny" style="margin-top:4px">The first <b>' + MYTHIC_LIMIT + '</b> adventurers to reach <b>level ' + ASCEND_LEVEL +
        '</b> are handed a full set of <b class="q5">Mythic</b> gear. It cannot be found, bought or dropped — only raced for.</div>' +
        '<div class="tiny" style="margin-top:5px">' + (left > 0
          ? '<b style="color:var(--gold)">' + left + ' seat' + (left > 1 ? 's' : '') + ' still unclaimed — first to level ' + ASCEND_LEVEL + ' takes it.</b>'
          : '<b style="color:#ff6a80">All seats claimed — the season ends in ' + durShort(seasonLeft()) + '.</b>') + '</div></div>';
      if (SEASON.ascended.length) {
        h += '<h4 class="sec">Order of Ascension</h4>';
        for (const a of SEASON.ascended) {
          h += '<div class="row"><span class="k">#' + a.place + ' to level ' + ASCEND_LEVEL + '</span><b class="q5">' +
            esc(a.n) + (a.isPlayer ? ' (you)' : '') + '</b></div>';
        }
      }
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
    if (tab === 3) {
      const total = DB.bosses.length, taken = FIRST_N, left = total - taken;
      let h = '<div class="card center" style="border-color:#ffd766"><b style="color:#ffd766;font-size:16px">FIRST BLOOD</b>' +
        '<div class="tiny" style="margin-top:4px">One hundred world bosses. The <b>first</b> adventurer in the world to bring each one down takes its name, and wears it for the rest of the season. Each is claimable exactly once.</div>' +
        '<div class="grid g3" style="margin-top:8px">' +
        '<div class="card center"><b style="color:#ffd766">' + taken + '</b><div class="tiny">claimed</div></div>' +
        '<div class="card center"><b>' + left + '</b><div class="tiny">still standing</div></div>' +
        '<div class="card center"><b class="' + (firstsBy(G.player.name) ? 'q4' : '') + '">' + firstsBy(G.player.name) +
        '</b><div class="tiny">yours</div></div></div></div>';
      const lead = firstsLeaders();
      if (lead.length) {
        h += '<h4 class="sec">Trailblazers</h4>';
        lead.slice(0, 10).forEach((l, i) => {
          h += '<div class="row' + (l.isPlayer ? ' me' : '') + '"><span class="k">' + (i + 1) + '. ' + esc(l.n) +
            (l.isPlayer ? ' (you)' : '') + (l.g >= 0 && GUILDS[l.g] ? ' <span class="tiny">' + esc(GUILDS[l.g].n) + '</span>' : '') +
            '</span><b style="color:#ffd766">' + l.c + '</b></div>';
        });
      }
      h += '<h4 class="sec">The Board</h4><table class="lb"><tr><th>#</th><th>World Boss</th><th>Lv</th><th>Zone</th><th>First Blood</th></tr>';
      // unclaimed first: those are the ones still worth walking to
      const ids = DB.bosses.map(b => b.id).sort((a, b) => {
        const fa = FIRSTS[a] ? 1 : 0, fb = FIRSTS[b] ? 1 : 0;
        if (fa !== fb) return fa - fb;
        if (fa) return FIRSTS[a].place - FIRSTS[b].place;
        return DB.bosses[a].lv - DB.bosses[b].lv;
      });
      for (const id of ids) {
        const b = DB.bosses[id], f = FIRSTS[id];
        h += '<tr class="' + (f && f.i === -1 ? 'me' : '') + '"><td class="tiny">' + (f ? f.place : '—') + '</td>' +
          '<td><b style="color:' + (f ? '#8f98a9' : '#ffd766') + '">' + esc(b.n) + '</b><div class="tiny">' + esc(b.t) + '</div></td>' +
          '<td>' + b.lv + '</td><td class="tiny">' + esc(DB.zones[b.z].n) + '</td>' +
          '<td>' + (f ? '<b style="color:' + (f.i === -1 ? '#4ad24a' : '#c9bda0') + '">' + esc(f.n) + '</b><div class="tiny">at level ' + f.lv + '</div>'
            : '<b style="color:#ffd766">UNCLAIMED</b>') + '</td></tr>';
      }
      h += '</table>';
      return h;
    }
    let h = '<div class="tiny">Every season ever played, kept forever — newest first.</div>';
    if (!SEASON.champions.length) return h + '<div class="tiny center" style="padding:26px">No season has ended yet.<br>Season ' +
      SEASON.num + ' ends in <b style="color:var(--gold)">' + dur(seasonLeft()) + '</b>.</div>';
    const wins = { lv: 0, gs: 0, guild: 0 };
    for (const c of SEASON.champions) {
      if (c.champ && c.champ.isPlayer) wins.lv++;
      if ((c.gearChamp || c.champ || {}).isPlayer) wins.gs++;
      if (c.guild && c.guild.isPlayerGuild) wins.guild++;
    }
    h += '<div class="grid g3" style="margin:6px 0">' +
      '<div class="card center"><b>' + SEASON.champions.length + '</b><div class="tiny">seasons recorded</div></div>' +
      '<div class="card center"><b>' + wins.lv + ' / ' + wins.gs + '</b><div class="tiny">your level / gear crowns</div></div>' +
      '<div class="card center"><b>' + wins.guild + '</b><div class="tiny">your clan crowns</div></div></div>';
    const ovs = SEASON.champions.filter(c => c.ov);
    if (ovs.length) {
      const held = ovs.filter(c => c.ov.outcome === 2).length, lived = ovs.filter(c => c.ov.pAlive).length;
      h += '<div class="grid g3" style="margin:6px 0">' +
        '<div class="card center" style="border-color:#7ff2ff"><b class="q6">' + held + ' / ' + ovs.length +
        '</b><div class="tiny">Overlords felled</div></div>' +
        '<div class="card center"><b>' + lived + '</b><div class="tiny">times you survived</div></div>' +
        '<div class="card center"><b class="q6">' + (ETERNAL.p.length + ETERNAL.ai.length) +
        '</b><div class="tiny">relics in the world</div></div></div>';
    }
    for (const c of SEASON.champions) {
      const gc = c.gearChamp || c.champ;
      h += '<div class="card" style="margin-bottom:6px;border-color:var(--gold)">' +
        '<div style="display:flex;gap:8px;align-items:baseline"><b style="color:var(--gold);flex:1">🏆 Season ' + c.num + '</b>' +
        '<span class="tiny">' + new Date(c.ended).toLocaleDateString() + '</span></div>';
      if (c.sweep) {
        h += '<div class="row"><span class="k">Champion — level &amp; gear</span><b>' + esc(c.champ.n) +
          (c.champ.isPlayer ? ' (you)' : '') + ' · Lv ' + fmt(c.champ.lv) + '</b></div>';
      } else {
        h += '<div class="row"><span class="k">Champion of Levels</span><b>' + esc(c.champ.n) +
          (c.champ.isPlayer ? ' (you)' : '') + ' · Lv ' + fmt(c.champ.lv) + '</b></div>' +
          '<div class="row"><span class="k">Champion of Gear</span><b>' + esc(gc.n) +
          (gc.isPlayer ? ' (you)' : '') + ' · ' + fmt(gc.gs) + '</b></div>';
      }
      h += '<div class="row"><span class="k">Crowned Clan</span><b>' + esc(c.guild ? c.guild.n : '—') +
        (c.guild && c.guild.isPlayerGuild ? ' (yours)' : '') + (c.guild ? ' · ' + fmt(c.guild.respect) + ' respect' : '') + '</b></div>';
      // seasons archived before the Overlord existed have no c.ov, so guard it
      if (c.blazer) h += '<div class="row"><span class="k">Trailblazer</span><b style="color:#ffd766">' +
        esc(c.blazer.n) + (c.blazer.isPlayer ? ' (you)' : '') + ' · ' + c.blazer.c + ' firsts</b></div>';
      if (c.ach) h += '<div class="row"><span class="k">Achievement Crown</span><b style="color:#f0c257">' +
        esc(c.ach.n) + (c.ach.isPlayer ? ' (you)' : '') + ' · +' + c.ach.earned + ' earned</b></div>';
      if (c.testament) h += '<div class="row"><span class="k">The Testament</span><b class="q6">' +
        esc(c.testament.n) + (c.testament.isPlayer ? ' (you)' : '') + ' · all ' + (c.achTotal || ACH_TOTAL) + '</b></div>';
      if (c.ov) h += '<div class="row"><span class="k">The Overlord</span><b style="color:' +
        (c.ov.outcome === 2 ? '#7ff2ff' : c.ov.outcome === 1 ? '#d0a0ff' : '#ff5a72') + '">' +
        (c.ov.outcome === 2 ? 'HELD \u00b7 ' + c.ov.alive + ' stood'
          : c.ov.outcome === 1 ? 'HOLLOW VICTORY' : 'FELL \u00b7 boss at ' + Math.round(c.ov.bossLeft * 100) + '%') +
        (c.ov.pAlive ? ' \u00b7 you lived' : '') + '</b></div>';
      if (c.ascended && c.ascended.length) {
        h += '<div class="row"><span class="k">Ascendants</span><b class="q5">' +
          c.ascended.map(a => esc(a.n) + (a.isPlayer ? ' (you)' : '')).join(', ') + '</b></div>';
      }
      h += '<div class="row"><span class="k">You finished</span><b>#' + c.playerRank + ' by level' +
        (c.playerGearRank ? ', #' + c.playerGearRank + ' by gear' : '') + ' · Lv ' + c.playerLv + '</b></div></div>';
    }
    return h;
  },

  /* ---------------------------------------------------------------- ACHIEVEMENTS */
  ach(tab) {
    const p = G.player;
    const held = p.achN || 0, pct = held / ACH_TOTAL * 100;
    if (tab === 0) {
      const rank = achPlayerRank();
      let h = '<div class="card center" style="border-color:#ffd766">' +
        '<b style="color:#ffd766;font-size:16px">' + held + ' / ' + ACH_TOTAL + '</b>' +
        '<div class="bar" style="margin:6px 0"><i style="width:' + pct.toFixed(1) + '%;background:linear-gradient(90deg,#f0c257,#ffd766)"></i>' +
        '<span>' + pct.toFixed(1) + '%</span></div>' +
        '<div class="tiny">Achievements are the only thing in this world that a season cannot take back. ' +
        'They stay with your name through every wipe — and through every one of theirs.</div></div>';
      h += '<div class="grid g3" style="margin:6px 0">' +
        '<div class="card center"><b>#' + rank + '</b><div class="tiny">of ' + (POP + 1) + ' adventurers</div></div>' +
        '<div class="card center"><b style="color:#ffd766">' + (p.achS || 0) + '</b><div class="tiny">earned this season</div></div>' +
        '<div class="card center"><b>' + (ACH_TOTAL - held) + '</b><div class="tiny">still to do</div></div></div>';
      h += '<h4 class="sec">By Category</h4>';
      for (const c of ACH_CATS) {
        const rows = ACH_BY_CAT[c.k];
        const got = rows.filter(a => achHas(p.ach, a.id)).length;
        h += '<div style="margin:5px 0"><div style="display:flex;justify-content:space-between;font-size:12px">' +
          '<b style="color:' + c.c + '">' + c.n + '</b><span class="tiny">' + got + ' / ' + rows.length + '</span></div>' +
          '<div class="bar sm"><i style="width:' + (got / rows.length * 100).toFixed(1) + '%;background:' + c.c + '"></i></div></div>';
      }
      // the handful you are actually closest to finishing
      const next = ACH.filter(a => !achHas(p.ach, a.id))
        .map(a => ({ a, f: Math.min(1, achStat(p, a.stat, true) / a.need) }))
        .sort((x, y) => y.f - x.f).slice(0, 8);
      if (next.length) {
        h += '<h4 class="sec">Closest to Done</h4>';
        for (const { a, f } of next) {
          h += '<div style="margin:5px 0"><div style="display:flex;justify-content:space-between;gap:8px;font-size:12px">' +
            '<b style="color:' + ACH_CAT_BY[a.cat].c + '">' + esc(a.n) + '</b>' +
            '<span class="tiny">' + achProgTxt(p, a, true) + '</span></div>' +
            '<div class="bar sm"><i style="width:' + (f * 100).toFixed(1) + '%;background:' + ACH_CAT_BY[a.cat].c + '"></i></div>' +
            '<div class="tiny" style="opacity:.7">' + esc(a.d) + '</div></div>';
        }
      }
      return h;
    }
    if (tab === 1) {
      let h = '<div class="tiny">All ' + ACH_TOTAL + ' of them. Gold is earned; grey is waiting.</div>';
      for (const c of ACH_CATS) {
        const rows = ACH_BY_CAT[c.k];
        const got = rows.filter(a => achHas(p.ach, a.id)).length;
        h += '<h4 class="sec" style="color:' + c.c + '">' + c.n + ' <span class="tiny" style="color:#8f98a9">' +
          got + '/' + rows.length + ' · ' + esc(c.d) + '</span></h4>';
        for (const a of rows) {
          const done = achHas(p.ach, a.id);
          h += '<div class="row"><span class="k" style="' + (done ? 'color:' + c.c + ';font-weight:700' : 'opacity:.55') + '">' +
            (done ? '★ ' : '☆ ') + esc(a.n) + '<div class="tiny" style="opacity:.7;font-weight:400">' + esc(a.d) + '</div></span>' +
            '<b class="tiny" style="' + (done ? 'color:' + c.c : 'opacity:.6') + '">' + achProgTxt(p, a, true) + '</b></div>';
        }
      }
      return h;
    }
    if (tab === 2) {
      const board = achLeaders(60), season = achSeasonLeaders(10);
      let h = '<div class="card center" style="border-color:#ffd766"><b style="color:#ffd766">THE ACHIEVEMENT CROWN</b>' +
        '<div class="tiny" style="margin-top:4px">Crowned at every season\'s end to whoever earned the most achievements <b>during</b> it — ' +
        'not whoever holds the most. A veteran with a full board cannot coast to it.</div></div>';
      h += '<h4 class="sec">Earned This Season</h4>';
      season.forEach((r, i) => {
        h += '<div class="row' + (r.isPlayer ? ' me' : '') + '"><span class="k">' + (i + 1) + '. ' +
          CLASS_BY[r.c].ic + ' ' + esc(r.n) + (r.isPlayer ? ' (you)' : '') +
          (r.g >= 0 && GUILDS[r.g] ? ' <span class="tiny">' + esc(GUILDS[r.g].n) + '</span>' : '') +
          '</span><b style="color:#ffd766">+' + r.achS + '</b></div>';
      });
      h += '<h4 class="sec">Held For All Time</h4><table class="lb"><tr><th>#</th><th>Name</th><th>Class</th><th>Clan</th><th>Held</th><th>Season</th></tr>';
      board.forEach((r, i) => {
        h += '<tr class="' + (r.isPlayer ? 'me' : '') + '"><td class="tiny">' + (i + 1) + '</td>' +
          '<td><b' + (r.done ? ' class="q6"' : '') + '>' + esc(r.n) + (r.isPlayer ? ' (you)' : '') + '</b></td>' +
          '<td class="tiny">' + CLASS_BY[r.c].n + '</td>' +
          '<td class="tiny">' + (r.g >= 0 && GUILDS[r.g] ? esc(GUILDS[r.g].n) : '—') + '</td>' +
          '<td><b style="color:#ffd766">' + r.achN + '</b> <span class="tiny">/ ' + ACH_TOTAL + '</span></td>' +
          '<td class="tiny">+' + r.achS + '</td></tr>';
      });
      return h + '</table>';
    }
    // ---- the Testament ----
    const il = testamentIlvl(), peak = mythicPeakIlvl();
    let h = '<div class="card center" style="border-color:#7ff2ff"><b class="q6" style="font-size:16px">THE TESTAMENT</b>' +
      '<div class="tiny" style="margin-top:4px">The first adventurer in the world to close all ' + ACH_TOTAL +
      ' achievements is handed a full set forged at <b class="q6">' + ACH_PRIZE_MULT + '×</b> the strongest Mythic the world has ever made. ' +
      'It carries across every season after, the way an Eternal relic does. It is forged exactly once, and then never again.</div></div>';
    h += '<div class="grid g3" style="margin:6px 0">' +
      '<div class="card center"><b>' + peak + '</b><div class="tiny">Mythic peak, season ' + SEASON.num + '</div></div>' +
      '<div class="card center"><b class="q6">' + il + '</b><div class="tiny">Testament item level</div></div>' +
      '<div class="card center"><b>' + (ACH_TOTAL - held) + '</b><div class="tiny">left for you</div></div></div>';
    if (ACH_FIRST) {
      h += '<div class="card center" style="border-color:#7ff2ff;margin-top:8px">' +
        '<b class="q6" style="font-size:15px">' + esc(ACH_FIRST.n) + (ACH_FIRST.isPlayer ? ' (you)' : '') + '</b>' +
        '<div class="tiny" style="margin-top:3px">closed the board in Season ' + ACH_FIRST.season +
        ' and wears the Testament. Nobody else ever will.</div></div>';
    } else {
      const lead = achLeaders(5);
      h += '<h4 class="sec">The Race</h4>';
      lead.forEach((r, i) => {
        h += '<div class="row' + (r.isPlayer ? ' me' : '') + '"><span class="k">' + (i + 1) + '. ' + esc(r.n) +
          (r.isPlayer ? ' (you)' : '') + '</span><b>' + r.achN + ' <span class="tiny">/ ' + ACH_TOTAL + '</span></b></div>';
      });
      h += '<div class="tiny center" style="padding:10px;opacity:.8">Unclaimed. It goes to whoever gets there first.</div>';
    }
    return h;
  },

  /* ---------------------------------------------------------------- ADMIN
     A cheat console for the owner of a single-player world. Summoned by typing
     ADMIN_WORD, or five quick taps on the season clock. Never listed in the menu
     bar, so it does not exist until it is called for. */
  admin(tab) {
    const p = G.player;
    const num = (id, val, ph) => '<input id="' + id + '" type="number" inputmode="numeric" value="' + val +
      '" placeholder="' + (ph || '') + '" style="width:100%;padding:7px 9px;border-radius:8px;background:#0a0f18;' +
      'border:1px solid var(--edge2);color:#e9e2cf;font:inherit;font-size:13px">';
    const btn = (act, v, label, cls) => '<div class="btn sm ' + (cls || '') + '" data-act="' + act +
      '" data-v="' + (v == null ? '' : v) + '">' + label + '</div>';

    if (tab === 0) {
      let h = '<div class="card center" style="border-color:#e0492f"><b style="color:#e0492f">ADMIN CONSOLE</b>' +
        '<div class="tiny" style="margin-top:4px">Your world, your rules. Nothing here is validated and nothing is undone — ' +
        'changes are live the moment you apply them, and they save with everything else.</div></div>';
      h += '<h4 class="sec">Level</h4>' +
        '<div class="tiny">Currently level ' + p.level + '.</div>' +
        '<div style="display:flex;gap:6px;align-items:center;margin:6px 0">' +
        '<div style="flex:1">' + num('adLv', p.level) + '</div>' + btn('adLv', null, 'Set') + '</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
        btn('adLvAdd', '1', '+1') + btn('adLvAdd', '10', '+10') + btn('adLvAdd', '50', '+50') +
        btn('adLvAdd', '-10', '−10') + btn('adLvSet', String(ASCEND_LEVEL), 'Level ' + ASCEND_LEVEL) + '</div>';
      h += '<h4 class="sec">Gold</h4>' +
        '<div class="tiny">Currently ' + fmt(p.gold) + 'g.</div>' +
        '<div style="display:flex;gap:6px;align-items:center;margin:6px 0">' +
        '<div style="flex:1">' + num('adGold', Math.round(p.gold)) + '</div>' + btn('adGold', null, 'Set') + '</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
        btn('adGoldAdd', '10000', '+10K') + btn('adGoldAdd', '1000000', '+1M') +
        btn('adGoldAdd', '100000000', '+100M') + btn('adGoldSet', '0', 'Zero') + '</div>';
      h += '<h4 class="sec">Achievements</h4>' +
        '<div class="tiny">Holding <b style="color:#ffd766">' + (p.achN || 0) + '</b> of ' + ACH_TOTAL +
        '. Setting a number awards exactly that many, from the top of the list down. ' +
        'Reaching ' + ACH_TOTAL + ' forges the Testament, if nobody has taken it yet.</div>' +
        '<div style="display:flex;gap:6px;align-items:center;margin:6px 0">' +
        '<div style="flex:1">' + num('adAch', p.achN || 0) + '</div>' + btn('adAch', null, 'Set') + '</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
        btn('adAchSet', '0', 'None') + btn('adAchSet', '125', 'Half') +
        btn('adAchSet', String(ACH_TOTAL - 1), String(ACH_TOTAL - 1)) +
        btn('adAchSet', String(ACH_TOTAL), 'ALL ' + ACH_TOTAL, 'gold') + '</div>';
      return h;
    }

    if (tab === 1) {
      const sel = ADMIN.target != null ? ROSTER[ADMIN.target] : null;
      let h = '<div class="tiny">Pick an adventurer, then set their level or gold. Bulk controls at the foot apply to all ' + POP + '.</div>';
      if (sel) {
        h += '<div class="card" style="border-color:var(--gold);margin:7px 0">' +
          '<b style="color:var(--gold)">' + CLASS_BY[sel.c].ic + ' ' + esc(sel.n) + '</b>' +
          '<div class="tiny">Level ' + sel.lv + ' ' + CLASS_BY[sel.c].n + ' · ' + fmt(Math.round(sel.gold)) + 'g · ' +
          fmt(sel.gs) + ' gear · ' + (sel.achN || 0) + '/' + ACH_TOTAL + ' achievements' +
          (sel.g >= 0 && GUILDS[sel.g] ? ' · ' + esc(GUILDS[sel.g].n) : '') + '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;margin-top:7px">' +
          '<div style="flex:1">' + num('adTLv', sel.lv) + '</div>' + btn('adTLv', null, 'Set level') + '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;margin-top:5px">' +
          '<div style="flex:1">' + num('adTGold', Math.round(sel.gold)) + '</div>' + btn('adTGold', null, 'Set gold') + '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;margin-top:5px">' +
          '<div style="flex:1">' + num('adTAch', sel.achN || 0) + '</div>' + btn('adTAch', null, 'Set achievements') + '</div>' +
          '</div>';
      }
      h += '<h4 class="sec">Everyone</h4><div style="display:flex;gap:6px;align-items:center;margin:6px 0">' +
        '<div style="flex:1">' + num('adAllLv', 1, 'level') + '</div>' + btn('adAllLv', null, 'Set all levels') + '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;margin:6px 0">' +
        '<div style="flex:1">' + num('adAllGold', 0, 'gold') + '</div>' + btn('adAllGold', null, 'Set all gold') + '</div>';
      h += '<h4 class="sec">Roster</h4>' +
        '<div class="tiny">Highest level first. Tap a name to select.</div>' +
        '<table class="lb"><tr><th>#</th><th>Name</th><th>Lv</th><th>Gold</th><th>Ach</th></tr>';
      const list = ROSTER.slice().sort((a2, b2) => b2.lv - a2.lv).slice(0, 40);
      list.forEach((r, i) => {
        h += '<tr class="' + (ADMIN.target === r.i ? 'me' : '') + '" data-act="adPick" data-v="' + r.i + '">' +
          '<td class="tiny">' + (i + 1) + '</td><td><b>' + esc(r.n) + '</b></td><td>' + r.lv + '</td>' +
          '<td class="tiny">' + fmt(Math.round(r.gold)) + '</td><td class="tiny">' + (r.achN || 0) + '</td></tr>';
      });
      return h + '</table>';
    }

    if (tab === 2) {
      const lv = Math.max(1, p.level);
      const ilv = t => t >= 6 ? eternalIlvl(lv) : t === 5 ? mythicIlvl(lv, SEASON.num) : Math.round(refIlvl(lv));
      let h = '<div class="tiny">A full fifteen-slot set at your current level (' + lv + '), replacing what you wear. ' +
        'Item level follows the same maths the game uses for that rarity.</div>';
      h += '<div class="card" style="margin:7px 0"><div class="row"><span class="k">Current</span><b class="q' +
        Math.max(0, bestTierOf(p.gear)) + '">' + (bestTierOf(p.gear) >= 0 ? RARITY[bestTierOf(p.gear)].n : 'nothing') +
        '</b></div><div class="row"><span class="k">Gear score</span><b>' + fmt(p.st.gs) + '</b></div></div>';
      h += '<h4 class="sec">Grant a Set</h4>';
      for (let t = 0; t < RARITY.length; t++) {
        h += '<div class="row"><span class="k q' + t + '">' + RARITY[t].n + '<div class="tiny" style="opacity:.7">item level ' +
          ilv(t) + '</div></span>' + btn('adGear', String(t), 'Equip', t >= 5 ? 'gold' : '') + '</div>';
      }
      h += '<h4 class="sec">The Testament</h4>' +
        '<div class="tiny">The completionist prize: item level ' + testamentIlvl() + ', which is ' + ACH_PRIZE_MULT +
        '× the strongest Mythic this world has forged (' + mythicPeakIlvl() + ').' +
        (ACH_FIRST ? ' Already claimed by <b>' + esc(ACH_FIRST.n) + '</b> in season ' + ACH_FIRST.season + '.' : '') + '</div>' +
        '<div style="margin-top:7px">' + btn('adTestament', null, 'Equip the full Testament set', 'gold') + '</div>';
      return h;
    }

    // ---- season ----
    let h = '<div class="card center"><b style="color:var(--gold)">SEASON ' + SEASON.num + '</b>' +
      '<div class="tiny" style="margin-top:4px">' + (SEASON.ended ? 'This season has already ended.' :
        'Ends ' + (SEASON.milestone ? 'in ' + dur(Math.max(0, SEASON.milestone + SEASON_GRACE_MS - metaNow()))
          : dur(seasonLeft()) + ' from now') + '.') + '</div>' +
      '<div class="tiny">' + MYTHIC_HOLDERS.size + ' of ' + MYTHIC_LIMIT + ' Ascendant seats claimed · ' +
      FIRST_N + ' of ' + DB.bosses.length + ' world-boss firsts taken</div></div>';
    h += '<h4 class="sec">Finish It</h4>' +
      '<div class="tiny">Ending a season crowns the champions, runs the Overlord finale and archives the result, ' +
      'exactly as it would if the third Ascendant had just claimed their seat.</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px">' +
      btn('adEndSeason', null, 'End season now', 'gold') +
      btn('adNextSeason', null, 'End it and start the next') + '</div>';
    h += '<h4 class="sec">Jump Ahead</h4>' +
      '<div class="tiny">Run the world forward without waiting — every adventurer levels, loots, raids and ' +
      'takes firsts, and your own idle progress is credited too.</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px">' +
      btn('adFF', '3600', 'Skip 1 hour') + btn('adFF', '21600', 'Skip 6 hours') +
      btn('adFF', '86400', 'Skip a day') + '</div>';
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
          '<td class="tiny">' + CLASS_BY[r.c].n + '</td><td class="tiny">' + (AI_STATE_BY[r.st] || { n: '—' }).n + '</td>' +
          '<td class="tiny">' + esc(zn ? zn.n : '—') + '</td><td class="tiny">' + Math.round(d) + 'm</td></tr>';
      }
      return h + '</table>';
    }
    if (tab === 1) {
      let h = '<div class="tiny">Adventurers whisper you asking for gold or gear. Answer them however you like — ' +
        'they remember, and generous players get treated better when they ask for something back.</div>';
      if (!PENDING.length) return h + '<div class="tiny center" style="padding:26px">No one is asking you for anything right now.</div>';
      for (const req of PENDING) {
        const rec = ROSTER[req.rid]; if (!rec) continue;
        h += '<div class="card" style="margin-top:6px;border-color:rgba(240,166,60,.45)">' +
          '<div style="display:flex;gap:8px;align-items:center"><div style="font-size:22px">' + CLASS_BY[rec.c].ic + '</div>' +
          '<div style="flex:1;min-width:0"><b class="q' + Math.max(0, rec.best) + '">' + esc(rec.n) + '</b>' +
          '<div class="tiny">Level ' + rec.lv + ' ' + CLASS_BY[rec.c].n + ' · ' +
          (rec.g >= 0 && GUILDS[rec.g] ? esc(GUILDS[rec.g].n) : 'no clan') + '</div></div></div>' +
          '<div class="tiny" style="margin-top:6px;color:#dfe6f2;font-style:italic">"' + esc(req.msg) + '"</div>' +
          '<div style="display:flex;gap:5px;margin-top:7px">' +
          '<div class="btn grn sm" data-act="grant" data-v="' + req.id + '">' +
          (req.kind === 'gold' ? 'Send ' + fmt(req.amount) + 'g' : 'Send spare gear') + '</div>' +
          '<div class="btn sm" data-act="deny" data-v="' + req.id + '">Decline</div></div></div>';
      }
      return h;
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
      '<div class="row"><span class="k">World size</span><b>' + ((WORLD_SIZE / 1000) ** 2).toFixed(1) + ' km² (' + (WORLD_SIZE / 1000).toFixed(1) + ' km across)</b></div>' +
      '<h4 class="sec">Controls</h4>' +
      '<div class="tiny">Left half of the screen: move (push to the edge to sprint). Right half: swipe to look, pinch to zoom, tap an enemy to target. ' +
      'Buttons bottom-right are your abilities. On a keyboard: WASD, Space, 1–6, Tab to target, F for auto.</div>';
  },
};

/* ------------------------------ PANEL ACTIONS ------------------------------ */
/* ------------------------------ ADMIN CONSOLE ------------------------------ */
/* The owner's console for a single-player world. Everything here writes straight
   into live state and then re-derives whatever depends on it, because half-applied
   cheats are worse than no cheats: a level set without calcStats leaves you with
   the health pool of the character you used to be. */
const ADMIN_WORD = 'chris';
const ADMIN = { target: null };
function adminOpen() {
  if (!G.started || !G.player) return;
  PANEL_MODAL = false;
  if (PANEL === 'admin') { panelClose(); return; }
  PANEL = null;
  panelOpen('admin');
  toast('<b style="color:#e0492f">ADMIN CONSOLE</b><div class="tiny">Type it again, or five taps on the season clock, to close.</div>', 'sys');
}
function adminNum(id, fallback) {
  const e = document.getElementById(id);
  const n = e ? parseFloat(e.value) : NaN;
  return isFinite(n) ? n : fallback;
}
/** Level is not just a number: stats, resource pool and health all hang off it. */
function adminSetLevel(lv) {
  const p = G.player;
  p.level = clamp(Math.round(lv), 1, 100000);
  p.xp = 0;
  p.st = calcStats(p); p.resMax = resourceMax(p);
  p.hp = p.st.hpMax; p.res = CLASS_BY[p.cls].res === 'rage' ? 0 : p.resMax;
  styleFromGear(p, p.gear, p.cls);
  banner('LEVEL ' + p.level, 'set from the console');
}
function adminSetGold(g) {
  const p = G.player;
  p.gold = Math.max(0, Math.round(g));
  toast('Gold set to ' + fmt(p.gold) + 'g', 'sys');
}
/** Award exactly n achievements, taken from the top of the list. */
function adminSetAch(who, n, isPlayer) {
  n = clamp(Math.round(n), 0, ACH_TOTAL);
  const bits = newAchBits();
  for (let i = 0; i < n; i++) achSetBit(bits, i);
  who.ach = bits; who.achN = n;
  const lf = isPlayer ? playerLedger(who) : (who.lf || (who.lf = newLifeLedger()));
  lf.ach = n;
  // crossing the line forges the Testament, exactly as earning it would
  if (n >= ACH_TOTAL) achFinish(who, isPlayer, false);
  else if (isPlayer) toast('Achievements set to ' + n + ' / ' + ACH_TOTAL, 'sys');
}
/** A full fifteen-slot set at the item level the game itself would use for that tier. */
function adminGearSet(tier) {
  const p = G.player;
  const lv = Math.max(1, p.level);
  const il = tier >= 6 ? eternalIlvl(lv) : tier === 5 ? mythicIlvl(lv, SEASON.num) : Math.round(refIlvl(lv));
  const rng = new RNG(((Math.random() * 1e9) | 0) | 1);
  for (const slot of SLOT_KEYS) p.gear[slot] = genItem(rng, il, tier, slot, p.cls);
  p.st = calcStats(p); p.resMax = resourceMax(p); p.hp = p.st.hpMax;
  styleFromGear(p, p.gear, p.cls);
  uiDirty.all = 1;
  banner(RARITY[tier].n.toUpperCase(), 'full set · item level ' + il);
}
function adminSetRecLevel(rec, lv) {
  rec.lv = clamp(Math.round(lv), 1, 100000);
  rec.lp = 0;
  rec.gs = recGearScore(rec);
}
/* Skipping time runs the real offline path, so the world that comes back is the
   world that would have happened -- not a scaled guess. */
function adminFastForward(secs) {
  const ms = secs * 1000;
  metaOffline(ms);
  playerOffline0(ms);
  achSweepAll(false);
  checkSeason();
  uiDirty.all = 1;
  toast('Skipped ' + dur(ms) + ' — the world moved on without you', 'sys');
}
function PANEL_ACT(a, v, node) {
  const p = G.player;
  switch (a) {
    /* ---- admin console ---- */
    case 'adLv': adminSetLevel(adminNum('adLv', p.level)); renderPanel(); break;
    case 'adLvSet': adminSetLevel(+v); renderPanel(); break;
    case 'adLvAdd': adminSetLevel(p.level + (+v)); renderPanel(); break;
    case 'adGold': adminSetGold(adminNum('adGold', p.gold)); renderPanel(); break;
    case 'adGoldSet': adminSetGold(+v); renderPanel(); break;
    case 'adGoldAdd': adminSetGold(p.gold + (+v)); renderPanel(); break;
    case 'adAch': adminSetAch(p, adminNum('adAch', p.achN || 0), true); renderPanel(); break;
    case 'adAchSet': adminSetAch(p, +v, true); renderPanel(); break;
    case 'adPick': ADMIN.target = +v; sfx('ui', .6); renderPanel(); break;
    case 'adTLv': { const r = ROSTER[ADMIN.target]; if (r) { adminSetRecLevel(r, adminNum('adTLv', r.lv)); sfx('ui', .7); } renderPanel(); break; }
    case 'adTGold': { const r = ROSTER[ADMIN.target]; if (r) { r.gold = Math.max(0, Math.round(adminNum('adTGold', r.gold))); sfx('coin', .7); } renderPanel(); break; }
    case 'adTAch': { const r = ROSTER[ADMIN.target]; if (r) { adminSetAch(r, adminNum('adTAch', r.achN || 0), false); sfx('ui', .7); } renderPanel(); break; }
    case 'adAllLv': { const n = adminNum('adAllLv', 1); for (const r of ROSTER) adminSetRecLevel(r, n);
      toast('All ' + POP + ' adventurers set to level ' + Math.round(n), 'sys'); renderPanel(); break; }
    case 'adAllGold': { const n = Math.max(0, Math.round(adminNum('adAllGold', 0))); for (const r of ROSTER) r.gold = n;
      toast('All ' + POP + ' adventurers set to ' + fmt(n) + 'g', 'sys'); renderPanel(); break; }
    case 'adGear': adminGearSet(+v); renderPanel(); break;
    case 'adTestament': { grantTestamentPlayer(p); uiDirty.all = 1;
      banner('THE TESTAMENT', 'item level ' + testamentIlvl()); renderPanel(); break; }
    case 'adEndSeason': { if (SEASON.ended) { toast('This season has already ended.', 'sys'); break; }
      panelClose(); endSeason(false); break; }
    case 'adNextSeason': { if (!SEASON.ended) endSeason(true);
      panelClose(); if (G.overlord) G.overlord = null; ovStartNextSeason(); break; }
    case 'adFF': adminFastForward(+v); renderPanel(); break;
    case 'equip': { const bi = p.bags.findIndex(b => b.u === +v); if (bi >= 0) equipItem(p, bi); uiDirty.bag = 1; renderPanel(); break; }
    case 'bagclick': { const bi = p.bags.findIndex(b => b.u === +v); if (bi >= 0) equipItem(p, bi); renderPanel(); break; }
    case 'unequip': {
      const it = p.gear[v];
      if (it) {
        delete p.gear[v]; p.bags.push(it);
        p.st = calcStats(p); p.resMax = resourceMax(p);
        p.hp = Math.min(p.hp, p.st.hpMax); p.res = Math.min(p.res, p.resMax);
        styleFromGear(p, p.gear, p.cls); sfx('ui', .7);
      }
      renderPanel(); break;
    }
    case 'sell': {
      const bi = p.bags.findIndex(b => b.u === +v);
      if (bi >= 0) { const it = p.bags[bi]; p.bags.splice(bi, 1); giveGold(p, it.val); sfx('coin', .9); }
      renderPanel(); break;
    }
    case 'board': { const bi = p.bags.findIndex(b => b.u === +v); if (bi >= 0) sellToBoard(bi); renderPanel(); break; }
    case 'offer': acceptOffer(+v); renderPanel(); break;
    case 'buy': { const ti = TRADE_BOARD.findIndex(x => x.id === +v); if (ti >= 0) buyTrade(ti); renderPanel(); break; }
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
    case 'wipe': if (confirm('Delete your save and start a fresh season?')) { G.wiping = 1; localStorage.removeItem(SAVE_KEY); location.reload(); } break;
    case 'givegold': {
      const [ri, raw] = v.split(':');
      const rec = ROSTER[+ri]; if (!rec) break;
      const amt = raw === 'pct' ? Math.floor(p.gold * .1) : +raw;
      if (sendGold(rec, amt)) showAIInspect(rec);
      break;
    }
    case 'giveitem': {
      const [ri, iu] = v.split(':');
      const rec = ROSTER[+ri]; if (!rec) break;
      const bi = p.bags.findIndex(b => b.u === +iu);
      if (bi >= 0) sendItem(rec, bi);
      showAIInspect(rec);
      break;
    }
    case 'askgold': { const rec = ROSTER[+v]; if (rec) { askForGold(rec); showAIInspect(rec); } break; }
    case 'askitem': { const rec = ROSTER[+v]; if (rec) { askForItem(rec); showAIInspect(rec); } break; }
    case 'grant': answerRequest(+v, true); renderPanel(); break;
    case 'deny': answerRequest(+v, false); renderPanel(); break;
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
  const hof = hallOfFame(POP + 1);
  const rank = hof.findIndex(r => r.i === rec.i) + 1;
  let h = '<div class="card"><div style="display:flex;gap:10px;align-items:center">' +
    '<div style="font-size:32px">' + cls.ic + '</div><div style="flex:1">' +
    '<div style="font-size:17px;font-weight:800" class="q' + Math.max(0, rec.best) + '">' + esc(rec.n) + (rec.title ? ' <span class="tiny">' + esc(rec.title) + '</span>' : '') + '</div>' +
    '<div class="tiny">Level ' + rec.lv + ' ' + cls.n + ' · ' + (g ? esc(g.n) : 'no clan') + '</div>' +
    '<div class="tiny">Currently ' + (AI_STATE_BY[rec.st] || { n: '—' }).n + ' in ' + esc((zoneAt(rec.x, rec.z) || { n: '?' }).n) + '</div>' +
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
  /* Their permanent record: this is the only part of them a season does not erase,
     and it is the reason they are somebody rather than a fresh roll of the dice. */
  {
    const lf = rec.lf || newLifeLedger();
    h += '<h4 class="sec">For All Time</h4>' +
      '<div class="row"><span class="k">Achievements</span><b style="color:#ffd766">' + (rec.achN || 0) +
      ' <span class="tiny">/ ' + ACH_TOTAL + '</span></b></div>' +
      '<div class="row"><span class="k">Earned this season</span><b>+' + (rec.achS || 0) + '</b></div>' +
      '<div class="row"><span class="k">Seasons played</span><b>' + (lf.seasons + 1) + '</b></div>' +
      '<div class="row"><span class="k">Lifetime kills</span><b>' + fmt(lifeVal(rec, 'kills')) + '</b></div>' +
      (lf.crowns ? '<div class="row"><span class="k">Crowns</span><b style="color:var(--gold)">' + lf.crowns + '</b></div>' : '') +
      (lf.asc ? '<div class="row"><span class="k">Ascensions</span><b class="q5">' + lf.asc + '</b></div>' : '') +
      (lf.relics ? '<div class="row"><span class="k">Eternal relics</span><b class="q6">' + lf.relics + '</b></div>' : '');
  }
  // ---- talk to them like a person ----
  const rel = rec.rel || 0;
  const mood = rel > 0.5 ? ['fond of you', '#4ad24a'] : rel > 0.12 ? ['warm', '#9ad2ff']
    : rel < -0.4 ? ['sick of you', '#e0492f'] : rel < -0.1 ? ['wary', '#f0a63c'] : ['neutral', '#9aa3b4'];
  h += '<h4 class="sec">Interact</h4>' +
    '<div class="tiny">They are <b style="color:' + mood[1] + '">' + mood[0] + '</b> toward you' +
    (rec.asked ? ' · you have asked them for something ' + rec.asked + '×' : '') + '.</div>';
  const p = G.player;
  const amts = [100, 1000, 10000].filter(a2 => p.gold >= a2);
  h += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">' +
    amts.map(a2 => '<div class="btn sm gold" data-act="givegold" data-v="' + rec.i + ':' + a2 + '">Send ' + fmt(a2) + 'g</div>').join('') +
    (p.gold >= 20 ? '<div class="btn sm gold" data-act="givegold" data-v="' + rec.i + ':pct">Send 10% (' + fmt(Math.floor(p.gold * .1)) + 'g)</div>' : '') +
    '</div>';
  h += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px">' +
    '<div class="btn sm" data-act="askgold" data-v="' + rec.i + '">Ask for gold</div>' +
    '<div class="btn sm" data-act="askitem" data-v="' + rec.i + '">Ask for an item</div></div>';
  if (p.bags.length) {
    h += '<h4 class="sec">Send an item</h4><div class="tiny">Tap to hand it over. If it beats what they are wearing, they will put it on.</div>';
    p.bags.forEach((it, i) => {
      h += '<div class="eqrow">' + cellHTML(it, 'bag', i) + '<div class="info"><div class="n q' + it.t + '">' + esc(it.n) + '</div>' +
        '<div class="s">' + SLOT_BY[it.sl].n + ' · ilvl ' + it.il + ' · worth ' + fmt(it.val) + 'g</div></div>' +
        '<div class="btn sm grn" data-act="giveitem" data-v="' + rec.i + ':' + it.u + '">Send</div></div>';
    });
  }
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
      '<td class="tiny">' + (AI_STATE_BY[r.st] || { n: '—' }).n + '</td></tr>';
  });
  h += '</table>';
  if (!g.playerGuild) h += '<div class="btn wide gold" style="margin-top:9px" data-act="join" data-v="' + g.i + '">Join ' + esc(g.n) + '</div>';
  openModal(g.n, h);
}
function openModal(title, html) {
  PANEL = PANEL || 'hof';
  PANEL_MODAL = true;
  $('panel').classList.add('on');
  $('ptitle').textContent = title;
  $('ptabs').innerHTML = '<div class="tab on" data-act="back">‹ Back</div>';
  /* Back used to call panelOpen2, which never rebuilds def.tabs -- the panel came back
     with only the Back chip and no way to change tabs. Reopen properly instead. */
  $('ptabs').firstChild.onclick = () => { sfx('ui', .6); PANEL_MODAL = false; const back = PANEL; PANEL = null; panelOpen(back); };
  $('pbody').innerHTML = html;
  $('pbody').scrollTop = 0;
  bindPanelActions($('pbody'));
  sfx('open', .6);
}

/* ------------------------------ SEASON END SCREEN ------------------------------ */
/* The Overlord's account of itself, prepended above the crowns. The cast log is the
   "why we lost" a player will screenshot, and the portent line is the honest statement
   of the odds: it is literally how many of the augury runs beat the health it was given. */
function ovResultHTML(rec) {
  const ov = SEASON.ov;
  if (!ov || ov.n !== rec.num) return '';
  const win = ov.outcome === 2, pyr = ov.outcome === 1;
  const col = win ? '#7ff2ff' : pyr ? '#d0a0ff' : '#ff5a72';
  let h = '<div class="champ" style="border-color:' + col + ';box-shadow:0 0 44px ' + col + '33">' +
    '<div class="tiny" style="letter-spacing:.3em;color:' + col + '">THE OVERLORD — KAARNATHUL, THE UNMADE</div>' +
    '<div class="cn" style="color:' + col + '">' +
    (win ? 'THE WORLD HELD' : pyr ? 'A HOLLOW VICTORY' : 'THE WORLD HAS FALLEN') + '</div>' +
    '<div class="tiny" style="color:#c9bda0;margin-top:4px">' +
    (win ? ov.alive + ' of ' + (POP + 1) + ' were still standing when it fell'
      : pyr ? 'It died. Every last one of you died with it. Nothing is carried.'
        : 'It finished the fight at ' + Math.round(ov.bossLeft * 100) + '% health. Nothing is carried.') +
    '</div>' +
    '<div class="tiny" style="color:#8f98a9;margin-top:6px">Level ' + ov.lvl + ' · ' +
    fmt(ov.bossHP) + ' health against ' + fmt(ov.d0) + ' raid damage per second · ' + ovClock(ov.dur) + '</div>';
  h += '<div class="tiny" style="color:#c9a6e8;margin-top:8px;font-style:italic">The augurs cast the battle ' +
    ov.dry + ' ways. In ' + ov.omens + ' of them, the Overlord fell.</div>';
  h += '<div class="tiny" style="margin-top:8px;color:' + (ov.pAlive ? '#7ff2ff' : '#ff8a9a') + ';font-weight:700">' +
    (ov.pAlive ? 'YOU WERE ONE OF THE SURVIVORS'
      : ov.pDeath >= 0 ? 'You fell at ' + ovClock(ov.pDeath) : 'You did not walk away') + '</div></div>';
  if (ov.log && ov.log.length) {
    h += '<div style="max-width:460px;margin:12px auto"><h4 class="sec">What It Cast</h4>' +
      ov.log.map(c => '<div class="row"><span class="k">' + ovClock(c.t) + ' · ' + esc(c.n) + '</span>' +
        '<b style="color:' + (c.dead > 100 ? '#ff5a72' : c.dead > 0 ? '#e0b070' : '#8f98a9') + '">' +
        (c.dead > 0 ? '−' + fmt(c.dead) : '—') + '</b></div>').join('') + '</div>';
  }
  if (win && ov.pAlive && ETERNAL.p.length) {
    const it = ETERNAL.p[ETERNAL.p.length - 1];
    h += '<div style="max-width:460px;margin:12px auto"><h4 class="sec">What You Carried Out</h4>' +
      '<div class="card" style="border-color:#7ff2ff"><b class="q6">' + esc(it.n) + '</b>' +
      '<div class="tiny" style="color:#c9bda0">' + RARITY[ETERNAL_TIER].n + ' ' + esc(SLOT_BY[it.sl].n) +
      ' · item level ' + it.il + '</div>' +
      (it.fl ? '<div class="tiny" style="font-style:italic;color:#8fb8c8;margin-top:3px">' + esc(it.fl) + '</div>' : '') +
      '<div class="tiny" style="margin-top:6px;color:#7ff2ff">This is yours. It follows you into Season ' + (rec.num + 1) + '.</div>' +
      '</div></div>';
  }
  return h;
}
/* The only call site of startNewSeason used to be a click handler, so an unattended world
   reached this screen and stopped there forever. Both paths go through here now. */
function ovStartNextSeason() {
  const box = $('seasonend');
  if (box) box.classList.remove('on');
  if (SEASON.ov) SEASON.ov.ph = 5;
  startNewSeason();
}
function showSeasonEnd(rec) {
  const box = $('seasonend');
  const crown = (title, c, sub) => c ? (
    '<div class="champ"><div class="tiny" style="letter-spacing:.3em;color:var(--gold)">' + title + '</div>' +
    '<div class="cn">' + esc(c.n) + (c.isPlayer ? ' <span style="font-size:.5em;color:#4ad24a">(YOU)</span>' : '') + '</div>' +
    '<div class="tiny" style="color:#c9bda0;margin-top:4px">Level ' + fmt(c.lv) + ' ' + CLASS_BY[c.c].n +
    ' \u00b7 ' + fmt(c.gs) + ' gear score</div>' +
    '<div class="tiny" style="color:#c9bda0">Best gear: <b class="q' + Math.max(0, c.best) + '">' +
    (c.best >= 0 ? RARITY[c.best].n : '\u2014') + '</b>' + (c.guild ? ' \u00b7 ' + esc(c.guild) : '') + '</div>' +
    (sub ? '<div class="tiny" style="color:#8f98a9;margin-top:5px">' + sub + '</div>' : '') + '</div>') : '';

  let h = '<h2>SEASON ' + rec.num + ' COMPLETE</h2>' +
    '<div class="tiny" style="letter-spacing:.24em;text-transform:uppercase;color:#9aa3b4">' +
    (rec.ascended && rec.ascended.length >= MYTHIC_LIMIT
      ? 'All ' + MYTHIC_LIMIT + ' Ascendant seats were claimed \u00b7 the final ten minutes are over'
      : 'The world resets \u00b7 champions are crowned') + '</div>';

  h += ovResultHTML(rec);

  if (rec.sweep) {
    h += crown('IDLE QUEST CHAMPION \u2014 LEVEL &amp; GEAR', rec.champ,
      'Took both crowns. Nobody else came close in either.');
  } else {
    h += crown('CHAMPION OF LEVELS', rec.champ, 'Highest level in the world');
    h += crown('CHAMPION OF GEAR', rec.gearChamp, 'Greatest gear power in the world');
  }

  if (rec.blazer) {
    h += '<div class="champ" style="border-color:#ffd766;box-shadow:0 0 40px rgba(255,215,102,.2)">' +
      '<div class="tiny" style="letter-spacing:.3em;color:#ffd766">THE TRAILBLAZER — MOST FIRST BLOODS</div>' +
      '<div class="cn">' + esc(rec.blazer.n) + (rec.blazer.isPlayer ? ' <span style="font-size:.5em;color:#4ad24a">(YOU)</span>' : '') + '</div>' +
      '<div class="tiny" style="color:#c9bda0;margin-top:4px">' + rec.blazer.c + ' world bosses killed before anyone else' +
      (rec.blazer.guild ? ' · ' + esc(rec.blazer.guild) : '') + '</div>' +
      '<div class="tiny" style="color:#8f98a9;margin-top:5px">' + (rec.firstsTaken || 0) + ' of ' + (rec.firstsTotal || 100) +
      ' claimed this season' + ((rec.firstsTotal || 100) - (rec.firstsTaken || 0) > 0
        ? ' — ' + ((rec.firstsTotal || 100) - (rec.firstsTaken || 0)) + ' were never brought down' : '') +
      (rec.playerFirsts ? ' · you took ' + rec.playerFirsts : '') + '</div></div>';
  }

  if (rec.ach) {
    h += '<div class="champ" style="border-color:#f0c257;box-shadow:0 0 40px rgba(240,194,87,.2)">' +
      '<div class="tiny" style="letter-spacing:.3em;color:#f0c257">THE ACHIEVEMENT CROWN \u2014 MOST EARNED THIS SEASON</div>' +
      '<div class="cn">' + esc(rec.ach.n) + (rec.ach.isPlayer ? ' <span style="font-size:.5em;color:#4ad24a">(YOU)</span>' : '') + '</div>' +
      '<div class="tiny" style="color:#c9bda0;margin-top:4px">' + rec.ach.earned + ' achievements earned this season \u00b7 ' +
      rec.ach.held + ' of ' + (rec.achTotal || ACH_TOTAL) + ' held for all time' +
      (rec.ach.guild ? ' \u00b7 ' + esc(rec.ach.guild) : '') + '</div>' +
      '<div class="tiny" style="color:#8f98a9;margin-top:5px">You finished #' + (rec.achRank || '\u2014') +
      ' with ' + (rec.playerAch || 0) + ' held, ' + (rec.playerAchS || 0) + ' earned this season. ' +
      'Achievements survive the wipe \u2014 they carry into the next world with you.</div></div>';
  }
  if (rec.testament) {
    h += '<div class="champ" style="border-color:#7ff2ff;box-shadow:0 0 44px rgba(127,242,255,.25)">' +
      '<div class="tiny" style="letter-spacing:.3em;color:#7ff2ff">THE TESTAMENT \u2014 ALL ' + (rec.achTotal || ACH_TOTAL) + ' CLOSED</div>' +
      '<div class="cn">' + esc(rec.testament.n) + (rec.testament.isPlayer ? ' <span style="font-size:.5em;color:#4ad24a">(YOU)</span>' : '') + '</div>' +
      '<div class="tiny" style="color:#c9bda0;margin-top:4px">Closed the board in Season ' + rec.testament.season +
      ' \u00b7 clad at ' + ACH_PRIZE_MULT + '\u00d7 the strongest Mythic ever forged</div>' +
      '<div class="tiny" style="color:#8f98a9;margin-top:5px">It will never be forged again.</div></div>';
  }

  if (rec.guild) {
    h += '<div class="champ" style="border-color:#4aa3f0;box-shadow:0 0 40px rgba(74,163,240,.2)">' +
      '<div class="tiny" style="letter-spacing:.3em;color:#8fc6ff">CROWNED CLAN \u2014 HIGHEST RESPECT</div>' +
      '<div class="cn">' + esc(rec.guild.n) + (rec.guild.isPlayerGuild ? ' <span style="font-size:.5em;color:#4ad24a">(YOURS)</span>' : '') + '</div>' +
      '<div class="tiny" style="color:#c9bda0;margin-top:4px">' + fmt(rec.guild.respect) + ' respect \u00b7 ' +
      rec.guild.members + ' members \u00b7 ' + rec.guild.wins + ' clan wars won</div></div>';
  }

  if (rec.ascended && rec.ascended.length) {
    h += '<div style="max-width:460px;margin:12px auto"><h4 class="sec">The Ascendants</h4>' +
      rec.ascended.map(a => '<div class="row"><span class="k">#' + a.place + ' to level ' + ASCEND_LEVEL + '</span>' +
        '<b class="q5">' + esc(a.n) + (a.isPlayer ? ' (you)' : '') + '</b></div>').join('') + '</div>';
  }

  h += '<div class="card" style="max-width:420px;margin:12px auto"><b style="color:var(--gold)">Your Season</b>' +
    '<div style="display:flex;gap:14px;justify-content:center;margin-top:4px">' +
    '<div><div style="font-size:22px;font-weight:900">#' + rec.playerRank + '</div><div class="tiny">by level (' + rec.playerLv + ')</div></div>' +
    '<div><div style="font-size:22px;font-weight:900">#' + (rec.playerGearRank || '\u2014') + '</div><div class="tiny">by gear</div></div>' +
    '</div><div class="tiny" style="margin-top:4px">of ' + (POP + 1) + ' adventurers</div></div>';

  h += '<div style="max-width:420px;margin:0 auto"><h4 class="sec">Final Top 10 by Level</h4>' +
    rec.top.map((r, i) => '<div class="row"><span class="k">' + (i + 1) + '. ' + esc(r.n) + (r.isPlayer ? ' (you)' : '') +
      '</span><b>Lv ' + fmt(r.lv) + ' \u00b7 ' + fmt(r.gs) + '</b></div>').join('') + '</div>';

  h += '<button class="bigbtn" style="margin-top:20px" id="newseason">Begin Season ' + (rec.num + 1) + '</button>' +
    '<div class="tiny" style="margin-top:8px;color:#8f98a9">Season ' + rec.num +
    ' is now permanently recorded in the Hall of Fame</div>';
  box.innerHTML = h;
  box.classList.add('on');
  $('newseason').onclick = () => { ovStartNextSeason(); sfx('levelup', 1); };
  sfx('levelup', 1);
}
