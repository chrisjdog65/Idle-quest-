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
  avoid: new Map(),          // entity id -> time until we stop running from it
  blocked: new Map(),        // 'raid:3' / 'boss:12' -> time until we retry it
  lastRaid: -1e9, committed: 0,
  travelT: 0, bestD: 1e9, noProg: 0,

  reset() {
    this.goal = null; this.goalKind = ''; this.act = 'idle';
    this.thinkT = 0; this.houseT = 0; this.stuckT = 0; this.repathT = 0;
    this.avoid.clear(); this.blocked.clear(); this.committed = 0;
    this.travelT = 0; this.bestD = 1e9; this.noProg = 0;
  },
  /** rough seconds to kill — used to refuse fights we cannot win */
  ttk(p, e) {
    const dps = Math.max(1, p.st.dps);
    return e.hp / dps;
  },
  setGoal(x, z, kind, name, tag) {
    this.goal = [x, z]; this.goalKind = kind || 'travel'; this.goalName = name || '';
    this.repathT = 0; this.goalTag = tag || '';
    this.travelT = 0; this.bestD = 1e9; this.noProg = 0;
  },
  isBlocked(tag) { const t = this.blocked.get(tag); return t != null && t > this.t; },
  /** Abandon a destination we have failed to reach and stop choosing it. */
  abandonGoal(p, why) {
    if (this.goalTag) this.blocked.set(this.goalTag, this.t + 600);
    if (this.goalKind === 'raid') this.lastRaid = this.t;
    chatPushOnce('Cannot get there — ' + why + '. Finding something else to do.');
    this.goal = null; this.goalKind = ''; this.goalTag = '';
    this.committed = 0; this.thinkT = 0;
  },
  setGoalZone(zid) {
    const z = DB.zones[zid];
    this.setGoal(z.hx, z.hz, 'travel', z.n);
  },
  statusHTML() {
    if (G.overlord) return ovStatusLine();
    let s = '<b>' + esc(this.actLabel) + '</b>';
    if (this.goalName) s += '<br>→ ' + esc(this.goalName);
    if (this.sessionKills) s += '<br><span style="opacity:.8">' + this.sessionKills + ' kills · ' + fmt(this.sessionGold) + 'g · ' + this.sessionItems + ' drops</span>';
    return s;
  },

  /* ---------------------------------------------------------------- */
  update(dt, p) {
    if (!p.autoOn || p.dead) { if (p.dead) { this.actLabel = 'Reviving…'; INPUT.mx = INPUT.mz = 0; } return; }
    this.t += dt;

    /* ---- the Overlord overrides everything ----
       Returning here, above the raid short-circuit, skips in one move: a raid the player
       was mid-way through when the season ended; the disengage watchdog, which blacklists
       any mob still above 55% health the moment the player drops below 30% and would make
       the agent flee and never come back; pickFoe's refusals, which reject any boss more
       than +2 levels up or with a time-to-kill over 150 s, both of which a boss with a
       hundred million health fails; and chooseGoal, which would overwrite this every 3.5 s. */
    if (G.overlord && G.overlord.boss && !p.ovDown) {
      this.act = 'overlord'; this.actLabel = 'THE OVERLORD';
      this.goal = null; this.goalName = null; this.goalKind = '';
      G.target = G.overlord.boss;
      this.fight(dt, p, G.overlord.boss);
      return;
    }

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
      // answer anyone who has whispered asking for something
      for (const req of PENDING.slice()) {
        if (req.kind === 'gold') answerRequest(req.id, p.gold > req.amount * 12);
        else answerRequest(req.id, p.bags.length > 6);
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

    /* ---- raid night: check before combat, or we never stop killing trash ---- */
    if (!G.inRaid && this.goalKind !== 'raid' && (this.t - this.lastRaid) > 220) this.tryRaid(p);

    /* ---- bail out of a fight we are clearly losing ---- */
    const cur = G.target;
    if (cur && !cur.dead && cur.isMob) {
      const mine = p.hp / p.st.hpMax, theirs = cur.hp / cur.hpMax;
      if (mine < 0.30 && theirs > 0.55) {
        this.avoid.set(cur.id, this.t + 90);
        G.target = null;
        this.thinkT = 0;
        chatPushOnce('That one is out of our league — disengaging.');
      }
    }

    /* ---- fight anything that is already on us, or worth walking to ---- */
    let foe = (G.target && !G.target.dead && !this.isAvoided(G.target) &&
      V.dist(p.x, p.z, G.target.x, G.target.z) < 90) ? G.target : null;
    if (!foe) foe = this.pickFoe(p);
    if (foe) { G.target = foe; this.fight(dt, p, foe); return; }

    /* ---- otherwise pursue a goal ---- */
    this.thinkT -= dt;
    if (this.thinkT <= 0 || !this.goal) { this.thinkT = 3.5; this.chooseGoal(p); }
    this.travel(dt, p);
  },

  /* Choose something to kill. Mobs spawn in a ring around the player, so the
     agent has to be willing to walk to them rather than wait to be attacked. */
  isAvoided(e) { const t = this.avoid.get(e.id); return t != null && t > this.t; },
  /** Commit to the best raid we are eligible for. Returns true if we took one. */
  tryRaid(p) {
    const mode = p.autoMode || 'all';
    if (mode !== 'all' && mode !== 'raid') return false;
    // a raid has to be worth the walk: the range we will travel grows with level
    const reach = 380 + p.level * 7;
    /* Raid Night: if your own clan has called one and you can clear it, that is where
       you are going -- distance and level spread stop mattering, because turning up is
       the entire point of a clan calling a raid. */
    if (RAID_CALL && RAID_CALL.isMine && !raidAvailable(DB.raids[RAID_CALL.rid])
      && !this.isBlocked('raid:' + RAID_CALL.rid)) {
      const cr = DB.raids[RAID_CALL.rid];
      if (V.dist(p.x, p.z, cr.x, cr.zz) < 26) { if (startRaid(cr.id)) { this.lastRaid = this.t; return true; } }
      this.setGoal(cr.x, cr.zz, 'raid', 'Raid night — ' + cr.n, 'raid:' + cr.id);
      this.act = 'raid'; this.actLabel = 'Answering the call'; this.committed = 1;
      return true;
    }
    const ready = DB.raids.filter(r => !raidAvailable(r) && r.lv <= p.level && r.lv >= p.level - 40
      && !this.isBlocked('raid:' + r.id) && V.dist2(p.x, p.z, r.x, r.zz) < reach * reach);
    if (!ready.length) { this.lastRaid = this.t - 120; return false; }   // re-check soon
    ready.sort((a, b) => (V.dist2(p.x, p.z, a.x, a.zz) - V.dist2(p.x, p.z, b.x, b.zz)) * 0.00002 + (b.lv - a.lv));
    const r = ready[0];
    if (V.dist(p.x, p.z, r.x, r.zz) < 14) { this.lastRaid = this.t; startRaid(r.id); return true; }
    this.setGoal(r.x, r.zz, 'raid', r.n, 'raid:' + r.id);
    this.act = 'raid'; this.actLabel = 'Travelling to raid'; this.committed = 1;
    return true;
  },
  pickFoe(p) {
    let best = null, bs = -1e9;
    // while travelling to a raid or a named boss, only stop for things hitting us
    // only a raid march ignores the world — boss hunts still clear quest mobs
    const onObjective = this.goalKind === 'raid' && this.committed;
    for (const e of G.ents) {
      if (!e.isMob || e.dead) continue;
      if (this.isAvoided(e)) continue;
      const d = V.dist(p.x, p.z, e.x, e.z);
      if (d > 130) continue;
      const attacking = e.st === 'chase' && d < 30;
      const wanted = this.isWantedTarget(p, e);
      // a raid march does not detour, but it will not walk past a quest kill
      if (onObjective && !attacking && !(wanted && d < 26)) continue;
      const overLevel = e.level - p.level;
      // refuse anything that would take longer to kill than we can survive
      if (!attacking) {
        if (overLevel > (e.kind === 'boss' ? 2 : 6) && this.goalKind !== 'boss') continue;
        const ttk = this.ttk(p, e);
        const cap = e.kind === 'boss' ? 150 : e.rank === 1 ? 55 : 30;
        if (ttk > cap) continue;
      }
      let sc = -d * 0.05;
      if (attacking) sc += 60;
      if (wanted) sc += 40;
      if (e.kind === 'boss') sc += (this.goalKind === 'boss' ? 90 : -25);
      if (e.rank === 1) sc += (p.level > 10 ? 8 : -20);
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
    this.committed = 0;
    // 1) a raid we can enter — raid night comes around on a timer, not a coin flip
    if (mode === 'all' || mode === 'raid') {
      const reach = 380 + p.level * 7;
      const ready = DB.raids.filter(r => !raidAvailable(r) && r.lv <= p.level && r.lv >= p.level - 40
        && !this.isBlocked('raid:' + r.id) && V.dist2(p.x, p.z, r.x, r.zz) < reach * reach);
      const due = mode === 'raid' || (this.t - this.lastRaid) > 220;
      if (ready.length && due) {
        ready.sort((a, b) => b.lv - a.lv);
        const r = ready[0];
        const d = V.dist(p.x, p.z, r.x, r.zz);
        if (d < 14) { this.lastRaid = this.t; startRaid(r.id); return; }
        this.setGoal(r.x, r.zz, 'raid', r.n, 'raid:' + r.id);
        this.act = 'raid'; this.actLabel = 'Travelling to raid'; this.committed = 1; return;
      }
    }
    // 2) an appropriate world boss
    if (mode === 'all' || mode === 'boss') {
      const cands = DB.bosses.filter(b => b.lv <= p.level + 2 && b.lv >= p.level - 26
        && (BOSS_STATE[b.id] || 0) <= G.t && !this.isBlocked('boss:' + b.id));
      if (cands.length && (mode === 'boss' || Math.random() < 0.26)) {
        /* First Blood: a lair nobody in the world has cleared is worth walking past two
           that are already spoken for. Distance still decides between equals, so the agent
           does not march across the continent for a claim it will lose on the way. */
        cands.sort((a, b) => {
          const fa = FIRSTS[a.id] ? 1 : 0, fb = FIRSTS[b.id] ? 1 : 0;
          if (fa !== fb) return fa - fb;
          return V.dist2(p.x, p.z, a.x, a.z2) - V.dist2(p.x, p.z, b.x, b.z2);
        });
        const unclaimed = cands.filter(b => !FIRSTS[b.id]);
        const pool = unclaimed.length ? unclaimed : cands;
        const b = pool[(Math.random() * Math.min(3, pool.length)) | 0];
        this.setGoal(b.x, b.z2, 'boss', b.n + ', ' + b.t, 'boss:' + b.id);
        this.act = 'boss';
        this.actLabel = FIRSTS[b.id] ? 'Hunting a world boss' : 'Racing for first blood';
        this.committed = 1; return;
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
        this.setGoal(best.tx, best.tz, 'quest', best.q.n, 'quest:' + best.q.id);
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
    this.setGoal(c.x, c.z, 'grind', c.n, 'camp:' + POI.camps.indexOf(c));
    this.act = 'grind'; this.actLabel = 'Grinding';
  },

  travel(dt, p) {
    if (!this.goal) { INPUT.mx = INPUT.mz = 0; this.actLabel = 'Thinking…'; return; }
    const [gx, gz] = this.goal;
    const d = V.dist(p.x, p.z, gx, gz);
    if (d < (this.goalKind === 'grind' || this.goalKind === 'quest' ? 16 : 9)) {
      if (this.goalKind === 'raid') {
        const r = DB.raids.find(r2 => Math.abs(r2.x - gx) < 2 && Math.abs(r2.zz - gz) < 2);
        if (r && !raidAvailable(r)) { this.lastRaid = this.t; startRaid(r.id); return; }
        this.committed = 0;
      }
      // arrived: linger and let the fight logic take over
      this.thinkT = Math.min(this.thinkT, 1.2);
      INPUT.mx = INPUT.mz = 0;
      this.actLabel = this.goalKind === 'boss' ? 'Searching the lair' : 'Clearing the area';
      return;
    }
    // watchdog: long journeys must actually make progress
    this.travelT += dt;
    if (d < this.bestD - 2) { this.bestD = d; this.noProg = 0; } else this.noProg += dt;
    if (this.noProg > 24 || this.travelT > 150) { this.abandonGoal(p, 'no route'); return; }

    const nv = [0, 0];
    navStep(p.x, p.z, gx, gz, nv, d > 70);      // swim across water on long trips
    INPUT.mx = nv[0]; INPUT.mz = nv[1];
    INPUT.sprint = d > 40;
    this.actLabel = ({ quest: 'Questing', grind: 'Grinding', boss: 'Hunting a world boss', raid: 'Travelling to raid', travel: 'Travelling' })[this.goalKind] || 'Travelling';
    // short-term snag (a boulder, a ledge): hop and sidestep, keep the goal
    this.stuckT += dt;
    if (this.stuckT > 2.5) {
      const moved = Math.hypot(p.x - this.lastPos[0], p.z - this.lastPos[1]);
      if (moved < 2.5) {
        INPUT.jump = true;
        const a = Math.random() * TAU;
        INPUT.mx = Math.sin(a); INPUT.mz = Math.cos(a);
      }
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
