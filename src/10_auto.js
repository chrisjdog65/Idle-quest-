/* =========================================================================
   IDLE QUEST — 10 AUTO QUEST
   A complete player-agent. It picks goals, navigates, fights with a real
   rotation, loots, equips, sells, turns quests in, hunts bosses, runs raids,
   joins clans and banks gold. Everything you can do, it does.
   ========================================================================= */

const AUTO = {
  goal: null, goalKind: '', goalName: '',
  act: 'idle', actLabel: 'Idle',
  t: 0, houseT: 0, thinkT: 0, stuckT: 0, lastPos: [0, 0], repathT: 0,
  raidT: 0, sessionXp: 0, sessionGold: 0, sessionItems: 0, sessionKills: 0,

  reset() {
    this.goal = null; this.goalKind = ''; this.act = 'idle';
    this.thinkT = 0; this.houseT = 0; this.stuckT = 0; this.repathT = 0;
  },
  setGoal(x, z, kind, name) {
    this.goal = [x, z]; this.goalKind = kind || 'travel'; this.goalName = name || '';
    this.repathT = 0;
  },
  setGoalZone(zid) {
    const z = DB.zones[zid];
    this.setGoal(z.hx, z.hz, 'travel', z.n);
  },
  statusHTML() {
    let s = '<b>' + esc(this.actLabel) + '</b>';
    if (this.goalName) s += '<br>→ ' + esc(this.goalName);
    if (this.sessionKills) s += '<br><span style="opacity:.8">' + this.sessionKills + ' kills · ' + fmt(this.sessionGold) + 'g · ' + this.sessionItems + ' drops</span>';
    return s;
  },

  /* ---------------------------------------------------------------- */
  update(dt, p) {
    if (!p.autoOn || p.dead) { if (p.dead) { this.actLabel = 'Reviving…'; INPUT.mx = INPUT.mz = 0; } return; }
    this.t += dt;

    /* ---- housekeeping: gear, junk, quests, clan ---- */
    this.houseT -= dt;
    if (this.houseT <= 0) {
      this.houseT = 4;
      autoEquipBest(p);
      if (p.bags.length > p.bagMax * 0.55) sellJunk(p, 4);
      // take any offer that beats vendor price on something we are not wearing
      for (const o of OFFERS.slice()) {
        const it = p.bags.find(b => b.u === o.uid);
        if (!it) continue;
        const cur = p.gear[it.sl === 'ring2' ? 'ring1' : it.sl];
        if (cur && it.sc > cur.sc) continue;
        if (o.price > it.val) acceptOffer(o.id);
      }
      // turn in anything finished
      for (const a of p.quests.slice()) {
        if (a.prog >= DB.quests[a.id].need) turnInQuest(p, a.id);
      }
      // keep the log full
      if (p.quests.length < MAX_QUESTS - 2) {
        const av = availableQuests(p, null);
        let added = 0;
        for (const q of av) { if (p.quests.length >= MAX_QUESTS || added >= 4) break; if (acceptQuest(p, q.id)) added++; }
      }
      // clan life
      if (p.guild == null) {
        if (p.gold >= 12000 && p.level > 20) foundGuild(p.name + '\'s Vanguard');
        else {
          const good = guildHall(12);
          const pick = good[(Math.random() * good.length) | 0];
          if (pick) joinGuild(pick.i);
        }
      }
    }

    /* ---- raids run themselves ---- */
    if (G.inRaid) {
      this.act = 'raid'; this.actLabel = 'Raiding ' + G.inRaid.r.n;
      this.goalName = 'encounter ' + (G.inRaid.boss + 1) + '/' + G.inRaid.r.bosses.length;
      const boss = G.inRaid.cur;
      if (boss && !boss.dead) { G.target = boss; this.fight(dt, p, boss); return; }
      INPUT.mx = INPUT.mz = 0; return;
    }

    /* ---- fight anything that is already on us, or worth walking to ---- */
    let foe = (G.target && !G.target.dead && V.dist(p.x, p.z, G.target.x, G.target.z) < 90) ? G.target : null;
    if (!foe) foe = this.pickFoe(p);
    if (foe) { G.target = foe; this.fight(dt, p, foe); return; }

    /* ---- otherwise pursue a goal ---- */
    this.thinkT -= dt;
    if (this.thinkT <= 0 || !this.goal) { this.thinkT = 3.5; this.chooseGoal(p); }
    this.travel(dt, p);
  },

  /* Choose something to kill. Mobs spawn in a ring around the player, so the
     agent has to be willing to walk to them rather than wait to be attacked. */
  pickFoe(p) {
    let best = null, bs = -1e9;
    for (const e of G.ents) {
      if (!e.isMob || e.dead) continue;
      const d = V.dist(p.x, p.z, e.x, e.z);
      if (d > 130) continue;
      const attacking = e.st === 'chase';
      const wanted = this.isWantedTarget(p, e);
      // never pick a fight far above our weight unless it is the stated goal
      const overLevel = e.level - p.level;
      if (!attacking && overLevel > (e.kind === 'boss' ? 2 : 6) && this.goalKind !== 'boss') continue;
      let sc = -d * 0.05;
      if (attacking) sc += 60;
      if (wanted) sc += 40;
      if (e.kind === 'boss') sc += (this.goalKind === 'boss' ? 80 : -25);
      if (e.rank === 1) sc += 8;
      if (sc > bs) { bs = sc; best = e; }
    }
    return bs > -1e8 ? best : null;
  },

  /* ---------------------------------------------------------------- */
  isWantedTarget(p, e) {
    if (this.goalKind === 'boss' && e.kind === 'boss') return true;
    if (e.kind === 'boss') return e.level <= p.level + 4;
    // does it complete a quest?
    for (const a of p.quests) {
      const q = DB.quests[a.id];
      if (a.prog >= q.need) continue;
      if ((q.t === 'kill' || q.t === 'elite') && e.name.indexOf(q.tgt) === 0) return true;
      if (q.t === 'collect') return true;
    }
    return this.goalKind === 'grind' && e.level <= p.level + 3;
  },

  chooseGoal(p) {
    const mode = p.autoMode || 'all';
    // 1) a raid we can enter, if that is the mode or we are geared for it
    if (mode === 'all' || mode === 'raid') {
      const ready = DB.raids.filter(r => !raidAvailable(r) && r.lv <= p.level && r.lv >= p.level - 30);
      if (ready.length && (mode === 'raid' || Math.random() < 0.30)) {
        ready.sort((a, b) => b.lv - a.lv);
        const r = ready[0];
        const d = V.dist(p.x, p.z, r.x, r.zz);
        if (d < 14) { startRaid(r.id); return; }
        this.setGoal(r.x, r.zz, 'raid', r.n);
        this.act = 'raid'; this.actLabel = 'Travelling to raid'; return;
      }
    }
    // 2) an appropriate world boss
    if (mode === 'all' || mode === 'boss') {
      const cands = DB.bosses.filter(b => b.lv <= p.level + 2 && b.lv >= p.level - 26 && (BOSS_STATE[b.id] || 0) <= G.t);
      if (cands.length && (mode === 'boss' || Math.random() < 0.26)) {
        cands.sort((a, b) => V.dist2(p.x, p.z, a.x, a.z2) - V.dist2(p.x, p.z, b.x, b.z2));
        const b = cands[(Math.random() * Math.min(3, cands.length)) | 0];
        this.setGoal(b.x, b.z2, 'boss', b.n + ', ' + b.t);
        this.act = 'boss'; this.actLabel = 'Hunting a world boss'; return;
      }
    }
    // 3) the nearest unfinished quest objective
    if (mode === 'all' || mode === 'quest') {
      let best = null, bd = 1e18;
      for (const a of p.quests) {
        const q = DB.quests[a.id];
        if (a.prog >= q.need) continue;
        let tx, tz;
        if (q.t === 'explore' || q.t === 'escort') {
          const ruin = POI.ruins.find(r => r.n === q.tgt && r.zone === q.z) || null;
          const zn = DB.zones[q.z];
          tx = ruin ? ruin.x : zn.hx; tz = ruin ? ruin.z : zn.hz;
        } else {
          const camps = POI.camps.filter(c => c.zone === q.z);
          const c = camps.length ? camps[(a.id + q.need) % camps.length] : null;
          const zn = DB.zones[q.z];
          tx = c ? c.x : zn.cx; tz = c ? c.z : zn.cz;
        }
        const d = V.dist2(p.x, p.z, tx, tz);
        if (d < bd) { bd = d; best = { tx, tz, q }; }
      }
      if (best) {
        this.setGoal(best.tx, best.tz, 'quest', best.q.n);
        this.act = 'quest'; this.actLabel = 'Questing'; return;
      }
    }
    // 4) grind at a level-appropriate camp
    const camps = POI.camps.filter(c => {
      const zn = DB.zones[c.zone];
      return p.level >= zn.lvMin - 3 && p.level <= zn.lvMax + 8;
    });
    const pool = camps.length ? camps : POI.camps;
    const c = pool[(Math.random() * pool.length) | 0];
    this.setGoal(c.x, c.z, 'grind', c.n);
    this.act = 'grind'; this.actLabel = 'Grinding';
  },

  travel(dt, p) {
    if (!this.goal) { INPUT.mx = INPUT.mz = 0; this.actLabel = 'Thinking…'; return; }
    const [gx, gz] = this.goal;
    const d = V.dist(p.x, p.z, gx, gz);
    if (d < (this.goalKind === 'grind' || this.goalKind === 'quest' ? 16 : 9)) {
      if (this.goalKind === 'raid') {
        const r = DB.raids.find(r2 => Math.abs(r2.x - gx) < 2 && Math.abs(r2.zz - gz) < 2);
        if (r && !raidAvailable(r)) { startRaid(r.id); return; }
      }
      // arrived: linger and let the fight logic take over
      this.thinkT = Math.min(this.thinkT, 1.2);
      INPUT.mx = INPUT.mz = 0;
      this.actLabel = this.goalKind === 'boss' ? 'Searching the lair' : 'Clearing the area';
      return;
    }
    const nv = [0, 0];
    navStep(p.x, p.z, gx, gz, nv);
    INPUT.mx = nv[0]; INPUT.mz = nv[1];
    INPUT.sprint = d > 40;
    this.actLabel = ({ quest: 'Questing', grind: 'Grinding', boss: 'Hunting a world boss', raid: 'Travelling to raid', travel: 'Travelling' })[this.goalKind] || 'Travelling';
    // stuck detection: if we barely moved for 2.5s, jump and pick a new goal
    this.stuckT += dt;
    if (this.stuckT > 2.5) {
      const moved = Math.hypot(p.x - this.lastPos[0], p.z - this.lastPos[1]);
      if (moved < 2.5) { INPUT.jump = true; this.thinkT = 0; this.goal = [gx + (Math.random() - .5) * 60, gz + (Math.random() - .5) * 60]; }
      this.lastPos[0] = p.x; this.lastPos[1] = p.z; this.stuckT = 0;
    }
  },

  /* ---------------------------------------------------------------- */
  fight(dt, p, foe) {
    const c = CLASS_BY[p.cls];
    const d = V.dist(p.x, p.z, foe.x, foe.z);
    const auto = c.ab.find(a => a.auto);
    const meleeRange = auto.rng + (foe.scale || 1) * .8;
    this.actLabel = 'Fighting ' + foe.name;
    this.goalName = 'Lv ' + foe.level + ' · ' + Math.round(clamp(foe.hp / foe.hpMax, 0, 1) * 100) + '%';

    // kite/close
    if (d > meleeRange * 0.85) {
      const nv = [0, 0]; navStep(p.x, p.z, foe.x, foe.z, nv);
      INPUT.mx = nv[0]; INPUT.mz = nv[1];
      INPUT.sprint = d > 22;
      this.actLabel = d > 30 ? 'Closing on ' + foe.name : 'Fighting ' + foe.name;
    } else if (d < meleeRange * 0.45 && auto.rng > 8) {
      // ranged classes back off a step
      const nx = (p.x - foe.x) / (d || 1), nz = (p.z - foe.z) / (d || 1);
      INPUT.mx = nx; INPUT.mz = nz; INPUT.sprint = false;
    } else { INPUT.mx = 0; INPUT.mz = 0; INPUT.sprint = false; }

    if (p.casting) return;
    if (p.gcd > 0) return;

    const hpFrac = p.hp / p.st.hpMax;
    // 1) emergency heal / defensive
    for (const ab of c.ab) {
      if (ab.t === 'heal' && hpFrac < 0.62 && abilityReady(p, ab)) { castAbility(p, ab, p); return; }
      if (ab.t === 'buff' && ab.buff.dr && hpFrac < 0.42 && abilityReady(p, ab)) { castAbility(p, ab, p); return; }
    }
    // 2) offensive cooldowns when the fight matters
    const bigFight = foe.kind === 'boss' || foe.rank === 1 || foe.hpMax > p.st.hpMax * 1.6;
    for (const ab of c.ab) {
      if (ab.t === 'buff' && (ab.buff.dmg || ab.buff.hst) && bigFight && abilityReady(p, ab)) { castAbility(p, ab, p); return; }
    }
    // 3) gap closer
    for (const ab of c.ab) {
      if (ab.t === 'dash' && d > 9 && d < ab.rng && abilityReady(p, ab)) { castAbility(p, ab, foe); return; }
    }
    // 4) AoE when several enemies are packed together
    let packed = 0;
    for (const e of G.ents) if (e.isMob && !e.dead && V.dist2(e.x, e.z, foe.x, foe.z) < 42) packed++;
    if (packed >= 3) {
      for (const ab of c.ab) if (ab.t === 'aoe' && abilityReady(p, ab) && d <= (ab.rad ? ab.rng : ab.rng)) { castAbility(p, ab, foe); return; }
    }
    // 5) best single-target damage that is off cooldown and affordable
    let best = null, bs = -1;
    for (const ab of c.ab) {
      if (!ab.dmg || ab.t === 'aoe' || ab.t === 'buff' || ab.t === 'heal') continue;
      if (!abilityReady(p, ab)) continue;
      if (d > ab.rng + (foe.scale || 1) * .8) continue;
      if (ab.exec && foe.hp / foe.hpMax > ab.exec) continue;
      // keep some resource in reserve for the rotation to keep flowing
      if (ab.cost > 0 && p.res - ab.cost < 0) continue;
      let score = ab.dmg / Math.max(0.35, ab.cast || 0.35);
      if (ab.auto) score *= 0.42;                  // filler
      if (ab.dot) score *= 1.12;
      if (score > bs) { bs = score; best = ab; }
    }
    if (best) { castAbility(p, best, foe); return; }
    // 6) nothing else: swing the filler
    if (abilityReady(p, auto) && d <= meleeRange) castAbility(p, auto, foe);
  },
};

/* Session counters for the status line — sampled from player stats. */
AUTO._snap = null;
AUTO.sample = function (p) {
  if (!this._snap) { this._snap = { k: p.kills, g: p.stats.goldEarned, i: p.stats.itemsFound }; return; }
  this.sessionKills = p.kills - this._snap.k;
  this.sessionGold = p.stats.goldEarned - this._snap.g;
  this.sessionItems = p.stats.itemsFound - this._snap.i;
};
