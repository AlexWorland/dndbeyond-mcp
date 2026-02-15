#!/usr/bin/env node
/**
 * D&D Beyond Campaign-Shared Content Extractor
 * Re-extracts items, feats, races, backgrounds, and spells using campaign sharing
 * to unlock content shared by the DM in the "One Shot" campaign.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ============================================================================
// CONFIG
// ============================================================================

const OBSIDIAN_BASE = "/Users/alexworland/Library/Mobile Documents/iCloud~md~obsidian/Documents/AlexObsidian/DnD/Compendium";
const CONFIG_PATH = join(process.env.HOME, ".dndbeyond-mcp/config.json");

const DDB_CHARACTER_SERVICE = "https://character-service.dndbeyond.com";
const CAMPAIGN_ID = 7506650; // "One Shot" campaign with DM content sharing

const RATE_LIMIT_MS = 600;
let lastRequestTime = 0;

// ============================================================================
// AUTH & FETCH (same as main script)
// ============================================================================

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

async function getCobaltToken(config) {
  const cookieStr = config.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await fetch("https://auth-service.dndbeyond.com/v1/cobalt-token", {
    method: "POST",
    headers: { Cookie: cookieStr, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Cobalt token failed: ${res.status}`);
  return (await res.json()).token;
}

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchApi(url, token, config) {
  await rateLimit();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (url.includes("www.dndbeyond.com")) {
    headers.Cookie = config.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 429) {
      console.warn(`  Rate limited, waiting 5s...`);
      await new Promise((r) => setTimeout(r, 5000));
      return fetchApi(url, token, config);
    }
    throw new Error(`API ${res.status}: ${url}`);
  }

  const json = await res.json();
  if (json && typeof json === "object" && "data" in json) {
    if ("success" in json && json.success) return json.data;
    if ("status" in json && json.status === "success") return json.data;
  }
  return json;
}

// ============================================================================
// HELPERS (same as main script)
// ============================================================================

function ensureDir(dir) { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); }

function sanitizeFilename(name) {
  return name.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function writeMarkdown(dir, filename, content) {
  ensureDir(dir);
  writeFileSync(join(dir, `${sanitizeFilename(filename)}.md`), content, "utf-8");
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/?(strong|b)>/gi, "**")
    .replace(/<\/?(em|i)>/gi, "*")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1))))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ordinal(n) {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

// ============================================================================
// SPELLS (with campaign sharing)
// ============================================================================

async function extractSpells(token, config) {
  console.log("\n=== SPELLS (with campaign sharing) ===");
  const baseDir = join(OBSIDIAN_BASE, "Spells");
  const CASTING_CLASSES = [1, 2, 3, 4, 5, 6, 7, 8];
  const allSpells = new Map();
  const campParam = `&campaignId=${CAMPAIGN_ID}`;

  for (const classId of CASTING_CLASSES) {
    // game-data/spells returns ALL spells including cantrips (level 0)
    try {
      const allClassSpells = await fetchApi(
        `${DDB_CHARACTER_SERVICE}/character/v5/game-data/spells?classId=${classId}&classLevel=20&sharingSetting=2${campParam}`,
        token, config
      );
      if (Array.isArray(allClassSpells)) {
        for (const s of allClassSpells) {
          if (s.definition?.name && !allSpells.has(s.definition.name)) {
            allSpells.set(s.definition.name, s);
          }
        }
      }
    } catch (e) { /* ignore */ }

    // always-known-spells and always-prepared-spells may return additional spells not in game-data/spells
    for (const endpoint of ["always-known-spells", "always-prepared-spells"]) {
      for (const level of [1, 20]) {
        try {
          const spells = await fetchApi(
            `${DDB_CHARACTER_SERVICE}/character/v5/game-data/${endpoint}?classId=${classId}&classLevel=${level}&sharingSetting=2${campParam}`,
            token, config
          );
          if (Array.isArray(spells)) {
            for (const s of spells) {
              if (s.definition?.name && !allSpells.has(s.definition.name)) {
                allSpells.set(s.definition.name, s);
              }
            }
          }
        } catch (e) { /* ignore */ }
      }
    }
  }

  const cantripCount = Array.from(allSpells.values()).filter(s => s.definition.level === 0).length;
  console.log(`  Loaded ${allSpells.size} unique spells (${cantripCount} cantrips, was 459+0 without campaign sharing)`);

  const ACTIVATION_TYPES = { 0: "No Action", 1: "Action", 2: "No Action", 3: "Bonus Action", 4: "Reaction", 5: "Special", 6: "Minute", 7: "Hour", 8: "Special" };
  const COMPONENT_MAP = { 1: "V", 2: "S", 3: "M" };

  const sorted = Array.from(allSpells.values()).sort((a, b) => {
    if (a.definition.level !== b.definition.level) return a.definition.level - b.definition.level;
    return a.definition.name.localeCompare(b.definition.name);
  });

  for (const spell of sorted) {
    const d = spell.definition;
    const levelLabel = d.level === 0 ? "Cantrip" : `${d.level}${ordinal(d.level)}-level`;
    const levelDir = d.level === 0 ? "Cantrips" : `Level ${d.level}`;

    const components = (d.components || []).map(c => COMPONENT_MAP[c]).filter(Boolean).join(", ");
    const materialNote = d.componentsDescription ? ` (${d.componentsDescription})` : "";
    const castingTime = d.activation
      ? `${d.activation.activationTime} ${ACTIVATION_TYPES[d.activation.activationType] || "Action"}`
      : "1 Action";

    let range = "Self";
    if (d.range) {
      range = d.range.rangeValue && d.range.origin !== "Self"
        ? `${d.range.rangeValue} ft`
        : d.range.origin || "Self";
      if (d.range.aoeType && d.range.aoeValue) {
        range += ` (${d.range.aoeValue}-ft ${d.range.aoeType})`;
      }
    }

    let duration = "Instantaneous";
    if (d.duration) {
      const interval = d.duration.durationInterval;
      const unit = d.duration.durationUnit;
      if (interval && unit) {
        duration = `${d.concentration ? "Concentration, up to " : ""}${interval} ${unit}${interval > 1 ? "s" : ""}`;
      } else if (d.duration.durationType === "Concentration") {
        duration = "Concentration";
      }
    }

    const tags = [];
    if (d.concentration) tags.push("concentration");
    if (d.ritual) tags.push("ritual");

    const md = [
      `# ${d.name}`,
      `*${levelLabel} ${d.school}*`,
      "",
      `| Property | Value |`,
      `|----------|-------|`,
      `| **Casting Time** | ${castingTime} |`,
      `| **Range** | ${range} |`,
      `| **Components** | ${components}${materialNote ? " " + materialNote : ""} |`,
      `| **Duration** | ${duration} |`,
      "",
      stripHtml(d.description || "No description available."),
    ];

    if (d.atHigherLevels?.higherLevelDefinitions?.length > 0) {
      md.push("", "***At Higher Levels.*** " + stripHtml(d.atHigherLevels.higherLevelDefinitions.map(h => h.description).join(" ")));
    } else if (d.atHigherLevels?.scaleType) {
      const scaleDesc = d.atHigherLevels.additionalDamage || d.atHigherLevels.additionalTargets;
      if (scaleDesc) md.push("", "***At Higher Levels.*** " + stripHtml(typeof scaleDesc === "string" ? scaleDesc : JSON.stringify(scaleDesc)));
    }

    writeMarkdown(join(baseDir, levelDir), d.name, md.join("\n"));
  }

  // Write index
  const indexLines = ["# Spell Compendium", "", `Total: ${allSpells.size} spells`, ""];
  const byLevel = {};
  for (const spell of sorted) {
    const lvl = spell.definition.level;
    if (!byLevel[lvl]) byLevel[lvl] = [];
    byLevel[lvl].push(spell.definition.name);
  }
  for (const [lvl, names] of Object.entries(byLevel).sort(([a], [b]) => a - b)) {
    const label = lvl === "0" ? "Cantrips" : `Level ${lvl}`;
    indexLines.push(`## ${label}`, "");
    for (const name of names) {
      indexLines.push(`- [[${label}/${name}|${name}]]`);
    }
    indexLines.push("");
  }
  writeMarkdown(baseDir, "Spell Index", indexLines.join("\n"));
  console.log(`  Wrote ${allSpells.size} spell files + index`);
  return allSpells.size;
}

