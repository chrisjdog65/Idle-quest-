/* =========================================================================
   IDLE QUEST — 03 CONTENT
   Deterministic procedural content: classes & abilities, the item engine
   (6 rarity tiers, unbounded item level), 660+ quests, 100 bosses, 60 raids,
   12 zones, and the name banks that make it all feel hand-made.
   ========================================================================= */

const SEED = 20260827;

/* ------------------------------ RARITY ------------------------------ */
/* v[] is the relative weight of this tier for a drop source of quality 0..5.
   Weights, not probabilities — rollTier normalises them. Legendary and Mythic
   are deliberately brutal: an Ascendant should be a story, not a Tuesday. */
const RARITY = [
  { n: 'Common', c: '#9d9d9d', v: [.62, .55, .40, .24, .12, .06], mult: 1.00, af: 1, gv: 1 },
  { n: 'Uncommon', c: '#4ad24a', v: [.30, .34, .36, .34, .28, .20], mult: 1.28, af: 2, gv: 3 },
  { n: 'Rare', c: '#3f8fe0', v: [.072, .098, .19, .27, .34, .33], mult: 1.68, af: 3, gv: 9 },
  { n: 'Epic', c: '#b45ef0', v: [.008, .012, .048, .14, .24, .33], mult: 2.25, af: 4, gv: 34 },
  { n: 'Legendary', c: '#ff9a1f', v: [.00012, .0002, .0011, .0090, .032, .080], mult: 3.15, af: 5, gv: 150 },
  { n: 'Mythic', c: '#ff3f5f', v: [0, 0, 0, 0, 0, 0], mult: 4.60, af: 6, gv: 900 },
  /* Eternal is not a drop and not a grant. It is what you carry out of the Overlord
     alive, and the only object in the game that outlives a season. rollTier's loop
     runs t < 6, so nothing can ever roll into this tier by accident. */
  { n: 'Eternal', c: '#7ff2ff', v: [0, 0, 0, 0, 0, 0], mult: 6.60, af: 8, gv: 3000 },
];
const ETERNAL_TIER = 6;
/* Mythic gear is not a drop at all. It is the prize for being one of the first
   three adventurers in the world to reach ASCEND_LEVEL — a race, not a lottery.
   Once the third seat is claimed the season enters its final ten minutes. */
const ASCEND_LEVEL = 200;
const SEASON_GRACE_MS = 10 * 60 * 1000;
const RCOL = RARITY.map(r => r.c);
/** Only three souls in a season may ever bear Mythic ("Ascendant") gear. */
const MYTHIC_LIMIT = 3;

/* ------------------------------ SLOTS ------------------------------ */
const SLOTS = [
  { k: 'head', n: 'Head', ic: '⛑', w: 1.00, arm: 1 },
  { k: 'neck', n: 'Neck', ic: '📿', w: 0.72, arm: 0 },
  { k: 'shoulder', n: 'Shoulders', ic: '🛡', w: 0.92, arm: 1 },
  { k: 'back', n: 'Back', ic: '🧣', w: 0.72, arm: .5 },
  { k: 'chest', n: 'Chest', ic: '🥋', w: 1.10, arm: 1.2 },
  { k: 'wrist', n: 'Wrists', ic: '⌚', w: 0.62, arm: .6 },
  { k: 'hands', n: 'Hands', ic: '🧤', w: 0.78, arm: .8 },
  { k: 'waist', n: 'Waist', ic: '🎗', w: 0.78, arm: .8 },
  { k: 'legs', n: 'Legs', ic: '👖', w: 1.05, arm: 1.1 },
  { k: 'feet', n: 'Feet', ic: '🥾', w: 0.78, arm: .8 },
  { k: 'ring1', n: 'Ring', ic: '💍', w: 0.66, arm: 0 },
  { k: 'ring2', n: 'Ring', ic: '💍', w: 0.66, arm: 0 },
  { k: 'trinket', n: 'Trinket', ic: '🔮', w: 0.86, arm: 0 },
  { k: 'weapon', n: 'Weapon', ic: '⚔', w: 1.65, arm: 0 },
  { k: 'offhand', n: 'Off Hand', ic: '🔰', w: 0.86, arm: .7 },
];
const SLOT_KEYS = SLOTS.map(s => s.k);
const SLOT_BY = {}; SLOTS.forEach((s, i) => { SLOT_BY[s.k] = s; s.i = i; });

/* Base item nouns per slot, keyed by armour "family" so gear reads right. */
const BASE_NAMES = {
  head: ['Helm', 'Coif', 'Crown', 'Hood', 'Casque', 'Circlet', 'Visage', 'Faceguard', 'Cowl', 'Diadem'],
  neck: ['Amulet', 'Pendant', 'Choker', 'Necklace', 'Torque', 'Locket', 'Talisman', 'Medallion'],
  shoulder: ['Pauldrons', 'Spaulders', 'Mantle', 'Shoulderguards', 'Epaulets', 'Shoulderpads'],
  back: ['Cloak', 'Cape', 'Drape', 'Shroud', 'Wrap', 'Mantle', 'Veil'],
  chest: ['Breastplate', 'Chestguard', 'Robes', 'Tunic', 'Hauberk', 'Cuirass', 'Vest', 'Raiment'],
  wrist: ['Bracers', 'Vambraces', 'Wristguards', 'Bindings', 'Cuffs', 'Armguards'],
  hands: ['Gauntlets', 'Gloves', 'Handguards', 'Grips', 'Mitts', 'Fists'],
  waist: ['Girdle', 'Belt', 'Cord', 'Waistguard', 'Cinch', 'Sash'],
  legs: ['Legplates', 'Greaves', 'Leggings', 'Breeches', 'Kilt', 'Legguards'],
  feet: ['Sabatons', 'Boots', 'Treads', 'Striders', 'Walkers', 'Warboots', 'Sandals'],
  ring1: ['Ring', 'Band', 'Signet', 'Loop', 'Seal', 'Circle'],
  ring2: ['Ring', 'Band', 'Signet', 'Loop', 'Seal', 'Circle'],
  trinket: ['Idol', 'Charm', 'Figurine', 'Sigil', 'Relic', 'Totem', 'Orb', 'Phylactery'],
  weapon: ['Blade', 'Axe', 'Maul', 'Spear', 'Staff', 'Scepter', 'Dagger', 'Bow', 'Warhammer', 'Glaive', 'Cleaver', 'Sabre'],
  offhand: ['Bulwark', 'Aegis', 'Buckler', 'Tome', 'Focus', 'Barrier', 'Ward', 'Lantern'],
};
const ITEM_PREFIX = ['Ember', 'Frost', 'Storm', 'Iron', 'Shadow', 'Sun', 'Moon', 'Blood', 'Bone', 'Dread', 'Gale', 'Grave', 'Thorn', 'Rune',
  'Star', 'Void', 'Wyrm', 'Ash', 'Gloom', 'Dawn', 'Dusk', 'Riven', 'Silver', 'Obsidian', 'Verdant', 'Cinder', 'Tide', 'Bramble',
  'Hollow', 'Glimmer', 'Wither', 'Sable', 'Titan', 'Feral', 'Sacred', 'Rot', 'Mire', 'Quake', 'Zeal', 'Umbral', 'Radiant', 'Serpent'];
