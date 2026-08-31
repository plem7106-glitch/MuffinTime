import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

const SOURCE_ROOT = path.join(projectRoot, 'Card_Detail', 'images');
const DEST_ROOT = path.join(projectRoot, 'public', 'cards');

const CATEGORIES = [
  {
    type: 'action',
    pattern: /^A(0[0-9]{2}|1[0-3][0-9]|138)\.jpe?g$/i,
    expectedFormat: 'A001.jpg - A138.jpg',
  },
  {
    type: 'trap',
    pattern: /^T(0[1-9]|[1-4][0-9]|5[0-3])\.jpe?g$/i,
    expectedFormat: 'T01.jpg - T53.jpg',
  },
  {
    type: 'counter',
    pattern: /^C(0[1-9]|[1-3][0-9]|40)\.jpe?g$/i,
    expectedFormat: 'C01.jpg - C40.jpg',
  },
];

console.log('🔄 Starting Muffin Time card artwork synchronization...\n');

let totalCopied = 0;
let totalWarnings = 0;

for (const { type, pattern, expectedFormat } of CATEGORIES) {
  const srcDir = path.join(SOURCE_ROOT, type);
  const destDir = path.join(DEST_ROOT, type);

  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true });
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const files = fs.readdirSync(srcDir);
  let categoryCopied = 0;

  for (const file of files) {
    if (file === '.gitkeep' || file.startsWith('.')) continue;

    const srcFile = path.join(srcDir, file);
    const stat = fs.statSync(srcFile);
    if (!stat.isFile()) continue;

    if (!pattern.test(file)) {
      console.warn(
        `⚠️  [WARNING] Invalid filename in "${type}": "${file}". Expected format: ${expectedFormat}. Skipping file.`
      );
      totalWarnings++;
      continue;
    }

    const destFile = path.join(destDir, file);
    fs.copyFileSync(srcFile, destFile);
    categoryCopied++;
  }

  console.log(`✅ [${type.toUpperCase()}] Synchronized: ${categoryCopied} images copied to public/cards/${type}/`);
  totalCopied += categoryCopied;
}

console.log(`\n🎉 Artwork Sync Summary:`);
console.log(`   - Total Images Copied: ${totalCopied}`);
console.log(`   - Warnings Encountered: ${totalWarnings}`);
console.log(`   - Target Directory: public/cards/\n`);