// ============================================================================
// ITEMS (with campaign sharing)
// ============================================================================

async function extractItems(token, config) {
  console.log("\n=== ITEMS (with campaign sharing) ===");
  const baseDir = join(OBSIDIAN_BASE, "Items");

  const items = await fetchApi(
    `${DDB_CHARACTER_SERVICE}/character/v5/game-data/items?sharingSetting=2&campaignId=${CAMPAIGN_ID}`,
    token, config
  );

  if (!Array.isArray(items)) {
    console.warn("  No items returned");
    return 0;
  }

  console.log(`  Loaded ${items.length} items (was 1894 without campaign sharing)`);

  for (const item of items) {
    const typeDir = sanitizeFilename(item.filterType || item.type || "Other");
    const attune = item.requiresAttunement
      ? `**Requires Attunement**${item.attunementDescription ? " " + item.attunementDescription : ""}\n`
      : "";

    const props = item.properties?.length
      ? `**Properties:** ${item.properties.map(p => p.name).join(", ")}\n`
      : "";

    const md = [
      `# ${item.name}`,
      `*${item.filterType || item.type || "Item"}, ${item.rarity || "Common"}*`,
      "",
      attune,
      props,
      item.damage ? `**Damage:** ${item.damage.diceString} ${item.damageType || ""}` : "",
      item.range ? `**Range:** ${item.range}${item.longRange ? `/${item.longRange}` : ""} ft` : "",
      item.armorClass ? `**AC:** ${item.armorClass}${item.armorTypeId === 3 ? " + DEX" : item.armorTypeId === 2 ? " + DEX (max 2)" : ""}` : "",
      item.weight ? `**Weight:** ${item.weight} lb.` : "",
      item.cost ? `**Cost:** ${item.cost} ${item.costCurrencyType || "gp"}` : "",
      "",
      stripHtml(item.description || "No description available."),
    ].filter(Boolean).join("\n");

    writeMarkdown(join(baseDir, typeDir), item.name, md);
  }

  // Write index
  const typeGroups = {};
  for (const item of items) {
    const type = item.filterType || item.type || "Other";
    if (!typeGroups[type]) typeGroups[type] = [];
    typeGroups[type].push(item.name);
  }
  const indexLines = ["# Item Compendium", "", `Total: ${items.length} items`, ""];
  for (const [type, names] of Object.entries(typeGroups).sort()) {
    const safeType = sanitizeFilename(type);
    indexLines.push(`## ${type} (${names.length})`, "");
    for (const name of names.sort()) {
      indexLines.push(`- [[${safeType}/${name}|${name}]]`);
    }
    indexLines.push("");
  }
  writeMarkdown(baseDir, "Item Index", indexLines.join("\n"));
  console.log(`  Wrote ${items.length} item files + index`);
  return items.length;
}