const ITEM_MID = ['forged', 'woven', 'bound', 'touched', 'sworn', 'wrought', 'sealed', 'kissed', 'marked', 'wracked', 'blessed', 'scarred'];
const ITEM_SUFFIX = ['of the Bear', 'of the Wolf', 'of the Eagle', 'of the Whale', 'of the Tiger', 'of the Serpent', 'of the Boar',
  'of Fury', 'of Ruin', 'of Ascension', 'of the Ancients', 'of Endless Night', 'of the Fallen King', 'of Storms', 'of Cinders',
  'of the Deep', 'of Sanctity', 'of the Hunt', 'of Whispers', 'of the Titan', 'of Blood Oaths', 'of the Frozen Waste',
  'of the Emberfall', 'of Broken Chains', 'of the Sky Throne', 'of Hollow Song', 'of the Last Dawn', 'of Nine Sorrows'];
const LEGEND_NAMES = ['Frostmourne\'s Echo', 'Sunsurge', 'Ashbringer\'s Ember', 'Nightfall', 'Doomcaller', 'Skyshatter', 'Worldbreaker',
  'Thunderfury', 'Gravewalker', 'Soulrend', 'Dawnbreaker', 'Voidwalker\'s Fang', 'Stormpike', 'Wyrmslayer', 'Bloodoath',
  'Titansteel Vow', 'Emberlight', 'The Hollow Crown', 'Winter\'s Grasp', 'Ruinsong', 'Starfall', 'Direheart', 'Mourncleaver',
  'Oathkeeper', 'The Long Dark', 'Sablewing', 'Kingsfall', 'Eternity\'s Vigil', 'Blightfang', 'Aurora\'s End'];
const MYTHIC_NAMES = ['Aeon, the World\'s Last Word', 'Crown of the Sundered Sky', 'Heart of the First Flame',
  'The Unmaking', 'Godsgrave', 'Infinity\'s Edge', 'The Ascendant Star', 'Requiem of Kings', 'Eclipse Absolute',
  'The Thousandth Dawn', 'Voidheart Ascendant', 'Chronoshard'];
/* Relics taken off the Overlord. Named for the thing that ended, because that is
   what a survivor carries into the next world. */
const ETERNAL_NAMES = ['Kaarnathul\'s Last Tooth', 'The Hour That Held', 'Vigil of the Thousand',
  'What Remained', 'The Unbroken Line', 'Ashes of the Overlord', 'Testament', 'The Standing Stone',
  'Oath of the Few', 'Nightfall Ended', 'The World\'s Last Word', 'Coil of the Unmade',
  'Reliquary of Names', 'The Long Silence', 'Sunder, the Answer', 'Crown of the Held Hour',
  'Mourncall', 'The Ninth Survivor', 'Ruin\'s Remembrance', 'Aeonlight', 'The Cost',
  'Everstill', 'Wound of the Deathless', 'The Tally'];
const ETERNAL_FLAVOR = ['"A thousand went in. This came out."', '"It remembers being carried."',
  '"The only thing here older than the world."', '"You were standing when it fell."',
  '"Every season forgets. This does not."', '"Taken, not given."'];
const ITEM_FLAVOR = ['"It still remembers the hand that forged it."', '"Warm to the touch. Always."', '"Sing, and it answers."',
  '"Older than the mountains it was cut from."', '"They buried this. Twice."', '"Do not name it aloud."',
  '"The last king wore this to the end."', '"Light bends around the edge."', '"It hungers, politely."',
  '"Forged in a season that never ended."', '"Nine smiths died finishing it."', '"You are not the first to hold it."'];

/* ------------------------------ STATS ------------------------------ */
const STATS = [
  { k: 'str', n: 'Strength', w: 1.0 }, { k: 'agi', n: 'Agility', w: 1.0 }, { k: 'int', n: 'Intellect', w: 1.0 },
  { k: 'sta', n: 'Stamina', w: 0.9 }, { k: 'crit', n: 'Critical Strike', w: 1.15 }, { k: 'haste', n: 'Haste', w: 1.15 },
  { k: 'mast', n: 'Mastery', w: 1.1 }, { k: 'vers', n: 'Versatility', w: 1.05 }, { k: 'arm', n: 'Armor', w: 0.55 },
  { k: 'leech', n: 'Leech', w: 1.3 }, { k: 'speed', n: 'Speed', w: 1.2 },
];
const AFFIXES = [
  { k: 'thorns', n: 'Thorns', d: v => 'Reflects ' + v + '% of melee damage taken' },
  { k: 'cleave', n: 'Cleaving', d: v => 'Attacks splash ' + v + '% damage to nearby foes' },
  { k: 'exec', n: 'Executioner', d: v => '+' + v + '% damage to targets below 30% health' },
  { k: 'oppor', n: 'Opportunist', d: v => '+' + v + '% damage from behind' },
  { k: 'ward', n: 'Warded', d: v => 'Absorbs ' + v + ' damage every 6s' },
  { k: 'swift', n: 'Swiftness', d: v => '+' + v + '% movement speed' },
  { k: 'greed', n: 'Avarice', d: v => '+' + v + '% gold from kills' },
  { k: 'schol', n: 'Scholar', d: v => '+' + v + '% experience gained' },
  { k: 'lucky', n: 'Fortune', d: v => '+' + v + '% rare loot chance' },
  { k: 'vamp', n: 'Vampiric', d: v => 'Heal for ' + v + '% of damage dealt' },
  { k: 'burn', n: 'Immolating', d: v => 'Attacks burn for ' + v + '% over 4s' },
  { k: 'frost', n: 'Chilling', d: v => 'Attacks slow enemies by ' + v + '%' },
  { k: 'surge', n: 'Surging', d: v => '+' + v + '% damage for 4s after a critical strike' },
  { k: 'bul', n: 'Bulwark', d: v => 'Reduces damage taken by ' + v + '%' },
  { k: 'rage', n: 'Frenzied', d: v => '+' + v + '% attack speed below 50% health' },
  { k: 'arc', n: 'Arcane Font', d: v => 'Restores ' + v + ' resource on kill' },
];

