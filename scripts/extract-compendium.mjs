#!/usr/bin/env node
/**
 * D&D Beyond Compendium Extractor
 * Pulls all available D&D content from D&D Beyond APIs and saves as markdown
 * in the Obsidian vault.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ============================================================================
// CONFIG
// ============================================================================

const OBSIDIAN_BASE = "/Users/alexworland/Library/Mobile Documents/iCloud~md~obsidian/Documents/AlexObsidian/DnD/Compendium";
const CONFIG_PATH = join(process.env.HOME, ".dndbeyond-mcp/config.json");

const DDB_CHARACTER_SERVICE = "https://character-service.dndbeyond.com";
const DDB_MONSTER_SERVICE = "https://monster-service.dndbeyond.com";
const DDB_WATERDEEP = "https://www.dndbeyond.com";

const RATE_LIMIT_MS = 600; // ~1.7 req/s to stay under 2 req/s limit
let lastRequestTime = 0;

// ============================================================================
// AUTH
// ============================================================================

function loadConfig() {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

async function getCobaltToken(config) {
  const cookieStr = config.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await fetch("https://auth-service.dndbeyond.com/v1/cobalt-token", {
    method: "POST",
    headers: {
      Cookie: cookieStr,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Cobalt token failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchApi(url, token, config, raw = false) {
  await rateLimit();

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // Add cookies for www.dndbeyond.com
  if (url.includes("www.dndbeyond.com")) {
    headers.Cookie = config.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 429) {
      console.warn(`  Rate limited on ${url}, waiting 5s...`);
      await new Promise((r) => setTimeout(r, 5000));
      return fetchApi(url, token, config, raw);
    }
    throw new Error(`API ${res.status}: ${url}`);
  }

  const json = await res.json();
  if (raw) return json;

  // Unwrap envelopes
  if (json && typeof json === "object" && "data" in json) {
    if ("success" in json && json.success) return json.data;
    if ("status" in json && json.status === "success") return json.data;
  }
  return json;
}

// ============================================================================
// FILE HELPERS
// ============================================================================

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sanitizeFilename(name) {
  return name
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function writeMarkdown(dir, filename, content) {
  ensureDir(dir);
  const safeName = sanitizeFilename(filename);
  writeFileSync(join(dir, `${safeName}.md`), content, "utf-8");
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

// ============================================================================
// CHARACTERS
// ============================================================================

async function extractCharacters(token, config) {
  console.log("\n=== CHARACTERS ===");
  const dir = join(OBSIDIAN_BASE, "Characters");

  // Try campaign-based character discovery
  let allCharIds = [];
  try {
    const campaigns = await fetchApi(
      `${DDB_WATERDEEP}/api/campaign/stt/active-campaigns`,
      token, config
    );
    if (Array.isArray(campaigns)) {
      console.log(`  Found ${campaigns.length} campaigns`);
      for (const campaign of campaigns) {
        try {
          const chars = await fetchApi(
            `${DDB_WATERDEEP}/api/campaign/stt/active-short-characters/${campaign.id}`,
            token, config
          );
          if (Array.isArray(chars)) {
            for (const c of chars) {
              allCharIds.push({ id: c.id || c.characterId, campaign: campaign.name });
            }
          }
        } catch (e) {
          console.warn(`  Failed to get chars for campaign ${campaign.name}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.warn(`  Campaign endpoint failed: ${e.message}`);
  }

  // Also try user-campaigns
  if (allCharIds.length === 0) {
    try {
      const campaigns = await fetchApi(
        `${DDB_WATERDEEP}/api/campaign/stt/user-campaigns`,
        token, config
      );
      if (Array.isArray(campaigns)) {
        console.log(`  Found ${campaigns.length} user-campaigns`);
        for (const campaign of campaigns) {
          try {
            const chars = await fetchApi(
              `${DDB_WATERDEEP}/api/campaign/stt/active-short-characters/${campaign.id}`,
              token, config
            );
            if (Array.isArray(chars)) {
              for (const c of chars) {
                allCharIds.push({ id: c.id || c.characterId, campaign: campaign.name });
              }
            }
          } catch (e) {
            console.warn(`  Failed chars for campaign ${campaign.name}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.warn(`  User-campaigns endpoint also failed: ${e.message}`);
    }
  }

  // Also try the character list endpoint with userId
  const userIdCookie = config.cookies.find(c => c.name === "User.ID");
  if (userIdCookie) {
    try {
      const charList = await fetchApi(
        `${DDB_CHARACTER_SERVICE}/character/v5/characters/list?userId=${userIdCookie.value}`,
        token, config
      );
      if (Array.isArray(charList)) {
        console.log(`  Found ${charList.length} characters from character-service`);
        for (const c of charList) {
          const id = c.id || c.characterId;
          if (id && !allCharIds.some(x => x.id === id)) {
            allCharIds.push({ id, campaign: c.campaignName || "Unknown" });
          }
        }
      }
    } catch (e) {
      console.warn(`  Character list endpoint failed: ${e.message}`);
    }
  }

  console.log(`  Total unique characters found: ${allCharIds.length}`);

  // Fetch full data for each character
  const characters = [];
  for (const { id, campaign } of allCharIds) {
    try {
      const char = await fetchApi(
        `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}?includeCustomItems=true`,
        token, config
      );
      characters.push({ ...char, _campaignName: campaign });
      console.log(`  Fetched: ${char.name} (${campaign})`);
    } catch (e) {
      console.warn(`  Failed to fetch character ${id}: ${e.message}`);
    }
  }

  // Write character sheets
  for (const char of characters) {
    const md = formatCharacterMarkdown(char);
    writeMarkdown(dir, char.name, md);
  }

  console.log(`  Wrote ${characters.length} character files`);
  return characters;
}

function formatCharacterMarkdown(char) {
  const ABILITY_NAMES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
  const level = char.classes?.reduce((sum, c) => sum + c.level, 0) || 1;
  const profBonus = Math.ceil(level / 4) + 1;

  const lines = [];
  lines.push(`# ${char.name}`);
  lines.push("");
  lines.push("## Overview");
  lines.push(`- **Race:** ${char.race?.fullName || "Unknown"}`);
  lines.push(`- **Class:** ${(char.classes || []).map(c => {
    const sub = c.subclassDefinition?.name ? ` (${c.subclassDefinition.name})` : "";
    return `${c.definition.name}${sub} ${c.level}`;
  }).join(" / ")}`);
  lines.push(`- **Level:** ${level}`);
  lines.push(`- **Background:** ${char.background?.definition?.name || "None"}`);
  lines.push(`- **Proficiency Bonus:** +${profBonus}`);
  if (char.campaign) lines.push(`- **Campaign:** ${char._campaignName || char.campaign.name}`);

  // Ability Scores
  lines.push("");
  lines.push("## Ability Scores");
  lines.push("| Ability | Score | Modifier |");
  lines.push("|---------|-------|----------|");
  for (let i = 0; i < 6; i++) {
    const id = i + 1;
    const base = char.stats?.find(s => s.id === id)?.value || 10;
    const bonus = char.bonusStats?.find(s => s.id === id)?.value || 0;
    const override = char.overrideStats?.find(s => s.id === id)?.value;
    const score = override ?? (base + bonus);
    const mod = Math.floor((score - 10) / 2);
    const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
    lines.push(`| ${ABILITY_NAMES[i]} | ${score} | ${modStr} |`);
  }

  // HP
  lines.push("");
  lines.push("## Combat");
  const maxHp = char.baseHitPoints + (char.bonusHitPoints || 0);
  const currentHp = maxHp - (char.removedHitPoints || 0);
  lines.push(`- **HP:** ${currentHp}/${maxHp}${char.temporaryHitPoints ? ` (+${char.temporaryHitPoints} temp)` : ""}`);

  // Spells
  const allSpells = [
    ...(char.spells?.class || []),
    ...(char.spells?.race || []),
    ...(char.spells?.background || []),
    ...(char.spells?.item || []),
    ...(char.spells?.feat || []),
  ];
  if (allSpells.length > 0) {
    lines.push("");
    lines.push("## Spells");
    const prepared = allSpells.filter(s => s.prepared || s.alwaysPrepared);
    const byLevel = {};
    for (const s of prepared) {
      const lvl = s.definition.level;
      if (!byLevel[lvl]) byLevel[lvl] = [];
      byLevel[lvl].push(s.definition.name);
    }
    for (const [lvl, spells] of Object.entries(byLevel).sort(([a], [b]) => a - b)) {
      const label = lvl === "0" ? "Cantrips" : `Level ${lvl}`;
      lines.push(`- **${label}:** ${spells.sort().join(", ")}`);
    }
  }

  // Inventory
  const equipped = (char.inventory || []).filter(i => i.equipped);
  if (equipped.length > 0) {
    lines.push("");
    lines.push("## Equipped Items");
    for (const item of equipped) {
      const qty = item.quantity > 1 ? ` (x${item.quantity})` : "";
      lines.push(`- ${item.definition.name}${qty}`);
    }
  }

  // Feats
  if (char.feats?.length > 0) {
    lines.push("");
    lines.push("## Feats");
    for (const feat of char.feats) {
      lines.push(`- **${feat.definition.name}**`);
    }
  }

  // Class Features
  const features = [];
  for (const cls of char.classes || []) {
    for (const f of cls.classFeatures || []) {
      const name = f.definition?.name || f.name;
      const lvl = f.definition?.requiredLevel || f.requiredLevel;
      if (lvl <= cls.level && name) {
        features.push({ name, className: cls.definition.name, level: lvl });
      }
    }
    if (cls.subclassDefinition?.classFeatures) {
      for (const f of cls.subclassDefinition.classFeatures) {
        const name = f.definition?.name || f.name;
        const lvl = f.definition?.requiredLevel || f.requiredLevel;
        if (lvl <= cls.level && name) {
          features.push({ name, className: `${cls.definition.name} (${cls.subclassDefinition.name})`, level: lvl });
        }
      }
    }
  }
  if (features.length > 0) {
    lines.push("");
    lines.push("## Class Features");
    for (const f of features) {
      lines.push(`- **${f.name}** (${f.className}, Level ${f.level})`);
    }
  }

  // Traits
  if (char.traits) {
    const traitLines = [];
    if (char.traits.personalityTraits) traitLines.push(`- **Personality:** ${char.traits.personalityTraits}`);
    if (char.traits.ideals) traitLines.push(`- **Ideals:** ${char.traits.ideals}`);
    if (char.traits.bonds) traitLines.push(`- **Bonds:** ${char.traits.bonds}`);
    if (char.traits.flaws) traitLines.push(`- **Flaws:** ${char.traits.flaws}`);
    if (traitLines.length > 0) {
      lines.push("");
      lines.push("## Traits");
      lines.push(...traitLines);
    }
  }

  // Notes
  if (char.notes) {
    const noteLines = [];
    if (char.notes.backstory) noteLines.push(`### Backstory\n${char.notes.backstory}`);
    if (char.notes.allies) noteLines.push(`### Allies\n${char.notes.allies}`);
    if (char.notes.organizations) noteLines.push(`### Organizations\n${char.notes.organizations}`);
    if (char.notes.otherNotes) noteLines.push(`### Other Notes\n${char.notes.otherNotes}`);
    if (noteLines.length > 0) {
      lines.push("");
      lines.push("## Notes");
      lines.push(...noteLines);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// SPELLS
// ============================================================================

async function extractSpells(token, config) {
  console.log("\n=== SPELLS ===");
  const baseDir = join(OBSIDIAN_BASE, "Spells");

  const CASTING_CLASSES = [1, 2, 3, 4, 5, 6, 7, 8]; // Bard through Wizard
  const allSpells = new Map();

  for (const classId of CASTING_CLASSES) {
    // Cantrips
    try {
      const cantrips = await fetchApi(
        `${DDB_CHARACTER_SERVICE}/character/v5/game-data/always-known-spells?classId=${classId}&classLevel=1&sharingSetting=2`,
        token, config
      );
      if (Array.isArray(cantrips)) {
        for (const s of cantrips) {
          if (s.definition?.name && !allSpells.has(s.definition.name)) {
            allSpells.set(s.definition.name, s);
          }
        }
      }
    } catch (e) {
      console.warn(`  Failed cantrips for class ${classId}: ${e.message}`);
    }

    // Higher levels
    try {
      const spells = await fetchApi(
        `${DDB_CHARACTER_SERVICE}/character/v5/game-data/always-known-spells?classId=${classId}&classLevel=20&sharingSetting=2`,
        token, config
      );
      if (Array.isArray(spells)) {
        for (const s of spells) {
          if (s.definition?.name && !allSpells.has(s.definition.name)) {
            allSpells.set(s.definition.name, s);
          }
        }
      }
    } catch (e) {
      console.warn(`  Failed spells for class ${classId}: ${e.message}`);
    }

    // Always prepared cantrips
    try {
      const prepared = await fetchApi(
        `${DDB_CHARACTER_SERVICE}/character/v5/game-data/always-prepared-spells?classId=${classId}&classLevel=1&sharingSetting=2`,
        token, config
      );
      if (Array.isArray(prepared)) {
        for (const s of prepared) {
          if (s.definition?.name && !allSpells.has(s.definition.name)) {
            allSpells.set(s.definition.name, s);
          }
        }
      }
    } catch (e) { /* ignore */ }

    // Always prepared higher levels
    try {
      const prepared = await fetchApi(
        `${DDB_CHARACTER_SERVICE}/character/v5/game-data/always-prepared-spells?classId=${classId}&classLevel=20&sharingSetting=2`,
        token, config
      );
      if (Array.isArray(prepared)) {
        for (const s of prepared) {
          if (s.definition?.name && !allSpells.has(s.definition.name)) {
            allSpells.set(s.definition.name, s);
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  console.log(`  Loaded ${allSpells.size} unique spells`);

  const ACTIVATION_TYPES = { 0: "No Action", 1: "Action", 2: "No Action", 3: "Bonus Action", 4: "Reaction", 5: "Special", 6: "Minute", 7: "Hour", 8: "Special" };
  const COMPONENT_MAP = { 1: "V", 2: "S", 3: "M" };

  // Sort by level then name
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
      `| **Components** | ${components || "None"}${materialNote} |`,
      `| **Duration** | ${duration} |`,
      tags.length ? `| **Tags** | ${tags.join(", ")} |` : null,
      "",
      stripHtml(d.description),
      d.atHigherLevels?.higherLevelDefinitions?.length
        ? `\n## At Higher Levels\n${d.atHigherLevels.higherLevelDefinitions.map(h => stripHtml(h.description || "")).join("\n")}`
        : null,
    ].filter(Boolean).join("\n");

    writeMarkdown(join(baseDir, levelDir), d.name, md);
  }

  // Write index
  const indexLines = ["# Spell Compendium", "", `Total: ${allSpells.size} spells`, ""];
  for (let lvl = 0; lvl <= 9; lvl++) {
    const levelSpells = sorted.filter(s => s.definition.level === lvl);
    if (levelSpells.length === 0) continue;
    const label = lvl === 0 ? "Cantrips" : `Level ${lvl}`;
    indexLines.push(`## ${label} (${levelSpells.length})`);
    for (const s of levelSpells) {
      const dir = lvl === 0 ? "Cantrips" : `Level ${lvl}`;
      indexLines.push(`- [[${dir}/${s.definition.name}|${s.definition.name}]] — ${s.definition.school}`);
    }
    indexLines.push("");
  }
  writeMarkdown(baseDir, "Spell Index", indexLines.join("\n"));

  console.log(`  Wrote ${allSpells.size} spell files + index`);
  return allSpells.size;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ============================================================================
// MONSTERS
// ============================================================================

async function extractMonsters(token, config) {
  console.log("\n=== MONSTERS ===");
  const baseDir = join(OBSIDIAN_BASE, "Monsters");

  // First get game config for lookup tables
  const gameConfig = await fetchApi(`${DDB_WATERDEEP}/api/config/json`, token, config, true);
  const crMap = new Map(gameConfig.challengeRatings?.map(cr => [cr.id, cr]) || []);
  const typeMap = new Map(gameConfig.monsterTypes?.map(t => [t.id, t.name]) || []);
  const alignMap = new Map(gameConfig.alignments?.map(a => [a.id, a.name]) || []);
  const senseMap = new Map(gameConfig.senses?.map(s => [s.id, s.name]) || []);

  const SIZE_MAP = { 2: "Tiny", 3: "Small", 4: "Medium", 5: "Large", 6: "Huge", 7: "Gargantuan" };
  const STAT_NAMES = { 1: "STR", 2: "DEX", 3: "CON", 4: "INT", 5: "WIS", 6: "CHA" };
  const MOVEMENT_NAMES = { 1: "walk", 2: "burrow", 3: "climb", 4: "fly", 5: "swim" };

  // Paginate through all monsters
  let allMonsters = [];
  let page = 0;
  let total = 0;
  const TAKE = 20;

  console.log("  Fetching monster list (paginated)...");
  while (true) {
    try {
      const response = await fetchApi(
        `${DDB_MONSTER_SERVICE}/v1/Monster?search=&skip=${page * TAKE}&take=${TAKE}`,
        token, config, true
      );
      total = response.pagination?.total || 0;
      if (!response.data?.length) break;
      allMonsters.push(...response.data);
      process.stdout.write(`\r  Fetched ${allMonsters.length}/${total} monsters...`);
      if (allMonsters.length >= total) break;
      page++;
    } catch (e) {
      console.warn(`\n  Error at page ${page}: ${e.message}`);
      break;
    }
  }
  console.log(`\n  Total monsters fetched: ${allMonsters.length}`);

  // Now fetch full details for each monster and write markdown
  let written = 0;
  let restricted = 0;

  for (let i = 0; i < allMonsters.length; i++) {
    const summary = allMonsters[i];
    process.stdout.write(`\r  Processing ${i + 1}/${allMonsters.length}: ${summary.name}...`);

    try {
      const detailResponse = await fetchApi(
        `${DDB_MONSTER_SERVICE}/v1/Monster/${summary.id}`,
        token, config, true
      );
      const m = detailResponse.data;
      if (!m) continue;

      // Check if content is restricted (accessType 4 with no stats)
      const isRestricted = detailResponse.accessType === 4 && (!m.stats || m.stats.length === 0);

      const cr = crMap.get(m.challengeRatingId);
      const crStr = cr ? `${cr.value}` : "?";
      const xp = cr?.xp || 0;
      const typeName = typeMap.get(m.typeId) || "Unknown";
      const sizeName = SIZE_MAP[m.sizeId] || "Unknown";
      const alignment = alignMap.get(m.alignmentId) || "Unaligned";

      const lines = [];
      lines.push(`# ${m.name}`);
      lines.push(`*${sizeName} ${typeName}, ${alignment}*`);
      lines.push("");

      if (isRestricted) {
        lines.push(`> [!warning] Restricted Content`);
        lines.push(`> This monster's full stat block requires content ownership on D&D Beyond.`);
        lines.push("");
        lines.push(`- **Challenge:** ${crStr} (${xp.toLocaleString()} XP)`);
        lines.push(`- **AC:** ${m.armorClass}`);
        lines.push(`- **HP:** ${m.averageHitPoints}`);
        restricted++;
      } else {
        lines.push(`| Property | Value |`);
        lines.push(`|----------|-------|`);
        lines.push(`| **Armor Class** | ${m.armorClass}${m.armorClassDescription ? " " + m.armorClassDescription.trim() : ""} |`);
        lines.push(`| **Hit Points** | ${m.averageHitPoints}${m.hitPointDice?.diceString ? " (" + m.hitPointDice.diceString + ")" : ""} |`);

        if (m.movements?.length) {
          const speeds = m.movements.map(mv => {
            const name = MOVEMENT_NAMES[mv.movementId] || "walk";
            return name === "walk" ? `${mv.speed} ft.` : `${name} ${mv.speed} ft.`;
          });
          lines.push(`| **Speed** | ${speeds.join(", ")} |`);
        }
        lines.push(`| **Challenge** | ${crStr} (${xp.toLocaleString()} XP) |`);
        lines.push("");

        // Ability scores
        if (m.stats?.length) {
          lines.push("## Ability Scores");
          lines.push("| STR | DEX | CON | INT | WIS | CHA |");
          lines.push("|-----|-----|-----|-----|-----|-----|");
          const statValues = {};
          for (const s of m.stats) statValues[s.statId] = s.value;
          const row = [1, 2, 3, 4, 5, 6].map(id => {
            const v = statValues[id] || 10;
            const mod = Math.floor((v - 10) / 2);
            return `${v} (${mod >= 0 ? "+" : ""}${mod})`;
          });
          lines.push(`| ${row.join(" | ")} |`);
          lines.push("");
        }

        // Saving throws
        if (m.savingThrows?.length) {
          const saves = m.savingThrows.map(s => `${STAT_NAMES[s.statId]} +${s.bonusModifier}`);
          lines.push(`**Saving Throws:** ${saves.join(", ")}`);
        }

        if (m.skillsHtml) lines.push(`**Skills:** ${stripHtml(m.skillsHtml)}`);

        // Senses
        if (m.senses?.length) {
          const senseStrs = m.senses.map(s => `${senseMap.get(s.senseId) || "Unknown"} ${s.notes}`);
          senseStrs.push(`passive Perception ${m.passivePerception}`);
          lines.push(`**Senses:** ${senseStrs.join(", ")}`);
        } else {
          lines.push(`**Senses:** passive Perception ${m.passivePerception}`);
        }

        if (m.languageDescription) {
          lines.push(`**Languages:** ${m.languageDescription}${m.languageNote ? " " + m.languageNote : ""}`);
        }

        // Traits & Actions
        if (m.specialTraitsDescription) {
          lines.push("");
          lines.push("## Traits");
          lines.push(stripHtml(m.specialTraitsDescription));
        }
        if (m.actionsDescription) {
          lines.push("");
          lines.push("## Actions");
          lines.push(stripHtml(m.actionsDescription));
        }
        if (m.bonusActionsDescription) {
          lines.push("");
          lines.push("## Bonus Actions");
          lines.push(stripHtml(m.bonusActionsDescription));
        }
        if (m.reactionsDescription) {
          lines.push("");
          lines.push("## Reactions");
          lines.push(stripHtml(m.reactionsDescription));
        }
        if (m.legendaryActionsDescription) {
          lines.push("");
          lines.push("## Legendary Actions");
          lines.push(stripHtml(m.legendaryActionsDescription));
        }
        if (m.mythicActionsDescription) {
          lines.push("");
          lines.push("## Mythic Actions");
          lines.push(stripHtml(m.mythicActionsDescription));
        }
      }

      // Organize by type
      const typeDir = join(baseDir, sanitizeFilename(typeName));
      writeMarkdown(typeDir, m.name, lines.join("\n"));
      written++;
    } catch (e) {
      // Skip failed monsters
    }
  }

  // Write index
  const indexLines = ["# Monster Compendium", "", `Total: ${allMonsters.length} monsters (${restricted} restricted)`, ""];
  const byType = {};
  for (const m of allMonsters) {
    const typeName = typeMap.get(m.typeId) || "Unknown";
    if (!byType[typeName]) byType[typeName] = [];
    const cr = crMap.get(m.challengeRatingId);
    byType[typeName].push({ name: m.name, cr: cr?.value ?? "?", typeName });
  }
  for (const [type, monsters] of Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = monsters.sort((a, b) => a.name.localeCompare(b.name));
    indexLines.push(`## ${type} (${sorted.length})`);
    for (const m of sorted) {
      indexLines.push(`- [[${sanitizeFilename(type)}/${m.name}|${m.name}]] — CR ${m.cr}`);
    }
    indexLines.push("");
  }
  writeMarkdown(baseDir, "Monster Index", indexLines.join("\n"));

  console.log(`\n  Wrote ${written} monster files + index (${restricted} restricted)`);
  return written;
}

// ============================================================================
// ITEMS
// ============================================================================

async function extractItems(token, config) {
  console.log("\n=== ITEMS ===");
  const baseDir = join(OBSIDIAN_BASE, "Items");

  const items = await fetchApi(
    `${DDB_CHARACTER_SERVICE}/character/v5/game-data/items?sharingSetting=2`,
    token, config
  );

  if (!Array.isArray(items)) {
    console.warn("  No items returned");
    return 0;
  }

  console.log(`  Loaded ${items.length} items`);

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
      item.weight ? `**Weight:** ${item.weight} lb.` : null,
      item.cost ? `**Cost:** ${item.cost} gp` : null,
      item.armorClass ? `**AC:** ${item.armorClass}` : null,
      item.damage?.diceString ? `**Damage:** ${item.damage.diceString}` : null,
      props,
      "",
      stripHtml(item.description || item.snippet || "No description available."),
    ].filter(x => x !== null).join("\n");

    writeMarkdown(join(baseDir, typeDir), item.name, md);
  }

  // Write index grouped by type and rarity
  const byType = {};
  for (const item of items) {
    const type = item.filterType || item.type || "Other";
    if (!byType[type]) byType[type] = [];
    byType[type].push(item);
  }

  const indexLines = ["# Item Compendium", "", `Total: ${items.length} items`, ""];
  for (const [type, typeItems] of Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = typeItems.sort((a, b) => a.name.localeCompare(b.name));
    indexLines.push(`## ${type} (${sorted.length})`);
    for (const item of sorted) {
      const dir = sanitizeFilename(type);
      indexLines.push(`- [[${dir}/${sanitizeFilename(item.name)}|${item.name}]] — ${item.rarity || "Common"}`);
    }
    indexLines.push("");
  }
  writeMarkdown(baseDir, "Item Index", indexLines.join("\n"));

  console.log(`  Wrote ${items.length} item files + index`);
  return items.length;
}

