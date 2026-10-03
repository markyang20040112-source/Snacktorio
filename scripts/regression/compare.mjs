// Deep-compare two snapshot JSON files. Usage: node compare.mjs a.json b.json
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')));
let diffs = 0;
const MAX = 40;
function cmp(x, y, path) {
  if (diffs >= MAX) return;
  if (typeof x === 'number' && typeof y === 'number') {
    if (x !== y && !(Number.isNaN(x) && Number.isNaN(y))) { diffs++; console.log(`DIFF ${path}: ${x} -> ${y}`); }
    return;
  }
  if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') {
    if (x !== y) { diffs++; console.log(`DIFF ${path}: ${JSON.stringify(x)?.slice(0, 120)} -> ${JSON.stringify(y)?.slice(0, 120)}`); }
    return;
  }
  if (Array.isArray(x) !== Array.isArray(y)) { diffs++; console.log(`DIFF ${path}: array/object mismatch`); return; }
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) {
    if (!(k in x)) { diffs++; console.log(`ADDED ${path}.${k}`); continue; }
    if (!(k in y)) { diffs++; console.log(`REMOVED ${path}.${k}`); continue; }
    cmp(x[k], y[k], `${path}.${k}`);
  }
}
cmp(a, b, '$');
console.log(diffs === 0 ? `IDENTICAL (${Object.keys(a).length} cases)` : `${diffs}${diffs >= MAX ? '+' : ''} differences`);
process.exit(diffs === 0 ? 0 : 1);