/* ------------------------------ CLASSES ------------------------------ */
/* type: m=melee r=ranged s=spell | effects handled in combat module */
const CLASSES = [
  {
    id: 'warrior', n: 'Warrior', ic: '⚔', role: 'Melee Bruiser', res: 'rage', resN: 'Rage', resC: '#d4622a',
    prim: 'str', base: { str: 22, agi: 13, int: 8, sta: 21 }, grow: { str: 2.6, agi: 1.2, int: .5, sta: 2.4 },
    armor: 1.35, wpn: ['Blade', 'Axe', 'Maul', 'Warhammer', 'Cleaver'], col: [.78, .28, .18],
    blurb: 'Rage-fueled frontline. Hits hard, keeps standing.',
    ab: [
      { id: 'slash', n: 'Mortal Slash', ic: '🗡', cd: 0, cost: 0, cast: 0, rng: 3.4, t: 'm', dmg: 1.0, gen: 12, gcd: 1, auto: 1 },
      { id: 'rend', n: 'Rend', ic: '🩸', cd: 8, cost: 15, cast: 0, rng: 3.4, t: 'm', dmg: .7, dot: { d: 8, m: .34 }, gcd: 1 },
      { id: 'charge', n: 'Charge', ic: '💨', cd: 11, cost: 0, cast: 0, rng: 22, t: 'dash', dmg: .6, stun: 1.1, gcd: 1 },
      { id: 'whirl', n: 'Whirlwind', ic: '🌀', cd: 9, cost: 25, cast: 0, rng: 5.2, t: 'aoe', dmg: .95, gcd: 1 },
      { id: 'exec', n: 'Execute', ic: '💀', cd: 6, cost: 30, cast: 0, rng: 3.4, t: 'm', dmg: 2.5, exec: .35, gcd: 1 },
      { id: 'shout', n: 'Battle Shout', ic: '📣', cd: 45, cost: 0, cast: 0, rng: 0, t: 'buff', buff: { dmg: .30, d: 14 }, gcd: 1 },
    ]
  },
  {
    id: 'paladin', n: 'Paladin', ic: '🛡', role: 'Holy Guardian', res: 'mana', resN: 'Mana', resC: '#f0d264',
    prim: 'str', base: { str: 20, agi: 10, int: 15, sta: 24 }, grow: { str: 2.3, agi: .9, int: 1.6, sta: 2.7 },
    armor: 1.55, wpn: ['Warhammer', 'Maul', 'Blade', 'Scepter'], col: [.95, .82, .42],
    blurb: 'Shield of the Light. Nearly unkillable, heals allies.',
    ab: [
      { id: 'smite', n: 'Crusader Strike', ic: '✝', cd: 0, cost: 0, cast: 0, rng: 3.4, t: 'm', dmg: .95, gen: 6, gcd: 1, auto: 1 },
      { id: 'judge', n: 'Judgement', ic: '⚖', cd: 7, cost: 18, cast: 0, rng: 16, t: 's', dmg: 1.5, gcd: 1 },
      { id: 'conse', n: 'Consecration', ic: '🔆', cd: 10, cost: 26, cast: 0, rng: 6, t: 'aoe', dmg: 1.05, gcd: 1 },
      { id: 'holy', n: 'Holy Light', ic: '✨', cd: 5, cost: 30, cast: 1.4, rng: 20, t: 'heal', heal: 2.4, gcd: 1 },
      { id: 'shield', n: 'Divine Shield', ic: '🔰', cd: 60, cost: 0, cast: 0, rng: 0, t: 'buff', buff: { dr: .75, d: 8 }, gcd: 1 },
      { id: 'wrath', n: 'Avenging Wrath', ic: '👼', cd: 90, cost: 0, cast: 0, rng: 0, t: 'buff', buff: { dmg: .45, hst: .25, d: 18 }, gcd: 1 },
    ]
  },
  {
    id: 'ranger', n: 'Ranger', ic: '🏹', role: 'Ranged Hunter', res: 'energy', resN: 'Focus', resC: '#7ad46a',
    prim: 'agi', base: { str: 12, agi: 24, int: 10, sta: 17 }, grow: { str: 1.0, agi: 2.8, int: .8, sta: 1.9 },
    armor: 1.05, wpn: ['Bow', 'Spear', 'Glaive'], col: [.35, .68, .34],
    blurb: 'Death at three hundred paces. Pets, traps, precision.',
    ab: [
      { id: 'shot', n: 'Steady Shot', ic: '🏹', cd: 0, cost: 0, cast: 0, rng: 26, t: 'r', dmg: .95, gen: 10, gcd: 1, auto: 1 },
      { id: 'aim', n: 'Aimed Shot', ic: '🎯', cd: 8, cost: 25, cast: 1.6, rng: 30, t: 'r', dmg: 2.6, crit: .2, gcd: 1 },
      { id: 'multi', n: 'Multi-Shot', ic: '🎇', cd: 7, cost: 22, cast: 0, rng: 24, t: 'aoe', dmg: 1.0, rad: 6, gcd: 1 },
      { id: 'trap', n: 'Frost Trap', ic: '❄', cd: 18, cost: 12, cast: 0, rng: 18, rad: 6, t: 'aoe', dmg: .5, slow: .5, dur: 6, gcd: 1 },
      { id: 'roll', n: 'Disengage', ic: '💨', cd: 14, cost: 0, cast: 0, rng: 0, t: 'dodge', gcd: 0 },
      { id: 'rapid', n: 'Rapid Fire', ic: '⚡', cd: 75, cost: 0, cast: 0, rng: 0, t: 'buff', buff: { hst: .6, dmg: .2, d: 12 }, gcd: 1 },
    ]
  },
  {
    id: 'mage', n: 'Mage', ic: '🔮', role: 'Arcane Artillery', res: 'mana', resN: 'Mana', resC: '#4a86e0',
    prim: 'int', base: { str: 8, agi: 11, int: 26, sta: 14 }, grow: { str: .5, agi: .9, int: 3.0, sta: 1.6 },
    armor: 0.80, wpn: ['Staff', 'Scepter', 'Dagger'], col: [.34, .48, .92],
    blurb: 'Glass, and a great deal of cannon.',
    ab: [
      { id: 'bolt', n: 'Arcane Bolt', ic: '🔷', cd: 0, cost: 6, cast: 0, rng: 28, t: 's', dmg: .95, gcd: 1, auto: 1 },
      { id: 'fire', n: 'Fireball', ic: '🔥', cd: 0, cost: 22, cast: 1.7, rng: 30, t: 's', dmg: 2.3, dot: { d: 4, m: .2 }, gcd: 1 },
      { id: 'nova', n: 'Frost Nova', ic: '❄', cd: 16, cost: 20, cast: 0, rng: 7, t: 'aoe', dmg: .8, root: 3, gcd: 1 },
      { id: 'blizz', n: 'Blizzard', ic: '🌨', cd: 12, cost: 34, cast: 0, rng: 22, t: 'aoe', dmg: 1.3, rad: 8, slow: .4, gcd: 1 },
      { id: 'blink', n: 'Blink', ic: '✳', cd: 15, cost: 8, cast: 0, rng: 16, t: 'blink', gcd: 0 },
      { id: 'pyro', n: 'Pyroblast', ic: '☄', cd: 40, cost: 45, cast: 2.6, rng: 32, t: 's', dmg: 5.2, crit: .35, gcd: 1 },
    ]
  },
  {
    id: 'rogue', n: 'Rogue', ic: '🗡', role: 'Shadow Assassin', res: 'energy', resN: 'Energy', resC: '#e0c24a',
    prim: 'agi', base: { str: 14, agi: 26, int: 8, sta: 15 }, grow: { str: 1.2, agi: 3.1, int: .5, sta: 1.7 },
    armor: 0.95, wpn: ['Dagger', 'Sabre', 'Blade'], col: [.42, .34, .58],
    blurb: 'You will not see the first hit. Or the last.',
    ab: [
      { id: 'stab', n: 'Sinister Strike', ic: '🔪', cd: 0, cost: 0, cast: 0, rng: 3.2, t: 'm', dmg: .9, gen: 14, gcd: .9, auto: 1 },
      { id: 'eviscerate', n: 'Eviscerate', ic: '💥', cd: 4, cost: 30, cast: 0, rng: 3.2, t: 'm', dmg: 2.4, gcd: .9 },
      { id: 'poison', n: 'Deadly Poison', ic: '☠', cd: 9, cost: 18, cast: 0, rng: 3.2, t: 'm', dmg: .5, dot: { d: 12, m: .4 }, gcd: .9 },
      { id: 'fan', n: 'Fan of Knives', ic: '🌀', cd: 8, cost: 26, cast: 0, rng: 5, t: 'aoe', dmg: 1.05, gcd: .9 },
      { id: 'shadow', n: 'Shadowstep', ic: '💨', cd: 12, cost: 0, cast: 0, rng: 20, t: 'dash', dmg: .4, gcd: .9 },
      { id: 'adren', n: 'Adrenaline Rush', ic: '⚡', cd: 80, cost: 0, cast: 0, rng: 0, t: 'buff', buff: { hst: .5, dmg: .3, d: 15 }, gcd: .9 },
    ]
  },
  {
    id: 'druid', n: 'Druid', ic: '🍃', role: 'Wild Restorer', res: 'mana', resN: 'Mana', resC: '#54c46a',
    prim: 'int', base: { str: 13, agi: 15, int: 22, sta: 19 }, grow: { str: 1.1, agi: 1.4, int: 2.6, sta: 2.2 },
    armor: 1.0, wpn: ['Staff', 'Glaive', 'Maul'], col: [.36, .62, .40],
    blurb: 'Nature answers. Loudly.',
    ab: [
      { id: 'wrath', n: 'Wrath', ic: '🌿', cd: 0, cost: 8, cast: 0, rng: 26, t: 's', dmg: .95, gcd: 1, auto: 1 },
      { id: 'moon', n: 'Starfire', ic: '🌟', cd: 0, cost: 24, cast: 1.8, rng: 28, t: 's', dmg: 2.4, gcd: 1 },
      { id: 'thorn', n: 'Thornlash', ic: '🌵', cd: 9, cost: 20, cast: 0, rng: 8, t: 'aoe', dmg: 1.15, dot: { d: 6, m: .25 }, gcd: 1 },
      { id: 'rejuv', n: 'Rejuvenation', ic: '💚', cd: 3, cost: 24, cast: 0, rng: 22, t: 'heal', heal: 1.1, hot: { d: 12, m: .18 }, gcd: 1 },
      { id: 'bark', n: 'Barkskin', ic: '🪵', cd: 50, cost: 0, cast: 0, rng: 0, t: 'buff', buff: { dr: .45, d: 12 }, gcd: 0 },
      { id: 'incarn', n: 'Incarnation', ic: '🦌', cd: 100, cost: 0, cast: 0, rng: 0, t: 'buff', buff: { dmg: .4, hst: .3, d: 20 }, gcd: 1 },
    ]
  },
];
const CLASS_BY = {}; CLASSES.forEach((c, i) => { CLASS_BY[c.id] = c; c.idx = i; });