// ============================================================================
// CLASSES
// ============================================================================

async function extractClasses(token, config) {
  console.log("\n=== CLASSES ===");
  const baseDir = join(OBSIDIAN_BASE, "Classes");

  const classes = await fetchApi(
    `${DDB_CHARACTER_SERVICE}/character/v5/game-data/classes`,
    token, config
  );

  if (!Array.isArray(classes)) {
    console.warn("  No classes returned");
    return 0;
  }

  console.log(`  Loaded ${classes.length} classes`);

  const STAT_NAMES = { 1: "STR", 2: "DEX", 3: "CON", 4: "INT", 5: "WIS", 6: "CHA" };

  for (const cls of classes) {
    const spellcasting = cls.spellCastingAbilityId
      ? `**Spellcasting Ability:** ${STAT_NAMES[cls.spellCastingAbilityId] || "Unknown"}\n`
      : "";

    const lines = [
      `# ${cls.name}`,
      `**Hit Die:** d${cls.hitDice}`,
      spellcasting,
      stripHtml(cls.description || ""),
    ];

    // Subclasses
    if (cls.subclasses?.length) {
      lines.push("");
      lines.push("## Subclasses");
      for (const sub of cls.subclasses) {
        lines.push(`### ${sub.name}`);
        lines.push(stripHtml(sub.description || ""));
        lines.push("");
      }
    }

    // Class features
    if (cls.classFeatures?.length) {
      lines.push("");
      lines.push("## Class Features");
      const sorted = [...cls.classFeatures].sort((a, b) => a.level - b.level);
      for (const f of sorted) {
        lines.push(`### Level ${f.level}: ${f.name}`);
        lines.push(stripHtml(f.description || ""));
        lines.push("");
      }
    }

    writeMarkdown(baseDir, cls.name, lines.join("\n"));
  }

  // Write index
  const indexLines = ["# Class Compendium", "", `Total: ${classes.length} classes`, ""];
  for (const cls of classes.sort((a, b) => a.name.localeCompare(b.name))) {
    const hitDie = cls.hitDice ? `d${cls.hitDice}` : "?";
    indexLines.push(`- [[${cls.name}]] — Hit Die: ${hitDie}`);
  }
  writeMarkdown(baseDir, "Class Index", indexLines.join("\n"));

  console.log(`  Wrote ${classes.length} class files + index`);
  return classes.length;
}