// ============================================================================
// FEATS (with campaign sharing)
// ============================================================================

async function extractFeats(token, config) {
  console.log("\n=== FEATS (with campaign sharing) ===");
  const baseDir = join(OBSIDIAN_BASE, "Feats");

  const feats = await fetchApi(
    `${DDB_CHARACTER_SERVICE}/character/v5/game-data/feats?campaignId=${CAMPAIGN_ID}`,
    token, config
  );

  if (!Array.isArray(feats)) {
    console.warn("  No feats returned");
    return 0;
  }

  console.log(`  Loaded ${feats.length} feats (was 127 without campaign sharing)`);

  const seen = new Map();
  for (const feat of feats) {
    if (!seen.has(feat.name) || (feat.description || "").length > (seen.get(feat.name).description || "").length) {
      seen.set(feat.name, feat);
    }
  }
  const uniqueFeats = Array.from(seen.values());

  for (const feat of uniqueFeats) {
    const prereq = feat.prerequisite ? `**Prerequisite:** ${feat.prerequisite}\n` : "";
    const md = [
      `# ${feat.name}`,
      prereq,
      stripHtml(feat.description || "No description available."),
    ].filter(Boolean).join("\n");

    writeMarkdown(baseDir, feat.name, md);
  }

  // Write index
  const indexLines = ["# Feat Compendium", "", `Total: ${uniqueFeats.length} feats`, ""];
  for (const feat of uniqueFeats.sort((a, b) => a.name.localeCompare(b.name))) {
    indexLines.push(`- [[${feat.name}]]`);
  }
  writeMarkdown(baseDir, "Feat Index", indexLines.join("\n"));
  console.log(`  Wrote ${uniqueFeats.length} feat files + index`);
  return uniqueFeats.length;
}

// ============================================================================
// RACES (with campaign sharing)
// ============================================================================