/* ------------------------------ NAME BANKS ------------------------------ */
const NAME_A = ['Ael', 'Bry', 'Cor', 'Dor', 'Eld', 'Fen', 'Gar', 'Hal', 'Il', 'Jor', 'Kael', 'Lys', 'Mor', 'Nyx', 'Orin', 'Pyr',
  'Quel', 'Rav', 'Syl', 'Tor', 'Ul', 'Vex', 'Wyn', 'Xar', 'Yr', 'Zan', 'Bel', 'Drak', 'Ther', 'Vor', 'Sel', 'Kor', 'Mal', 'Ana',
  'Ser', 'Bran', 'Cid', 'Ryn', 'Thal', 'Ash', 'Grim', 'Val', 'Isol', 'Nem', 'Oth', 'Sar', 'Hex', 'Lum', 'Rig', 'Ven'];
const NAME_B = ['an', 'en', 'ar', 'or', 'is', 'us', 'ia', 'eth', 'yn', 'ax', 'ok', 'il', 'ur', 'as', 'ei', 'oth', 'ay', 'ir',
  'ess', 'ram', 'dor', 'wyn', 'gar', 'thas', 'rin', 'vek', 'mir', 'lok', 'zar', 'dan', 'ley', 'nis', 'roth', 'vin', 'kar'];
const NAME_C = ['', '', '', '', 'ia', 'or', 'us', 'eth', 'ion', 'ara', 'el', 'ax', 'im', 'oz'];
const TITLE_BANK = ['the Bold', 'the Swift', 'Ironheart', 'Stormcaller', 'the Undying', 'Dawnblade', 'Shadowend', 'the Grim',
  'Emberhand', 'Wolfsbane', 'the Patient', 'Nightwarden', 'Oathbound', 'the Relentless', 'Frostborn', 'Sunwarden',
  'the Exiled', 'Ashwalker', 'Ravenclaw', 'the Merciless', 'Lightbringer', 'Doomsayer', 'the Quiet', 'Bloodmark'];
const GUILD_A = ['Iron', 'Blood', 'Storm', 'Night', 'Dawn', 'Ember', 'Frost', 'Void', 'Grave', 'Sun', 'Moon', 'Shadow', 'Titan',
  'Bone', 'Wyrm', 'Gale', 'Rune', 'Star', 'Ash', 'Silver', 'Thorn', 'Crimson', 'Obsidian', 'Golden', 'Eternal', 'Savage',
  'Sacred', 'Hollow', 'Radiant', 'Feral', 'Umbral', 'Wandering'];
const GUILD_B = ['Legion', 'Vanguard', 'Covenant', 'Pact', 'Order', 'Sentinels', 'Wardens', 'Reapers', 'Wolves', 'Ravens',
  'Company', 'Brotherhood', 'Ascendancy', 'Dominion', 'Circle', 'Blades', 'Fists', 'Crown', 'Hand', 'Choir', 'Banner',
  'Hunt', 'Throne', 'Accord', 'Syndicate', 'Assembly', 'Host', 'Rebellion'];

