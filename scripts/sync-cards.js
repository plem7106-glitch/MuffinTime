import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const src = join(root, 'data', 'cards.json');
const destDir = join(root, 'public', 'data');
const dest = join(destDir, 'cards.json');

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}
const content = readFileSync(src, 'utf8');
writeFileSync(dest, content, 'utf8');
console.log(`Synced ${src} -> ${dest}`);
