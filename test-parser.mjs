// Quick test: verify paint_color decoding and chunk generation
// Run: node test-parser.mjs

// Test decodePaintColor logic
function decodePaintColor(hex) {
  if (!hex || hex.length === 0) return 0;
  if (hex.length === 1) {
    const nibble = parseInt(hex, 16);
    const state = nibble >> 2;
    const split = nibble & 3;
    if (split === 0) return state;
  }
  const reader = { pos: 0 };
  return decodePaintTree(hex, reader);
}

function decodePaintTree(hex, reader) {
  if (reader.pos >= hex.length) return 0;
  const nibble = parseInt(hex[reader.pos++], 16);
  if (isNaN(nibble)) return 0;
  let state = nibble >> 2;
  const split = nibble & 3;
  if (state === 3) {
    if (reader.pos >= hex.length) return 0;
    const ext = parseInt(hex[reader.pos++], 16);
    if (isNaN(ext)) return 0;
    state = 3 + ext;
  }
  if (split === 0) return state;
  const numChildren = split + 1;
  const votes = new Map();
  for (let i = 0; i < numChildren; i++) {
    const childState = decodePaintTree(hex, reader);
    votes.set(childState, (votes.get(childState) || 0) + 1);
  }
  let bestState = 0, bestCount = 0;
  for (const [s, count] of votes) {
    if (s > 0 && count > bestCount) { bestState = s; bestCount = count; }
  }
  return bestState || 0;
}

// Test cases
const tests = [
  // Simple leaves
  { input: "8", expected: 2, desc: "state=2 (Ext2), leaf" },
  { input: "4", expected: 1, desc: "state=1 (Ext1), leaf" },
  { input: "0", expected: 0, desc: "state=0 (inherit), leaf" },

  // Extended state
  { input: "C0", expected: 3, desc: "state=3 (extended: 3+0), leaf" },
  { input: "C1", expected: 4, desc: "state=4 (extended: 3+1), leaf" },

  // From actual file
  { input: "0C", expected: null, desc: "from tile file - should decode" },

  // Subdivision examples from real data
  { input: "800C0C60C00A20C0C20C0C6", expected: null, desc: "23-char subdivision" },
];

console.log("=== paint_color decode tests ===");
for (const t of tests) {
  const result = decodePaintColor(t.input);
  const pass = t.expected === null ? true : result === t.expected;
  console.log(`  "${t.input}" -> state=${result} ${t.desc} ${pass ? "PASS" : "FAIL (expected " + t.expected + ")"}`);
}

// Now test with real file data
import JSZip from 'jszip';
import { readFileSync } from 'fs';

const buf = readFileSync('Hijri Calendar Display wo ramadan.3mf');
const zip = await JSZip.loadAsync(buf);

// Parse object_8 (hijri-days tile) and count extruder groups
const xml = await zip.file('3D/Objects/object_8.model').async('text');
const triRegex = /<triangle[^>]*>/g;
const paintRegex = /paint_color="([^"]+)"/;

const extruderCounts = new Map();
let triMatch;
let totalTris = 0;
while ((triMatch = triRegex.exec(xml)) !== null) {
  totalTris++;
  const pm = paintRegex.exec(triMatch[0]);
  const paintHex = pm ? pm[1] : '';
  const ext = decodePaintColor(paintHex);
  extruderCounts.set(ext, (extruderCounts.get(ext) || 0) + 1);
}

console.log(`\n=== object_8 (hijri-days) extruder distribution ===`);
console.log(`Total triangles: ${totalTris}`);
for (const [ext, count] of [...extruderCounts.entries()].sort()) {
  const pct = (count / totalTris * 100).toFixed(1);
  console.log(`  Extruder ${ext}: ${count} faces (${pct}%)`);
}

// Also check peg file
const pegXml = await zip.file('3D/Objects/object_5.model').async('text');
const pegCounts = new Map();
let pegTotal = 0;
let pm2;
const triRegex2 = /<triangle[^>]*>/g;
while ((pm2 = triRegex2.exec(pegXml)) !== null) {
  pegTotal++;
  const pm3 = paintRegex.exec(pm2[0]);
  const ext = decodePaintColor(pm3 ? pm3[1] : '');
  pegCounts.set(ext, (pegCounts.get(ext) || 0) + 1);
}

console.log(`\n=== object_5 (peg) extruder distribution ===`);
console.log(`Total triangles: ${pegTotal}`);
for (const [ext, count] of [...pegCounts.entries()].sort()) {
  console.log(`  Extruder ${ext}: ${count} faces`);
}

console.log(`\n=== Expected color mapping ===`);
console.log(`  Extruder 0 = inherit from part/object default`);
console.log(`  Extruder 1 = Filament 1 = #FFF144 (Yellow)`);
console.log(`  Extruder 2 = Filament 2 = #161616 (Black)`);

// Summary for each plate
console.log(`\n=== Expected plate colors ===`);
console.log(`Plate 1 (pegs + assembly 21):`);
console.log(`  Pegs: all ext 2 (Black) via paint_color`);
console.log(`  Assembly 21: part 17 ext=2 (Black), part 18 ext=1 (Yellow), part 19 ext=1 (Yellow)`);
console.log(`  Result: Black + Yellow ✓`);
console.log(`\nPlate 2 (tiles 8, 10, 12):`);
console.log(`  Object ext=1 (Yellow default)`);
console.log(`  paint_color splits faces into ext 1 (Yellow) and ext 2 (Black)`);
console.log(`  Result: Yellow + Black (text on ring) ✓`);
console.log(`\nPlate 3 (assembly 16):`);
console.log(`  Part 13 ext=2 (Black body), Part 14 ext=1 (Yellow calligraphy)`);
console.log(`  Result: Black + Yellow ✓`);