/* ------------------------------ ZONES ------------------------------ */
/* Laid out on a 4x3 grid across the world; danger increases outward. */
const ZONE_NAMES = [
  ['Emberfall Meadows', 'meadow'], ['Thornwild Forest', 'forest'], ['Greymoor Fens', 'swamp'], ['Sunspire Steppe', 'plains'],
  ['Ashen Barrens', 'desert'], ['Frosthollow Vale', 'tundra'], ['Kirin Highlands', 'highland'], ['Duskmire Hollow', 'darkforest'],
  ['Cinderpeak Ridge', 'volcanic'], ['Palewatch Tundra', 'tundra'], ['The Shattered Coast', 'coast'], ['Voidscar Wastes', 'corrupt'],
];
const BIOME_COL = {
  meadow: [.40, .62, .27], forest: [.22, .45, .22], swamp: [.30, .40, .25], plains: [.58, .60, .30],
  desert: [.78, .68, .42], tundra: [.72, .77, .82], highland: [.44, .50, .38], darkforest: [.18, .26, .24],
  volcanic: [.32, .22, .20], coast: [.62, .58, .42], corrupt: [.34, .24, .42],
};
const MOB_FAMILIES = {
  meadow: ['Wild Boar', 'Meadow Wolf', 'Field Bandit', 'Thistle Sprite', 'Rock Badger', 'Hedge Troll'],
  forest: ['Thornback Bear', 'Bramble Stalker', 'Forest Spider', 'Wood Wraith', 'Antlered Fiend', 'Moss Golem'],
  swamp: ['Bog Lurker', 'Fen Serpent', 'Marsh Ghoul', 'Mire Hag', 'Plague Toad', 'Drowned Cultist'],
  plains: ['Steppe Raider', 'Sun Lion', 'Dust Harpy', 'Grassland Ogre', 'Windrunner Elk', 'Nomad Shaman'],
  desert: ['Sand Reaver', 'Scarab Swarm', 'Dune Wyrm', 'Sun-Cursed Husk', 'Salt Djinn', 'Bone Scorpion'],
  tundra: ['Frost Wolf', 'Ice Revenant', 'Snow Troll', 'Glacier Elemental', 'Rime Stalker', 'Frozen Warden'],
  highland: ['Crag Giant', 'Stormtalon', 'Highland Brute', 'Thunder Ram', 'Sky Drake', 'Runestone Guardian'],
  darkforest: ['Duskfang', 'Whispering Shade', 'Nightmare Elk', 'Hollow Child', 'Rootbound Horror', 'Pale Weaver'],
  volcanic: ['Cinder Imp', 'Magma Colossus', 'Ashborn Drake', 'Flame Cultist', 'Obsidian Hound', 'Emberlord Spawn'],
  coast: ['Reef Marauder', 'Tide Horror', 'Salt-Crusted Revenant', 'Storm Crab', 'Kraken Spawn', 'Drowned Corsair'],
  corrupt: ['Voidspawn', 'Scarred Aberration', 'Null Weaver', 'Faceless Hunger', 'Entropy Wisp', 'Rift Tyrant'],
};
const HUB_NAMES = ['Emberfall Keep', 'Thornhold', 'Greymoor Landing', 'Sunspire Rest', 'Ashgate Outpost', 'Frosthollow Camp',
  'Kirin Bastion', 'Duskwatch', 'Cinderforge', 'Palewatch Station', 'Saltcrown Harbour', 'The Last Redoubt'];

/* ------------------------------ CONTENT DB ------------------------------ */
const DB = { zones: [], quests: [], bosses: [], raids: [], byZone: [] };

function buildZones() {
  const rng = new RNG(SEED ^ 0xA11CE);
  const cols = 4, rows = 3, W = WORLD_SIZE, half = W / 2;
  for (let i = 0; i < 12; i++) {
    const gx = i % cols, gz = (i / cols) | 0;
    const cx = -half + (gx + .5) * (W / cols);
    const cz = -half + (gz + .5) * (W / rows);
    const order = ZONE_ORDER[i];
    const lvMin = 1 + order * 9, lvMax = lvMin + 11;
    const biome = ZONE_NAMES[i][1];
    DB.zones.push({
      id: i, n: ZONE_NAMES[i][0], biome, cx, cz, r: (W / cols) * .58,
      lvMin, lvMax, order, col: BIOME_COL[biome], mobs: MOB_FAMILIES[biome],
      hub: HUB_NAMES[i], hx: cx + rng.r(-40, 40), hz: cz + rng.r(-40, 40),
      danger: order,
    });
  }
}
/* Zone difficulty ordering — start zone is index 0, spiralling outward. */
const ZONE_ORDER = [0, 1, 4, 7, 2, 3, 6, 9, 5, 8, 10, 11];

function zoneAt(x, z) {
  const W = WORLD_SIZE, half = W / 2, cols = 4, rows = 3;
  let gx = Math.floor((x + half) / (W / cols)); gx = clamp(gx, 0, cols - 1);
  let gz = Math.floor((z + half) / (W / rows)); gz = clamp(gz, 0, rows - 1);
  return DB.zones[gz * cols + gx];
}

/* ---------- QUESTS: 55 per zone x 12 = 660 ---------- */
const Q_KILL = ['Cull the {m}', 'Thinning the {m}', '{m} Menace', 'Blood in the {z}', 'A Debt in {z}', 'No Quarter: {m}',
  'The {m} Problem', 'Hunted: {m}', 'Break the {m} Line', 'Silence the {m}'];
const Q_COLLECT = ['Gathering {i}', 'The {i} Cache', 'Supplies of {i}', 'Rare {i}', '{i} for the Forge', 'Harvest: {i}',
  'A Handful of {i}', 'The Missing {i}'];
const Q_BOSS = ['Slay {b}', 'The Fall of {b}', '{b} Must Die', 'Vengeance upon {b}', 'End of {b}'];
const Q_EXPLORE = ['Scout {p}', 'Chart {p}', 'What Lies at {p}', 'The Road to {p}', 'Beacon at {p}'];
const Q_ESCORT = ['Safe Passage to {p}', 'Guide the Caravan', 'The Long Walk', 'Escort to {p}'];
const Q_ITEMS = ['Bloodroot', 'Ember Shards', 'Iron Scrap', 'Wolf Pelts', 'Rune Fragments', 'Cursed Fangs', 'Bitterleaf',
  'Grave Dust', 'Sunstone', 'Frostglass', 'Void Splinters', 'Old Coins', 'Charred Bone', 'Silver Thread', 'Glowcaps',
  'Serpent Scales', 'Tidepearls', 'Ash Lily', 'Thunder Quills', 'Marrow Ink'];
/* The four landmark names each zone actually gets. Quest targets and ruin naming both
   draw from here, so an explore or escort quest always points at a place that exists
   in its own zone -- previously both picked independently from the full 14-name pool
   and usually disagreed. */
function zoneRuinNames(zid) {
  const r = new RNG((SEED ^ 0x9E37) + zid * 7919);
  const pool = Q_PLACES.slice();
  r.shuffle(pool);
  return pool.slice(0, 4);
}
const Q_PLACES = ['the Old Bridge', 'Widow\'s Rise', 'the Sunken Shrine', 'Hangman\'s Reach', 'the Broken Tower',
  'Kettle Falls', 'the Whispering Stones', 'Blackroot Hollow', 'the Sundered Gate', 'Mourner\'s Field', 'Cairn Hill',
  'the Drowned Chapel', 'Rookery Point', 'the Ember Crossing'];