// ============================================================================
// FEATS
// ============================================================================

async function extractFeats(token, config) {
  console.log("\n=== FEATS ===");
  const baseDir = join(OBSIDIAN_BASE, "Feats");

  const feats = await fetchApi(
    `${DDB_CHARACTER_SERVICE}/character/v5/game-data/feats`,
    token, config
  );

  if (!Array.isArray(feats)) {
    console.warn("  No feats returned");
    return 0;
  }

  console.log(`  Loaded ${feats.length} feats`);

  // Deduplicate by name (some feats appear multiple times)
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
      stripHtml(feat.description || feat.snippet || "No description available."),
    ].join("\n");

    writeMarkdown(baseDir, feat.name, md);
  }

  // Write index
  const indexLines = ["# Feat Compendium", "", `Total: ${uniqueFeats.length} feats`, ""];
  for (const feat of uniqueFeats.sort((a, b) => a.name.localeCompare(b.name))) {
    const prereq = feat.prerequisite ? ` (${feat.prerequisite})` : "";
    indexLines.push(`- [[${feat.name}]]${prereq}`);
  }
  writeMarkdown(baseDir, "Feat Index", indexLines.join("\n"));

  console.log(`  Wrote ${uniqueFeats.length} feat files + index`);
  return uniqueFeats.length;
}

