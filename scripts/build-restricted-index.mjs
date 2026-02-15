#!/usr/bin/env node
/**
 * Builds an Obsidian index of all restricted (unowned) content in the Compendium.
 */
import { readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';

const OBSIDIAN_BASE = "/Users/alexworland/Library/Mobile Documents/iCloud~md~obsidian/Documents/AlexObsidian/DnD/Compendium";
const MONSTERS_DIR = join(OBSIDIAN_BASE, "Monsters");

function parseFractionCR(cr) {
  if (cr === '?' || cr === 'Unknown') return 999;
  if (cr.includes('/')) {
    const [num, den] = cr.split('/').map(Number);
    return num / den;
  }
  return parseFloat(cr);
}

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.endsWith('.md') && entry !== 'Monster Index.md') {
      results.push(full);
    }
  }
  return results;
}

// Parse all monster files for restricted content
const allFiles = walkDir(MONSTERS_DIR);
const restricted = [];

for (const file of allFiles) {
  const content = readFileSync(file, 'utf-8');
  if (!content.includes('Restricted Content')) continue;

  const lines = content.split('\n');
  const name = (lines[0] || '').replace(/^#\s*/, '').trim();
  const typeLine = (lines[1] || '').replace(/^\*|\*$/g, '').trim();

  // Parse type line: "Medium Monstrosity, Unaligned"
  const typeMatch = typeLine.match(/^(\w+)\s+(.+?)(?:,\s*(.+))?$/);
  const size = typeMatch ? typeMatch[1] : '';
  const creatureType = typeMatch ? typeMatch[2] : '';

  // Parse CR
  const crMatch = content.match(/\*\*Challenge:\*\*\s*([^\s(]+)/);
  const cr = crMatch ? crMatch[1] : '?';

  // Get subfolder as creature type category
  const relPath = relative(MONSTERS_DIR, file);
  const typeFolder = dirname(relPath);

  restricted.push({ name, size, creatureType, cr, typeFolder, relPath });
}

console.log(`Found ${restricted.length} restricted monsters`);

// Sort by creature type then name
restricted.sort((a, b) => {
  if (a.typeFolder !== b.typeFolder) return a.typeFolder.localeCompare(b.typeFolder);
  return a.name.localeCompare(b.name);
});

// Group by creature type folder
const byType = {};
for (const m of restricted) {
  if (!byType[m.typeFolder]) byType[m.typeFolder] = [];
  byType[m.typeFolder].push(m);
}

// Also group by CR for a summary
const byCR = {};
for (const m of restricted) {
  const crKey = m.cr === '?' ? 'Unknown' : m.cr;
  if (!byCR[crKey]) byCR[crKey] = 0;
  byCR[crKey]++;
}

// Build the index
const lines = [
  '# Restricted Content Index',
  '',
  `*${restricted.length} monsters with restricted stat blocks (content not owned on D&D Beyond)*`,
  '',
  `*Generated ${new Date().toISOString().split('T')[0]}*`,
  '',
  '> [!info] About Restricted Content',
  '> These monsters are available on D&D Beyond but their full stat blocks require purchasing the source books.',
  '> Campaign content sharing does not extend to monster stat blocks — only character creation options',
  '> (spells, feats, races, backgrounds, items) are shared.',
  '',
  '## Summary by Creature Type',
  '',
  '| Type | Count |',
  '|------|-------|',
];

for (const [type, monsters] of Object.entries(byType).sort()) {
  lines.push(`| ${type} | ${monsters.length} |`);
}
lines.push(`| **Total** | **${restricted.length}** |`);

lines.push('', '## Summary by Challenge Rating', '', '| CR | Count |', '|-----|-------|');
const crOrder = Object.keys(byCR).sort((a, b) => parseFractionCR(a) - parseFractionCR(b));
for (const cr of crOrder) {
  lines.push(`| ${cr} | ${byCR[cr]} |`);
}

lines.push('', '---', '');

// Full listing by type
for (const [type, monsters] of Object.entries(byType).sort()) {
  lines.push(`## ${type} (${monsters.length})`, '');
  lines.push('| Monster | Size | CR |');
  lines.push('|---------|------|----|');
  for (const m of monsters) {
    const wikilink = `[[${m.typeFolder}/${m.name}|${m.name}]]`;
    lines.push(`| ${wikilink} | ${m.size} | ${m.cr} |`);
  }
  lines.push('');
}

const output = lines.join('\n');
writeFileSync(join(OBSIDIAN_BASE, 'Restricted Content Index.md'), output, 'utf-8');
console.log(`Wrote Restricted Content Index.md (${lines.length} lines)`);