const Q_DESC = [
  'The {z} has bled long enough. {m} prowl the roads and the merchants have stopped coming. Put them down.',
  'Every night the {m} take another from the outlying farms. Every morning we count the empty beds.',
  'We need {i}, and we need it before the frost. Bring what you can carry. Bring more if you can.',
  'Nobody who walked to {p} has walked back. Find out why. Then come back — that part matters.',
  'The scouts say {b} has been seen again. The scouts also say they are not going back.',
  'Take the road, keep your blade loose, and do not stop for anything that speaks kindly.',
  'It is not a glorious task. It is a necessary one. Those are rarely the same thing.',
  'You are the fourth to take this contract. Do try to be the last.',
];

function buildQuests() {
  const rng = new RNG(SEED ^ 0x0FFEE);
  let qid = 0;
  for (const z of DB.zones) {
    const list = [];
    for (let i = 0; i < 55; i++) {
      const lv = clamp(z.lvMin + Math.floor(i / 55 * 12), 1, 999);
      const roll = rng.f();
      let type, name, need, target, icon;
      const mob = rng.pick(z.mobs);
      if (roll < .46) {
        type = 'kill'; target = mob; need = rng.ri(6, 16);
        name = rng.pick(Q_KILL).replace('{m}', mob + 's').replace('{z}', z.n); icon = '⚔';
      } else if (roll < .72) {
        type = 'collect'; target = rng.pick(Q_ITEMS); need = rng.ri(5, 14);
        name = rng.pick(Q_COLLECT).replace('{i}', target); icon = '📦';
      } else if (roll < .84) {
        type = 'explore'; target = rng.pick(zoneRuinNames(z.id)); need = 1;
        name = rng.pick(Q_EXPLORE).replace('{p}', target); icon = '🧭';
      } else if (roll < .93) {
        type = 'escort'; target = rng.pick(zoneRuinNames(z.id)); need = 1;
        name = rng.pick(Q_ESCORT).replace('{p}', target); icon = '🛡';
      } else {
        type = 'elite'; target = mob + ' Champion'; need = rng.ri(2, 5);
        name = 'Champions of ' + z.n; icon = '👹';
      }
      const desc = rng.pick(Q_DESC).replace('{z}', z.n).replace('{m}', mob + 's')
        .replace('{i}', type === 'collect' ? target : rng.pick(Q_ITEMS))
        .replace('{p}', typeof target === 'string' ? target : rng.pick(Q_PLACES))
        .replace('{b}', 'the beast');
      const q = {
        id: qid++, z: z.id, lv, n: name, d: desc, t: type, tgt: target, need, ic: icon,
        xp: Math.round((42 + lv * 26) * (type === 'elite' ? 2.1 : 1) * rng.r(.9, 1.2)),
        gold: Math.round((14 + lv * 7) * (type === 'elite' ? 2.4 : 1) * rng.r(.85, 1.3)),
        rew: rng.chance(type === 'elite' ? .85 : .32),
        chain: (i % 5 === 4) ? roman(1 + ((i / 5) | 0) % 8) : '',
        giver: rng.chance(.5) ? z.hub : rng.pick(Q_PLACES),
      };
      if (q.chain) q.n = q.n + ' ' + q.chain;
      list.push(q); DB.quests.push(q);
    }
    DB.byZone[z.id] = list;
  }
}

/* ---------- BOSSES: 100 ---------- */
const BOSS_A = ['Vok', 'Thar', 'Xul', 'Mor', 'Zek', 'Gral', 'Nyx', 'Ur', 'Kaz', 'Drel', 'Sar', 'Yth', 'Bal', 'Oth', 'Ravn',
  'Kel', 'Vas', 'Hul', 'Zar', 'Mal', 'Ath', 'Grim', 'Sil', 'Torv', 'Emb', 'Quor', 'Ish', 'Nul', 'Vex', 'Rhu'];
const BOSS_B = ['thar', 'gorn', 'zul', 'rax', 'muun', 'kesh', 'dros', 'vane', 'gar', 'lith', 'noth', 'sur', 'khan', 'mir',
  'osk', 'thys', 'grave', 'wight', 'reth', 'dain', 'vok', 'ulm', 'shar', 'kor'];
const BOSS_TITLE = ['the Ashen Maw', 'Devourer of Dawn', 'the Unbroken', 'Hollow Sovereign', 'the Ninth Sorrow',
  'Warden of Chains', 'the Bleeding Star', 'Herald of Rot', 'the Frozen Judge', 'Tyrant of Cinders', 'the Faceless Choir',
  'Keeper of the Long Dark', 'the Storm Unending', 'Mother of Thorns', 'the Gilded Wound', 'Last of the Titans',
  'the Whispering Crown', 'Fang of the Deep', 'the Sunless King', 'Architect of Ruin', 'the Screaming Dusk',
  'Shepherd of Locusts', 'the Iron Sermon', 'Bearer of the Void Seal', 'the Emberfall Doom'];
const BOSS_MECH = [
  { k: 'cleave', n: 'Sundering Cleave', d: 'Massive frontal strike' },
  { k: 'aoe', n: 'Ground Slam', d: 'Shockwave from the boss' },
  { k: 'adds', n: 'Summon Thralls', d: 'Calls minions at 70% and 40%' },
  { k: 'enrage', n: 'Enrage', d: '+80% damage below 25% health' },
  { k: 'heal', n: 'Devour', d: 'Heals from nearby corpses' },
  { k: 'charge', n: 'Terrifying Charge', d: 'Fixates and charges a target' },
  { k: 'void', n: 'Void Zones', d: 'Leaves pools that must be avoided' },
  { k: 'shield', n: 'Arcane Barrier', d: 'Absorbs damage every 30s' },
  { k: 'fear', n: 'Bellow', d: 'Terrifies all nearby for 3s' },
  { k: 'meteor', n: 'Falling Sky', d: 'Rains meteors on the arena' },
  { k: 'phase', n: 'Phase Shift', d: 'Becomes untouchable and reforms' },
  { k: 'drain', n: 'Soul Drain', d: 'Siphons life from the raid' },
];
function bossName(rng) { return rng.pick(BOSS_A) + '\'' + rng.pick(BOSS_B); }
function buildBosses() {
  const rng = new RNG(SEED ^ 0xB055);
  const used = new Set();
  for (let i = 0; i < 100; i++) {
    const z = DB.zones[i % 12];
    let nm; let guard = 0;
    do { nm = bossName(rng); } while (used.has(nm) && guard++ < 50);
    used.add(nm);
    const tier = Math.floor(i / 12);            // 0..8 escalating
    const lv = clamp(z.lvMin + 4 + tier * 3, 3, 999);
    const nMech = clamp(2 + Math.floor(i / 20), 2, 6);
    const mech = rng.shuffle(BOSS_MECH.slice()).slice(0, nMech);
    DB.bosses.push({
      id: i, n: nm, t: rng.pick(BOSS_TITLE), z: z.id, lv,
      hp: 14 + tier * 5, dmg: 1.5 + tier * .22, mech,
      ic: rng.pick(['🐉', '👹', '💀', '🦂', '🕷', '🐺', '👁', '🦇', '🦈', '🐗', '🦅', '🧟']),
      x: z.cx + rng.r(-z.r * .7, z.r * .7), z2: z.cz + rng.r(-z.r * .7, z.r * .7),
      lootTier: clamp(1 + Math.floor(tier * .7), 1, 5),
      respawn: 90 + tier * 30,
    });
  }
}

