/* ============================================================================
   ACHIEVEMENTS — 250 of them, and they are the only thing in this world that
   never resets. Gear dies with its season. Levels die with its season. What you
   have DONE is kept, for you and for all thousand of them, forever.

   Everything here is measured against a lifetime ledger (`lf` on a roster
   record, `life` on the player) which banks the season's counters at every
   wipe. An achievement is a threshold on one of those numbers, so a single
   comparison decides it for a player and for an AI alike -- which is what lets
   the board be honest about a thousand people at once.
   ============================================================================ */

const ACH_CATS = [
  { k: 'slay',  n: 'Slayer',    c: '#e0654a', d: 'Blood spilled, in bulk.' },
  { k: 'quest', n: 'Wayfarer',  c: '#6fc46a', d: 'Errands run and roads walked.' },
  { k: 'bane',  n: 'Bane',      c: '#e04a7a', d: 'World bosses put in the ground.' },
  { k: 'raid',  n: 'Raider',    c: '#b45ef0', d: 'Doors opened by a full warband.' },
  { k: 'coin',  n: 'Fortune',   c: '#f0c257', d: 'Gold earned, hoarded and handed away.' },
  { k: 'loot',  n: 'Collector', c: '#4aa3f0', d: 'What the drop tables owed you.' },
  { k: 'climb', n: 'Ascendant', c: '#f09a3c', d: 'The long climb, season after season.' },
  { k: 'clan',  n: 'Warband',   c: '#5ee0d0', d: 'What you were worth to a clan.' },
  { k: 'legend',n: 'Legend',    c: '#ffd76a', d: 'Crowns, firsts and finales.' },
  { k: 'roam',  n: 'Wanderer',  c: '#9fb4c8', d: 'Ground covered and punishment taken.' },
];
const ACH_CAT_BY = {}; ACH_CATS.forEach((c, i) => { ACH_CAT_BY[c.k] = c; c.idx = i; });

/* How a threshold reads as English, per tracked stat. %n is the number. */
const ACH_VERB = {
  kills:  'Slay %n monsters',
  quests: 'Complete %n quests',
  bosses: 'Kill %n world bosses',
  raids:  'Clear %n raids',
  deaths: 'Die %n times',
  pvp:    'Win %n duels',
  earn:   'Earn %n gold across your lifetime',
  purse:  'Hold %n gold at once',
  given:  'Give away %n gold',
  passed: 'Sell, trade or give away %n pieces of gear',
  items:  'Find %n items',
  rare:   'Find %n Rare or better items',
  epic:   'Find %n Epic or better items',
  legend: 'Find %n Legendary items',
  lv:     'Reach level %n',
  maxLv:  'Reach level %n',
  maxGs:  'Reach %n gear score',
  seasons:'Play %n seasons',
  asc:    'Ascend to level 200 %n times',
  sets:   'Earn %n Mythic sets',
  ov:     'Stand in %n Overlord finales',
  ovWin:  'Survive the Overlord %n times',
  relics: 'Hold %n Eternal relics',
  firsts: 'Take first blood on %n world bosses',
  crowns: 'Be crowned champion %n times',
  gcrowns:'Finish %n seasons in one of the ten best clans',
  blaze:  'Take the Trailblazer crown %n times',
  achCr:  'Take the Achievement crown %n times',
  top10:  'Finish a season in the top ten %n times',
  top100: 'Finish a season in the top hundred %n times',
  respect:'Earn %n respect',
  wars:   'Win %n clan wars',
  dist:   'Travel %n metres',
  zones:  'Set foot in %n of the world\'s regions',
  hours:  'Adventure for %n hours',
  guildLead: 'Be your clan\'s top earner %n times',
};

/* ---------------------------------------------------------------------------
   The table. [name, stat, threshold] -- 25 per category, 250 in all.
   Thresholds are set from a measured season (see the pacing note at the foot of
   this file): the top rung of each ladder is about five seasons of that
   activity for somebody good at it, and the rungs below are spaced so every
   season pays out a steady handful rather than one late avalanche.
   --------------------------------------------------------------------------- */
