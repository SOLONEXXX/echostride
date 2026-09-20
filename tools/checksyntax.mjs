// Parses every source file as an ES module so syntax errors surface without a
// browser. Cheap, and it has caught more typos than any test in this repo.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})('src');

let bad = 0;
for (const f of files) {
  try {
    // Import throws on syntax errors. `three` resolves from node_modules.
    await import(pathToFileURL(f).href);
  } catch (err) {
    if (err instanceof SyntaxError || /Unexpected|Invalid or unexpected/.test(err.message)) {
      console.error(`SYNTAX  ${f}\n        ${err.message}`);
      bad++;
    } else if (/Cannot find|not defined|document is not defined|window is not defined|navigator|WebGL|self is not defined/.test(err.message)) {
      // Browser-only globals at module scope are expected for some files.
    } else {
      console.error(`LOAD    ${f}\n        ${err.message}`);
      bad++;
    }
  }
}
console.log(bad === 0 ? `OK  ${files.length} modules parsed` : `FAIL ${bad}/${files.length}`);
process.exit(bad === 0 ? 0 : 1);