async function extractRaces(token, config) {
  console.log("\n=== RACES (with campaign sharing) ===");
  const baseDir = join(OBSIDIAN_BASE, "Races");

  const races = await fetchApi(
    `${DDB_CHARACTER_SERVICE}/character/v5/game-data/races?campaignId=${CAMPAIGN_ID}`,
    token, config
  );

  if (!Array.isArray(races)) {
    console.warn("  No races returned");
    return 0;
  }

  console.log(`  Loaded ${races.length} races (was 33 without campaign sharing)`);

  for (const race of races) {
    if (!race.name) continue;
    const md = [
      `# ${race.name}`,
      "",
      stripHtml(race.description || "No description available."),
    ].join("\n");

    writeMarkdown(baseDir, race.name, md);
  }

  // Write index
  const indexLines = ["# Race Compendium", "", `Total: ${races.length} races`, ""];
  for (const race of races.filter(r => r.name).sort((a, b) => a.name.localeCompare(b.name))) {
    indexLines.push(`- [[${race.name}]]`);
  }
  writeMarkdown(baseDir, "Race Index", indexLines.join("\n"));
  console.log(`  Wrote ${races.length} race files + index`);
  return races.length;
}

// ============================================================================
// BACKGROUNDS (with campaign sharing)
// ============================================================================

async function extractBackgrounds(token, config) {
  console.log("\n=== BACKGROUNDS (with campaign sharing) ===");
  const baseDir = join(OBSIDIAN_BASE, "Backgrounds");

  const backgrounds = await fetchApi(
    `${DDB_CHARACTER_SERVICE}/character/v5/game-data/backgrounds?campaignId=${CAMPAIGN_ID}`,
    token, config
  );

  if (!Array.isArray(backgrounds)) {
    console.warn("  No backgrounds returned");
    return 0;
  }

  console.log(`  Loaded ${backgrounds.length} backgrounds (was 23 without campaign sharing)`);

  for (const bg of backgrounds) {
    if (!bg.name) continue;
    const md = [
      `# ${bg.name}`,
      "",
      stripHtml(bg.description || "No description available."),
    ].join("\n");

    writeMarkdown(baseDir, bg.name, md);
  }

  // Write index
  const indexLines = ["# Background Compendium", "", `Total: ${backgrounds.length} backgrounds`, ""];
  for (const bg of backgrounds.filter(b => b.name).sort((a, b) => a.name.localeCompare(b.name))) {
    indexLines.push(`- [[${bg.name}]]`);
  }
  writeMarkdown(baseDir, "Background Index", indexLines.join("\n"));
  console.log(`  Wrote ${backgrounds.length} background files + index`);
  return backgrounds.length;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("D&D Beyond Campaign-Shared Content Extractor");
  console.log("=============================================");
  console.log(`Campaign ID: ${CAMPAIGN_ID} (One Shot)`);
  console.log(`Output: ${OBSIDIAN_BASE}`);

  const config = loadConfig();
  console.log("Loaded auth config");

  const token = await getCobaltToken(config);
  console.log("Got cobalt token");

  const results = {};

  try { results.spells = await extractSpells(token, config); } catch (e) { console.error(`Spells failed: ${e.message}`); }
  try { results.items = await extractItems(token, config); } catch (e) { console.error(`Items failed: ${e.message}`); }
  try { results.feats = await extractFeats(token, config); } catch (e) { console.error(`Feats failed: ${e.message}`); }
  try { results.races = await extractRaces(token, config); } catch (e) { console.error(`Races failed: ${e.message}`); }
  try { results.backgrounds = await extractBackgrounds(token, config); } catch (e) { console.error(`Backgrounds failed: ${e.message}`); }

  // Update master index with new counts
  const masterIndex = [
    "# D&D Compendium",
    "",
    `*Extracted from D&D Beyond on ${new Date().toISOString().split("T")[0]}*`,
    `*Campaign sharing enabled (One Shot, campaignId: ${CAMPAIGN_ID})*`,
    "",
    "## Sections",
    `- [[Characters/]] — Your characters`,
    `- [[Spells/Spell Index|Spells]] — ${results.spells || 0} spells`,
    `- [[Monsters/Monster Index|Monsters]] — 5485 monsters`,
    `- [[Items/Item Index|Items]] — ${results.items || 0} items`,
    `- [[Classes/Class Index|Classes]] — 26 classes`,
    `- [[Feats/Feat Index|Feats]] — ${results.feats || 0} feats`,
    `- [[Races/Race Index|Races]] — ${results.races || 0} races`,
    `- [[Backgrounds/Background Index|Backgrounds]] — ${results.backgrounds || 0} backgrounds`,
    `- [[Conditions/Condition Index|Conditions]] — 15 conditions`,
  ];
  writeMarkdown(OBSIDIAN_BASE, "Compendium Index", masterIndex.join("\n"));

  console.log("\n=============================================");
  console.log("CAMPAIGN-SHARED EXTRACTION COMPLETE");
  console.log(`Output: ${OBSIDIAN_BASE}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