// ============================================================================
// RACES
// ============================================================================

async function extractRaces(token, config) {
  console.log("\n=== RACES ===");
  const baseDir = join(OBSIDIAN_BASE, "Races");

  const races = await fetchApi(
    `${DDB_CHARACTER_SERVICE}/character/v5/game-data/races`,
    token, config
  );

  if (!Array.isArray(races)) {
    console.warn("  No races returned");
    return 0;
  }

  console.log(`  Loaded ${races.length} races`);

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
// BACKGROUNDS
// ============================================================================

async function extractBackgrounds(token, config) {
  console.log("\n=== BACKGROUNDS ===");
  const baseDir = join(OBSIDIAN_BASE, "Backgrounds");

  const backgrounds = await fetchApi(
    `${DDB_CHARACTER_SERVICE}/character/v5/game-data/backgrounds`,
    token, config
  );

  if (!Array.isArray(backgrounds)) {
    console.warn("  No backgrounds returned");
    return 0;
  }

  console.log(`  Loaded ${backgrounds.length} backgrounds`);

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
// CONDITIONS
// ============================================================================

function extractConditions() {
  console.log("\n=== CONDITIONS ===");
  const baseDir = join(OBSIDIAN_BASE, "Conditions");

  const CONDITIONS = {
    Blinded: { description: "A blinded creature can't see and automatically fails any ability check that requires sight.", effects: ["Attack rolls against the creature have advantage.", "The creature's attack rolls have disadvantage."] },
    Charmed: { description: "A charmed creature can't attack the charmer or target the charmer with harmful abilities or magical effects.", effects: ["The charmer has advantage on any ability check to interact socially with the creature."] },
    Deafened: { description: "A deafened creature can't hear and automatically fails any ability check that requires hearing.", effects: [] },
    Exhaustion: { description: "Exhaustion is measured in six levels.", effects: ["Level 1: Disadvantage on ability checks", "Level 2: Speed halved", "Level 3: Disadvantage on attack rolls and saving throws", "Level 4: Hit point maximum halved", "Level 5: Speed reduced to 0", "Level 6: Death"] },
    Frightened: { description: "A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.", effects: ["The creature can't willingly move closer to the source of its fear."] },
    Grappled: { description: "A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed.", effects: ["The condition ends if the grappler is incapacitated.", "The condition also ends if an effect removes the grappled creature from the reach of the grappler."] },
    Incapacitated: { description: "An incapacitated creature can't take actions or reactions.", effects: [] },
    Invisible: { description: "An invisible creature is impossible to see without the aid of magic or a special sense.", effects: ["The creature is heavily obscured for the purpose of hiding.", "Attack rolls against the creature have disadvantage.", "The creature's attack rolls have advantage."] },
    Paralyzed: { description: "A paralyzed creature is incapacitated and can't move or speak.", effects: ["Automatically fails STR and DEX saving throws.", "Attack rolls against have advantage.", "Melee hits within 5 feet are critical hits."] },
    Petrified: { description: "A petrified creature is transformed into a solid inanimate substance.", effects: ["Weight increases by x10, ceases aging.", "Incapacitated, can't move or speak.", "Attack rolls against have advantage.", "Auto-fails STR and DEX saves.", "Resistance to all damage.", "Immune to poison and disease."] },
    Poisoned: { description: "A poisoned creature has disadvantage on attack rolls and ability checks.", effects: [] },
    Prone: { description: "A prone creature's only movement option is to crawl, unless it stands up.", effects: ["Disadvantage on attack rolls.", "Attacks within 5 ft have advantage; otherwise disadvantage."] },
    Restrained: { description: "A restrained creature's speed becomes 0.", effects: ["Attack rolls against have advantage.", "Creature's attack rolls have disadvantage.", "Disadvantage on DEX saving throws."] },
    Stunned: { description: "A stunned creature is incapacitated, can't move, and can speak only falteringly.", effects: ["Auto-fails STR and DEX saves.", "Attack rolls against have advantage."] },
    Unconscious: { description: "An unconscious creature is incapacitated, can't move or speak, and is unaware of surroundings.", effects: ["Drops held items, falls prone.", "Auto-fails STR and DEX saves.", "Attack rolls against have advantage.", "Melee hits within 5 ft are critical hits."] },
  };

  for (const [name, data] of Object.entries(CONDITIONS)) {
    const lines = [`# ${name}`, "", data.description];
    if (data.effects.length) {
      lines.push("");
      for (const e of data.effects) lines.push(`- ${e}`);
    }
    writeMarkdown(baseDir, name, lines.join("\n"));
  }

  // Write index
  const indexLines = ["# Conditions Reference", ""];
  for (const name of Object.keys(CONDITIONS).sort()) {
    indexLines.push(`- [[${name}]]`);
  }
  writeMarkdown(baseDir, "Condition Index", indexLines.join("\n"));

  console.log(`  Wrote ${Object.keys(CONDITIONS).length} condition files + index`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("D&D Beyond Compendium Extractor");
  console.log("================================");
  console.log(`Output: ${OBSIDIAN_BASE}`);
  ensureDir(OBSIDIAN_BASE);

  const config = loadConfig();
  console.log("Loaded auth config");

  const token = await getCobaltToken(config);
  console.log("Got cobalt token");

  const results = {};

  // Extract everything
  try {
    results.characters = await extractCharacters(token, config);
  } catch (e) {
    console.error(`Characters failed: ${e.message}`);
  }

  try {
    results.spells = await extractSpells(token, config);
  } catch (e) {
    console.error(`Spells failed: ${e.message}`);
  }

  try {
    results.classes = await extractClasses(token, config);
  } catch (e) {
    console.error(`Classes failed: ${e.message}`);
  }

  try {
    results.feats = await extractFeats(token, config);
  } catch (e) {
    console.error(`Feats failed: ${e.message}`);
  }

  try {
    results.races = await extractRaces(token, config);
  } catch (e) {
    console.error(`Races failed: ${e.message}`);
  }

  try {
    results.backgrounds = await extractBackgrounds(token, config);
  } catch (e) {
    console.error(`Backgrounds failed: ${e.message}`);
  }

  try {
    extractConditions();
  } catch (e) {
    console.error(`Conditions failed: ${e.message}`);
  }

  try {
    results.items = await extractItems(token, config);
  } catch (e) {
    console.error(`Items failed: ${e.message}`);
  }

  try {
    results.monsters = await extractMonsters(token, config);
  } catch (e) {
    console.error(`Monsters failed: ${e.message}`);
  }

  // Write master index
  const masterIndex = [
    "# D&D Compendium",
    "",
    `*Extracted from D&D Beyond on ${new Date().toISOString().split("T")[0]}*`,
    "",
    "## Sections",
    `- [[Characters/]] — Your characters`,
    `- [[Spells/Spell Index|Spells]] — ${results.spells || 0} spells`,
    `- [[Monsters/Monster Index|Monsters]] — ${results.monsters || 0} monsters`,
    `- [[Items/Item Index|Items]] — ${results.items || 0} items`,
    `- [[Classes/Class Index|Classes]] — ${results.classes || 0} classes`,
    `- [[Feats/Feat Index|Feats]] — ${results.feats || 0} feats`,
    `- [[Races/Race Index|Races]] — ${results.races || 0} races`,
    `- [[Backgrounds/Background Index|Backgrounds]] — ${results.backgrounds || 0} backgrounds`,
    `- [[Conditions/Condition Index|Conditions]] — 15 conditions`,
  ];
  writeMarkdown(OBSIDIAN_BASE, "Compendium Index", masterIndex.join("\n"));

  console.log("\n================================");
  console.log("EXTRACTION COMPLETE");
  console.log(`Output: ${OBSIDIAN_BASE}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