const ACH_RAW = {
  slay: [
    ['First Blood on the Boots', 'kills', 25],
    ['Something to Tell the Camp', 'kills', 100],
    ['A Working Sword Arm', 'kills', 300],
    ['The Culling Begins', 'kills', 700],
    ['Red Ledger', 'kills', 1300],
    ['Butcher of the Barrows', 'kills', 2100],
    ['Nothing Left Standing', 'kills', 3100],
    ['The Long Harvest', 'kills', 4300],
    ['Blade and Bone', 'kills', 5600],
    ['Slaughterwright', 'kills', 7000],
    ['The Field Does Not Empty', 'kills', 8600],
    ['Grinder of Ages', 'kills', 10300],
    ['Blade Without Bottom', 'kills', 12100],
    ['Ruin Walks Beside You', 'kills', 14000],
    ['The Last Argument', 'kills', 16000],
    ['Death Has an Understudy', 'kills', 18100],
    ['Twenty Thousand Quiet Fields', 'kills', 20300],
    ['The Reaper Takes Notes', 'kills', 22600],
    ['Attrition Incarnate', 'kills', 24500],
    ['A World Made Quieter', 'kills', 26400],
    ['Nothing Personal', 'kills', 28200],
    ['The Ledger Runs Out of Pages', 'kills', 29900],
    ['Extinction Event', 'kills', 31200],
    ['The Silence After', 'kills', 32200],
    ['They Stopped Counting', 'kills', 33000],
  ],
  quest: [
    ['Errand Runner', 'quests', 3],
    ['Reliable Sort', 'quests', 12],
    ['Ask For Them By Name', 'quests', 30],
    ['The Notice Board Regular', 'quests', 60],
    ['Every Village Knows You', 'quests', 100],
    ['Problem Solver', 'quests', 150],
    ['The Fixer', 'quests', 205],
    ['Debt of Favours', 'quests', 265],
    ['A Hundred Small Kindnesses', 'quests', 330],
    ['The Realm\'s Errand Runner', 'quests', 400],
    ['No Job Too Small', 'quests', 470],
    ['The Board Is Empty', 'quests', 545],
    ['They Queue For You', 'quests', 620],
    ['Contract Closed', 'quests', 695],
    ['The Guild Sends You First', 'quests', 770],
    ['Answerer of Prayers', 'quests', 845],
    ['A Thousand Errands', 'quests', 915],
    ['The Realm Owes You', 'quests', 985],
    ['Every Door Is Open', 'quests', 1050],
    ['The Name on Every Scroll', 'quests', 1110],
    ['Legend of the Notice Board', 'quests', 1165],
    ['Nothing Goes Unfinished', 'quests', 1215],
    ['The Work Is Never Done', 'quests', 1265],
    ['Errand of Ages', 'quests', 1310],
    ['The Realm Has Nothing Left To Ask', 'quests', 1350],
  ],
  bane: [
    ['Punched Above Your Weight', 'bosses', 1],
    ['Lair Cleared', 'bosses', 2],
    ['Trophy Wall', 'bosses', 4],
    ['The Big Ones', 'bosses', 6],
    ['Boss Killer', 'bosses', 9],
    ['Bane of the Deep Places', 'bosses', 12],
    ['They Know Your Banner', 'bosses', 16],
    ['Crowns Broken', 'bosses', 20],
    ['Lairbreaker', 'bosses', 24],
    ['The Beast Roll', 'bosses', 29],
    ['Nothing Sleeps Safely', 'bosses', 34],
    ['Monster Hunter Emeritus', 'bosses', 39],
    ['The Deep Places Empty', 'bosses', 45],
    ['Bane Absolute', 'bosses', 51],
    ['Terror of Terrors', 'bosses', 57],
    ['A Roll of Broken Beasts', 'bosses', 63],
    ['The Bestiary Thins', 'bosses', 69],
    ['They Flee the Sound of You', 'bosses', 75],
    ['Nothing Wakes That You Do Not Kill', 'bosses', 81],
    ['The Deep Has Nothing Left', 'bosses', 82],
    ['Slayer of the Named', 'bosses', 86],
    ['Ninety Great Beasts', 'bosses', 90],
    ['First to the Gate', 'firsts', 1],
    ['Twice There First', 'firsts', 2],
    ['Three Doors Kicked In', 'firsts', 3],
  ],
  raid: [
    ['You Answered the Call', 'raids', 1],
    ['Warm Body in the Back', 'raids', 2],
    ['Regular Roster Spot', 'raids', 3],
    ['The Clan Waits For You', 'raids', 5],
    ['Raid Leader Material', 'raids', 7],
    ['Wipe It and Pull Again', 'raids', 9],
    ['One More Pull', 'raids', 11],
    ['The Gate Opens For You', 'raids', 13],
    ['Veteran of the Deep Raids', 'raids', 15],
    ['Every Wing Cleared', 'raids', 17],
    ['Raidwright', 'raids', 19],
    ['The Doors Know Your Knock', 'raids', 21],
    ['A Hundred Wipes, A Hundred Clears', 'raids', 23],
    ['The Long Night Shift', 'raids', 25],
    ['Never Missed a Muster', 'raids', 27],
    ['The Warband Is You', 'raids', 29],
    ['Clearer of All Things', 'raids', 31],
    ['Raid Night Eternal', 'raids', 32],
    ['The Last Door', 'raids', 34],
    ['You Stood Before the Overlord', 'ov', 1],
    ['Twice Into the Dark', 'ov', 2],
    ['Three Finales', 'ov', 3],
    ['Four Times to the Edge', 'ov', 4],
    ['Five Times You Faced the End', 'ov', 5],
    ['You Walked Out of the Finale', 'ovWin', 1],
  ],
  coin: [
    ['Copper in the Pocket', 'earn', 500],
    ['Pays For the Round', 'earn', 4000],
    ['Comfortable', 'earn', 20000],
    ['Purse Full of Silver', 'earn', 70000],
    ['Merchant\'s Friend', 'earn', 180000],
    ['Small Fortune', 'earn', 380000],
    ['Coin Counter', 'earn', 680000],
    ['The Bank Knows You', 'earn', 1050000],
    ['Gold-Bloated', 'earn', 1500000],
    ['Vaultbreaker', 'earn', 2050000],
    ['The Realm\'s Richest Hands', 'earn', 2650000],
    ['Dragon-Hoard Money', 'earn', 3300000],
    ['You Could Buy a Zone', 'earn', 3950000],
    ['The Economy Rounds To You', 'earn', 4500000],
    ['A Thousand in Hand', 'purse', 1000],
    ['Heavy Pockets', 'purse', 25000],
    ['Walking Treasury', 'purse', 120000],
    ['Do Not Get Robbed', 'purse', 380000],
    ['The Hoard Rides With You', 'purse', 700000],
    ['A Coin For a Stranger', 'given', 250],
    ['Open Hand', 'given', 3000],
    ['Patron of Strangers', 'given', 30000],
    ['One For You', 'passed', 10],
    ['Quartermaster', 'passed', 200],
    ['It All Moves On', 'passed', 500],
  ],
  loot: [
    ['It Dropped Something', 'items', 20],
    ['Full Bags', 'items', 120],
    ['Packrat', 'items', 320],
    ['The Vendor Sighs', 'items', 600],
    ['Everything Sparkles', 'items', 900],
    ['Loot Goblin', 'items', 1200],
    ['Drop Table Devotee', 'items', 1500],
    ['One of Everything', 'items', 1780],
    ['The Hoard Grows', 'items', 1930],
    ['Nothing Left in the Tables', 'items', 2020],
    ['Something Blue', 'rare', 15],
    ['Blue Streak', 'rare', 90],
    ['Rare Is Not the Word', 'rare', 220],
    ['Common as Rare', 'rare', 380],
    ['The Uncommon Ordinary', 'rare', 485],
    ['Purple Day', 'epic', 5],
    ['Epic Habit', 'epic', 30],
    ['Fistful of Epics', 'epic', 70],
    ['Purple Rain', 'epic', 120],
    ['Epic Is Your Baseline', 'epic', 175],
    ['Orange Text', 'legend', 1],
    ['Twice Blessed', 'legend', 3],
    ['Legendary Streak', 'legend', 6],
    ['The Drop Gods Owe You Nothing', 'legend', 9],
    ['Clad in Orange', 'legend', 13],
  ],
  climb: [
    ['Out of the Starting Field', 'maxLv', 10],
    ['Past the First Zone', 'maxLv', 25],
    ['Getting Somewhere', 'maxLv', 45],
    ['Halfway to Nowhere', 'maxLv', 70],
    ['The Upper Zones', 'maxLv', 100],
    ['Rarefied Air', 'maxLv', 130],
    ['The Long Grind', 'maxLv', 160],
    ['In Sight of Two Hundred', 'maxLv', 185],
    ['ASCENDANT', 'maxLv', 200],
    ['Geared', 'maxGs', 3000],
    ['Well Geared', 'maxGs', 10000],
    ['Sharply Dressed', 'maxGs', 22000],
    ['Walking Armoury', 'maxGs', 38000],
    ['Gear Score Is a Lifestyle', 'maxGs', 55000],
    ['Dressed Like a Champion', 'maxGs', 75000],
    ['The Best Kit in the World', 'maxGs', 92000],
    ['One Season In', 'seasons', 1],
    ['Twice Around', 'seasons', 2],
    ['Third Verse', 'seasons', 3],
    ['Four Worlds Deep', 'seasons', 4],
    ['Five Wipes Survived', 'seasons', 5],
    ['Ascended Once', 'asc', 1],
    ['Ascended Again', 'asc', 2],
    ['Clad in Mythic', 'sets', 1],
    ['The Forge Knows Your Measurements', 'sets', 3],
  ],
  clan: [
    ['Signed the Charter', 'respect', 100],
    ['Pulling Your Weight', 'respect', 800],
    ['Named in the Roster', 'respect', 2200],
    ['Officer Material', 'respect', 3800],
    ['The Clan\'s Backbone', 'respect', 5400],
    ['Respect Is Earned', 'respect', 6800],
    ['The Banner Is Yours', 'respect', 8000],
    ['Warband Legend', 'respect', 9000],
    ['They Vote How You Vote', 'respect', 9800],
    ['Respect Without Ceiling', 'respect', 10500],
    ['The Roster Is Yours', 'respect', 11200],
    ['First War', 'wars', 1],
    ['Bloodied Banner', 'wars', 2],
    ['War Is the Point', 'wars', 3],
    ['Top of the Roster', 'guildLead', 1],
    ['Carried the Clan', 'guildLead', 2],
    ['First Duel', 'pvp', 1],
    ['Duellist', 'pvp', 2],
    ['Blade for Hire', 'pvp', 3],
    ['Nobody Wants the Fight', 'pvp', 4],
    ['Hands Down the Best', 'pvp', 5],
    ['Undisputed', 'pvp', 7],
    ['They Stopped Challenging', 'pvp', 9],
    ['Nobody Left Who Will Draw', 'pvp', 11],
    ['Champion of the Duelling Ground', 'pvp', 12],
  ],
  legend: [
    ['Named in the Hall', 'top100', 1],
    ['A Regular in the Hundred', 'top100', 2],
    ['Three Halls, One Name', 'top100', 3],
    ['Never Out of the Hundred', 'top100', 4],
    ['The Hundred Is a Formality', 'top100', 5],
    ['Top Ten', 'top10', 1],
    ['Top Ten Again', 'top10', 2],
    ['Three Times at the Summit', 'top10', 3],
    ['Permanently Top Ten', 'top10', 4],
    ['A Fixture at the Summit', 'top10', 5],
    ['CROWNED', 'crowns', 1],
    ['Twice Crowned', 'crowns', 2],
    ['Relic-Bearer', 'relics', 1],
    ['The Long Service', 'hours', 24],
    ['The Unclaimed Grow Few', 'firsts', 4],
    ['Thrice Ascendant', 'asc', 3],
    ['Four Times to Two Hundred', 'asc', 4],
    ['Five Times to Two Hundred', 'asc', 5],
    ['Four Mythic Forgings', 'sets', 4],
    ['Five Mythic Forgings', 'sets', 5],
    ['Three Seasons Carrying Them', 'guildLead', 3],
    ['Four Seasons Carrying Them', 'guildLead', 4],
    ['Four Wars Won', 'wars', 4],
    ['The Realm Answers to You', 'respect', 11800],
    ['The Finest Kit the World Has Made', 'maxGs', 96000],
  ],
  roam: [
    ['Off the Road', 'dist', 2000],
    ['Long Walk', 'dist', 12000],
    ['Boots Worn Through', 'dist', 35000],
    ['Cross-Country', 'dist', 70000],
    ['The Continent, End to End', 'dist', 110000],
    ['You Have Walked a World', 'dist', 155000],
    ['Wandering Is the Point', 'dist', 200000],
    ['No Ground Untrodden', 'dist', 222000],
    ['The Map Has Run Out', 'dist', 240000],
    ['Two Regions', 'zones', 2],
    ['Four Regions', 'zones', 4],
    ['Half the Map', 'zones', 6],
    ['Nine Regions', 'zones', 9],
    ['Every Region in the World', 'zones', 12],
    ['First Death', 'deaths', 1],
    ['It Happens', 'deaths', 10],
    ['Learning the Hard Way', 'deaths', 30],
    ['Reckless', 'deaths', 60],
    ['Death Is a Commute', 'deaths', 90],
    ['The Graveyard Knows You', 'deaths', 120],
    ['You Keep Getting Up', 'deaths', 150],
    ['An Hour Afield', 'hours', 1],
    ['A Long Afternoon', 'hours', 5],
    ['Half a Day Out', 'hours', 12],
    ['Twenty Hours Under the Sky', 'hours', 20],
  ],
};