/* ---------- RAIDS: 60 ---------- */
const RAID_A = ['Citadel', 'Sanctum', 'Necropolis', 'Vault', 'Spire', 'Crucible', 'Bastion', 'Halls', 'Depths', 'Throne',
  'Cathedral', 'Foundry', 'Labyrinth', 'Observatory', 'Menagerie', 'Reliquary', 'Ossuary', 'Forge', 'Gardens', 'Abyss'];
const RAID_B = ['of the Ashen Court', 'of Endless Night', 'of the Drowned King', 'of Broken Stars', 'of the First Flame',
  'of Hollow Song', 'of the Iron Sermon', 'of Nine Sorrows', 'of the Bleeding Sun', 'of Chains', 'of the Void Seal',
  'of the Last Dawn', 'of Winter\'s Mouth', 'of Rot and Ruin', 'of the Sky Throne', 'of Whispering Glass',
  'of the Gilded Wound', 'of Fallen Titans', 'of the Screaming Dusk', 'of the Unmade'];
function buildRaids() {
  const rng = new RNG(SEED ^ 0x2A1D);
  for (let i = 0; i < 60; i++) {
    const z = DB.zones[(i * 5 + 3) % 12];
    const tier = Math.floor(i / 6);            // 0..9
    const lv = clamp(8 + tier * 11 + rng.ri(0, 5), 5, 999);
    const size = [5, 10, 10, 20, 25, 25, 30, 40, 40, 40][tier];
    const nb = clamp(3 + Math.floor(tier * .7), 3, 9);
    const bosses = [];
    for (let b = 0; b < nb; b++) bosses.push(DB.bosses[(i * 7 + b * 13) % 100].id);
    DB.raids.push({
      id: i, n: rng.pick(RAID_A) + ' ' + rng.pick(RAID_B), z: z.id, lv, size, bosses,
      tier, ic: rng.pick(['🏰', '⛩', '🗿', '🏯', '⚱', '🕍', '🧿']),
      lock: 3600 * 1000 * (2 + tier),
      x: z.cx + rng.r(-z.r * .8, z.r * .8), zz: z.cz + rng.r(-z.r * .8, z.r * .8),
      lootTier: clamp(2 + Math.floor(tier * .45), 2, 5),
      gold: Math.round(300 * Math.pow(1.55, tier)),
      respect: 40 + tier * 55,
    });
  }
}

function buildContent() {
  buildZones(); buildQuests(); buildBosses(); buildRaids();
}

/* ------------------------------ FIRST BLOOD ------------------------------
   One hundred world bosses. One hundred firsts. Each claimable exactly once, by
   exactly one of the thousand, and never again for the rest of the season.

   The season's only other scarcity -- the three Ascendant seats -- resolves in the
   last ten minutes. This is the same shape (a ledger of holders, an ordinal, a
   chat line, a title you wear) spread across the whole four and a half hours, so
   that the middle of a season has something in it that can be taken from you.

   It paces itself with no tuning: bosses are built in nine escalating tiers
   (lv = zone.lvMin + 4 + tier*3), and advanceRec already sends adventurers to
   lairs by level fit -- so tier 0 falls in the opening minutes while the tier-8
   lairs out in the high zones are often still unclaimed when the crowns are read. */
const FB = {
  RATE: 0.0040,     // base per-second chance a qualified hunter finishes their boss
  SKILL: 0.28,      // how much skill matters. deliberately mild: the race should be
                    //   about who gets to the level first, not who was born best
  OVER: 12,         // levels above the boss at which a clear is comfortable
  OVERMAX: 1.6,
  TIER: 1.15,       // each escalating tier is this much slower to bring down, so the
                    //   deep lairs stay contested instead of the board emptying at the
                    //   wire and the mechanic going dead in the season's tensest hour
};

/* ------------------------------ THE OVERLORD ------------------------------
   The grand finale. When the season's crowns are handed out, every adventurer in
   the world -- all 1000 of them, and you -- takes the field against one thing.

   The 50/50 is not a magic number, it is a construction. At the moment the season
   ends we snapshot the whole army, run the fight 25 times against a boss that
   cannot die to measure how much damage this raid is actually capable of, and set
   the Overlord's health to the MEDIAN of those readings. The raid then wins exactly
   when it beats its own median. There is no threshold to drift and no fudge factor,
   and it stays even whether the world spent the season online or offline.

   Everything the outcome turns on is a named cast you watched land. Each mechanic
   rolls ONE severity and ONE coverage for the entire raid, so the uncertainty
   cannot be averaged away across a thousand actors the way per-actor noise is.
   Substitute those rolls with their means and the whole fight becomes perfectly
   deterministic -- that is the proof there is nothing hiding in the noise. */
const OV = {
  DRY: 25,          // dry runs against an unkillable boss; the median sets its health
  CAL: 1.00,        // deliberate thumb on the scale. 1.00 is an even fight, by construction
  TICK: 1.0,        // seconds of fight time per simulation step
  MAXT: 300,        // hard stop; a fight this long counts as a wipe
  GRIND: 0.0055,    // fraction of a combatant's health the Overlord grinds off per second
  REGEN: 0.0098,    // and what they heal back. Baseline FAVOURS the raid, so the field holds
  FOCUS: 0.65,      // steady early and collapses late -- which is the shape you want to watch
  RAMP: 55, RAMPP: 1.10,             // time escalation: it does not get tired, you do
  CASTMIN: 4, CASTMAX: 9,            // seconds between named mechanics
  SEVLO: 0.62, SEVHI: 1.48,          // ONE common severity roll per cast
  COVLO: 0.70, COVHI: 1.35,          // ONE common coverage roll per cast
  THROE_N: 3, THROE_SEV: 0.100, THROE_GROW: 1.55, THROE_JIT: 0.30,
  RESOLVE: 1.35,    // the player's one declared advantage over an equivalent adventurer
  SHOW_S: 80,       // wall-clock seconds the replay takes, whatever the fight's real length
  ACK_S: 45,        // unattended: seconds on the result screen before the next season starts
  CARRY_MAX: 48,    // relics the world may hold at once, or Eternal stops being eternal
  CATCHUP_MAX: 3,   // seasons resolved in one offline catch-up
};
/* The deck. sev = fraction of effective health to whoever it catches; cov = share of
   the raid caught; esc = how much worse it makes everything after it; heal = fraction
   of the raid's opening DPS handed back to the boss. Names are what you read on the
   cast bar a beat before it lands, and what you blame afterwards. */
