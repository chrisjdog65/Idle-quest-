// Static guard: catch duplicate top-level declarations across the concatenated parts.
const fs = require('fs');
const files = ['01_core.js','02_audio.js','03_content.js','03b_ach.js','04_world.js','05_gfx.js','06_scene.js',
  '07_game.js','08_meta.js','09_ui.js','09b_panels.js','10_auto.js','11_main.js'];
const seen = new Map(); let bad = 0;
for (const f of files) {
  const src = fs.readFileSync('src/' + f, 'utf8').split('\n');
  src.forEach((line, i) => {
    const m = line.match(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/);
    if (!m) return;
    let names = [m[1]];
    // also catch `const A = 1, B = 2;` at top level
    if (/^(?:const|let|var)\s/.test(line)) {
      const rest = line.replace(/^(?:const|let|var)\s+/, '');
      const parts = rest.split(/,(?![^(\[{]*[)\]}])/);
      names = parts.map(s2 => (s2.match(/^\s*([A-Za-z_$][\w$]*)/) || [])[1]).filter(Boolean);
    }
    for (const n of names) {
      if (seen.has(n)) { console.log('DUPLICATE: ' + n + '  ' + seen.get(n) + '  <->  ' + f + ':' + (i + 1)); bad++; }
      else seen.set(n, f + ':' + (i + 1));
    }
  });
}
console.log(bad ? bad + ' duplicate top-level declaration(s)' : 'no duplicate top-level declarations (' + seen.size + ' globals)');
process.exit(bad ? 1 : 0);