/* Flatten into the one indexed list everything else works against. Order is
   category by category, and it is FROZEN -- an achievement's id is its bit
   position in every save file ever written, so new entries append, never
   insert. */
const ACH = [];
(function buildAchList() {
  for (const cat of ACH_CATS) {
    const rows = ACH_RAW[cat.k] || [];
    for (const [n, stat, need] of rows) {
      const verb = ACH_VERB[stat] || '%n';
      ACH.push({
        id: ACH.length, cat: cat.k, ci: cat.idx, n, stat, need,
        d: verb.replace('%n', need >= 10000 ? fmt(need) : need.toLocaleString('en-US')),
      });
    }
  }
})();
const ACH_TOTAL = ACH.length;
const ACH_WORDS = (ACH_TOTAL + 31) >> 5;
const ACH_BY_CAT = {};
for (const c of ACH_CATS) ACH_BY_CAT[c.k] = ACH.filter(a => a.cat === c.k);

/* ---- the bitfield ---- */
function newAchBits() { return new Array(ACH_WORDS).fill(0); }
function achHas(bits, id) { return bits && ((bits[id >> 5] >>> (id & 31)) & 1) === 1; }
function achSetBit(bits, id) { bits[id >> 5] |= (1 << (id & 31)); }
function achCount(bits) {
  let n = 0;
  for (let i = 0; i < ACH_WORDS; i++) {
    let v = bits[i] | 0;
    v = v - ((v >> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
    n += (((v + (v >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
  }
  return n;
}
/* pack/unpack for the save file: 8 words -> 8 base-36 chunks */
function achPack(bits) {
  const w = bits.map(x => (x >>> 0).toString(36));
  while (w.length > 1 && w[w.length - 1] === '0') w.pop();   // an early board is mostly empty high words
  return w.join('.');
}
function achUnpack(s) {
  const b = newAchBits();
  if (typeof s !== 'string') return b;
  const p = s.split('.');
  for (let i = 0; i < ACH_WORDS && i < p.length; i++) b[i] = parseInt(p[i], 36) | 0;
  return b;
}

/* ---- the lifetime ledger, on disk ----
   Key order is FROZEN: it is positional in every save file ever written, so new
   counters append to the end and nothing is ever removed or reordered. Values go
   out as base-36 integers, which keeps a thousand ledgers to roughly 140 bytes
   each instead of the 400 a JSON object costs. */
/* Densest counters first, rarest last, so the trailing-zero trim below actually
   bites: most of a thousand adventurers have never worn a crown. */
const LIFE_KEYS = ['kills', 'quests', 'bosses', 'raids', 'deaths', 'earn', 'given', 'passed',
  'items', 'rare', 'epic', 'dist', 'respect', 'play', 'zmask', 'maxLv', 'maxGs', 'purse',
  'seasons', 'ach', 'pvp', 'legend', 'ov', 'wars', 'top100', 'guildLead', 'gcrowns',
  'firsts', 'top10', 'relics', 'ovWin', 'asc', 'sets', 'crowns', 'blaze', 'achCr'];
function packLife(lf) {
  if (!lf) return '';
  const out = [];
  for (const k of LIFE_KEYS) out.push(Math.max(0, Math.round(lf[k] || 0)).toString(36));
  // trailing zeroes carry no information and are the bulk of an early save
  while (out.length && out[out.length - 1] === '0') out.pop();
  return out.join(',');
}
function unpackLife(s) {
  const lf = newLifeLedger();
  if (!s) return lf;
  const p = s.split(',');
  for (let i = 0; i < LIFE_KEYS.length && i < p.length; i++) lf[LIFE_KEYS[i]] = parseInt(p[i], 36) || 0;
  return lf;
}

/** "12.4K / 33K" — where somebody stands on one achievement, in its own units. */
function achProgTxt(who, a, isPlayer) {
  const have = achStat(who, a.stat, isPlayer);
  const f = n => a.need >= 10000 ? fmt(n) : (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
  return have >= a.need ? 'done' : f(have) + ' / ' + f(a.need);
}

/* The prize for finishing all 250 first: one set, five times the strongest
   Mythic the world has ever forged. There is exactly one, ever. */
const ACH_PRIZE_MULT = 5;
const ACH_PRIZE_TIER = 6;
const ACH_PRIZE_NAMES = ['Crown of the Whole Account', 'Mantle of Every Deed', 'Coat of Two Hundred and Fifty',
  'Grasp of the Completionist', 'Cincture of the Finished Work', 'Greaves of All Roads Walked',
  'Sabatons of the Last Errand', 'Vambraces of the Full Ledger', 'Torc of Nothing Left Undone',
  'Band of the Closed Book', 'Signet of the Final Tally', 'Charm of the Emptied Board',
  'Codex of Everything Done', 'Aegis of the Complete', 'Testament'];