const OV_MECH = [
  { n: 'Sundering Roar', sev: 0.16, cov: 0.95, esc: 1.000, heal: 0, d: 'The whole field staggers.' },
  { n: 'Cinder Rain', sev: 0.30, cov: 0.62, esc: 1.000, heal: 0, d: 'Fire falls across the muster.' },
  { n: 'Maw of the Unmade', sev: 1.35, cov: 0.18, esc: 1.000, heal: 0, d: 'It eats what it closes on.' },
  { n: 'Voidfall', sev: 0.62, cov: 0.44, esc: 1.000, heal: 0, d: 'The ground opens where you stand.' },
  { n: 'Grave Tide', sev: 0.78, cov: 0.55, esc: 1.000, heal: 0, d: 'A wave that does not break.' },
  { n: 'Hungering Gloom', sev: 0.20, cov: 0.40, esc: 1.000, heal: 4.5, d: 'It drinks the work back off its own wounds.' },
  { n: 'Rite of Ending', sev: 0.00, cov: 0.00, esc: 1.070, heal: 0, d: 'No blow lands. Everything after is worse.' },
  { n: 'Ashen Bulwark', sev: 0.10, cov: 0.30, esc: 1.045, heal: 1.6, d: 'It shrouds itself and presses.' },
  { n: 'Cull the Weak', sev: 0.95, cov: 0.26, esc: 1.000, heal: 0, d: 'It goes looking for the hurt.' },
  { n: 'Waning Hour', sev: 0.24, cov: 0.70, esc: 0.955, heal: 0, d: 'It overreaches, and pays for it.' },
];
const OV_MECH_W = [16, 13, 11, 12, 9, 8, 7, 8, 8, 8];
/** Item level of a relic taken off an Overlord fought at `level`. */
function eternalIlvl(level) { return Math.round(refIlvl(Math.max(1, level)) * 1.18 + 60); }

/* ------------------------------ ITEM ENGINE ------------------------------ */
/** Roll a rarity tier from a drop-quality context (0=trash .. 5=mythic source) */
function rollTier(rng, srcQuality, luck) {
  const q = clamp(srcQuality | 0, 0, 5);
  const w = [];
  for (let t = 0; t < 6; t++) {
    let v = RARITY[t].v[q];
    if (t >= 3) v *= (1 + (luck || 0));
    w.push(v);
  }
  return rng.wpick([0, 1, 2, 3, 4, 5], w);
}
/** power score: single comparable number for "how good is this" */
function itemScore(it) {
  if (!it) return 0;
  let s = 0;
  for (const k in it.st) { const sd = STATS.find(x => x.k === k); s += it.st[k] * (sd ? sd.w : 1); }
  s *= (1 + it.af.length * 0.06);
  return Math.round(s);
}
let ITEM_UID = 1;
function genItem(rng, ilvl, tier, slotKey, classId) {
  ilvl = Math.max(1, Math.round(ilvl));
  const slot = SLOT_BY[slotKey] || SLOT_BY[rng.pick(SLOT_KEYS)];
  const R = RARITY[tier];
  const cls = CLASS_BY[classId] || CLASSES[0];
  const budget = ilvl * 1.15 * slot.w * R.mult;
  const st = {};
  const prim = cls.prim;
  // primary + stamina always
  st[prim] = Math.max(1, Math.round(budget * 0.42 * rng.r(.9, 1.1)));
  st.sta = Math.max(1, Math.round(budget * 0.34 * rng.r(.9, 1.1)));
  if (slot.arm) st.arm = Math.max(1, Math.round(budget * 0.5 * slot.arm * rng.r(.9, 1.1)));
  // secondary stats: count grows with tier
  const secPool = ['crit', 'haste', 'mast', 'vers', 'leech', 'speed'];
  rng.shuffle(secPool);
  const nSec = clamp(1 + Math.floor(tier * .8), 1, 4);
  for (let i = 0; i < nSec; i++) st[secPool[i]] = Math.max(1, Math.round(budget * (0.17 - i * 0.03) * rng.r(.85, 1.2)));
  // affixes
  const af = [];
  const apool = AFFIXES.slice(); rng.shuffle(apool);
  const nAf = clamp(R.af - 1 + (rng.chance(.35) ? 1 : 0), 0, 7);
  for (let i = 0; i < nAf; i++) {
    const a = apool[i]; if (!a) break;
    af.push({ k: a.k, n: a.n, v: Math.max(1, Math.round((2 + ilvl * .06) * (1 + tier * .3) * rng.r(.7, 1.3))) });
  }
  // weapon damage
  let wdps = 0;
  if (slot.k === 'weapon') wdps = Math.round((4 + ilvl * 1.35) * R.mult * rng.r(.92, 1.1));
  // name
  let name, base;
  if (slot.k === 'weapon') base = rng.pick(cls.wpn);
  else base = rng.pick(BASE_NAMES[slot.k]);
  if (tier === 6) name = rng.pick(ETERNAL_NAMES);
  else if (tier === 5) name = rng.pick(MYTHIC_NAMES);
  else if (tier === 4) name = rng.chance(.6) ? rng.pick(LEGEND_NAMES) : rng.pick(ITEM_PREFIX) + rng.pick(ITEM_MID) + ' ' + base;
  else if (tier >= 2) name = rng.pick(ITEM_PREFIX) + base.toLowerCase() + ' ' + rng.pick(ITEM_SUFFIX);
  else if (tier === 1) name = rng.pick(ITEM_PREFIX) + ' ' + base;
  else name = ['Worn', 'Cracked', 'Rusted', 'Tattered', 'Dull', 'Plain'][rng.i(6)] + ' ' + base;

  const it = {
    u: ITEM_UID++, n: name, t: tier, il: ilvl, sl: slot.k, st, af, w: wdps,
    ic: slot.ic, fl: tier === 6 ? rng.pick(ETERNAL_FLAVOR) : tier >= 4 ? rng.pick(ITEM_FLAVOR) : '',
    cls: classId, base,
  };
  it.sc = itemScore(it);
  it.val = Math.round((ilvl * 2.2 + it.sc * .5) * RARITY[tier].gv * rng.r(.85, 1.15));
  return it;
}
/** compact item for the 1000-AI roster (memory-frugal) */
function genItemLite(rng, ilvl, tier) {
  return { t: tier, il: ilvl, sc: Math.round(ilvl * 1.15 * RARITY[tier].mult * 2.1 * rng.r(.9, 1.1)) };
}
function gearScoreOf(gear) {
  let s = 0, n = 0;
  for (const k of SLOT_KEYS) { const it = gear[k]; if (it) { s += it.sc; n++; } }
  return Math.round(s);
}
function bestTierOf(gear) { let t = -1; for (const k of SLOT_KEYS) { const it = gear[k]; if (it && it.t > t) t = it.t; } return t; }
