#!/usr/bin/env node
/**
 * Populates restricted monster stat blocks from 5etools and Open5e data.
 *
 * 1. Downloads all 5etools bestiary JSON files from GitHub
 * 2. Fetches supplementary data from Open5e API (Kobold Press, etc.)
 * 3. Matches against restricted Obsidian monster files by name
 * 4. Overwrites restricted files with full stat blocks in Obsidian markdown format
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { join, dirname, relative } from "path";

// ============================================================================
// CONFIG
// ============================================================================

const OBSIDIAN_BASE = "/Users/alexworland/Library/Mobile Documents/iCloud~md~obsidian/Documents/AlexObsidian/DnD/Compendium";
const MONSTERS_DIR = join(OBSIDIAN_BASE, "Monsters");
const TOOLS_CACHE_DIR = "/tmp/5etools-bestiary";
const HOMEBREW_CACHE_DIR = "/tmp/5etools-homebrew";

const SIZE_MAP = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };

const ALIGNMENT_MAP = {
  L: "Lawful", N: "Neutral", C: "Chaotic",
  G: "Good", E: "Evil",
  U: "Unaligned", A: "Any alignment",
};

const STAT_ORDER = ["str", "dex", "con", "int", "wis", "cha"];
const STAT_LABELS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

// ============================================================================
// 5ETOOLS TAG PARSER
// ============================================================================

/** Strip 5etools {@tag ...} markup to plain text */
function stripTags(text) {
  if (typeof text !== "string") return String(text ?? "");
  return text
    .replace(/\{@atk\s+mw\}/g, "*Melee Weapon Attack:*")
    .replace(/\{@atk\s+rw\}/g, "*Ranged Weapon Attack:*")
    .replace(/\{@atk\s+mw,rw\}/g, "*Melee or Ranged Weapon Attack:*")
    .replace(/\{@atk\s+rw,mw\}/g, "*Melee or Ranged Weapon Attack:*")
    .replace(/\{@atk\s+ms\}/g, "*Melee Spell Attack:*")
    .replace(/\{@atk\s+rs\}/g, "*Ranged Spell Attack:*")
    .replace(/\{@atk\s+ms,rs\}/g, "*Melee or Ranged Spell Attack:*")
    .replace(/\{@h\}/g, "*Hit:* ")
    .replace(/\{@hit\s+(\d+)\}/g, "+$1")
    .replace(/\{@dc\s+(\d+)\}/g, "DC $1")
    .replace(/\{@damage\s+([^}]+)\}/g, "$1")
    .replace(/\{@dice\s+([^}]+)\}/g, "$1")
    .replace(/\{@recharge\s*(\d*)\}/g, (_, n) => n ? `(Recharge ${n}-6)` : "(Recharge)")
    .replace(/\{@recharge\}/g, "(Recharge 6)")
    .replace(/\{@condition\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@spell\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@item\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@creature\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@skill\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@sense\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@action\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@note\s+([^}]+)\}/g, "$1")
    .replace(/\{@b\s+([^}]+)\}/g, "**$1**")
    .replace(/\{@i\s+([^}]+)\}/g, "*$1*")
    .replace(/\{@filter\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@classFeature\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@optfeature\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@quickref\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@hazard\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@status\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@chance\s+(\d+)\}/g, "$1%")
    .replace(/\{@scaledamage\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@scaledice\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@book\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    .replace(/\{@area\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
    // Catch any remaining tags
    .replace(/\{@\w+\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1");
}

/** Recursively convert 5etools entry objects to markdown text */
function entriesToMarkdown(entries, indent = 0) {
  if (!entries) return "";
  const parts = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      parts.push(stripTags(entry));
    } else if (entry.type === "list") {
      for (const item of entry.items || []) {
        if (typeof item === "string") {
          parts.push(`- ${stripTags(item)}`);
        } else if (item.type === "item" || item.type === "itemSub") {
          const name = item.name ? `**${stripTags(item.name)}** ` : "";
          const text = item.entry
            ? stripTags(item.entry)
            : item.entries
              ? entriesToMarkdown(item.entries)
              : "";
          parts.push(`- ${name}${text}`);
        } else {
          parts.push(`- ${entriesToMarkdown([item])}`);
        }
      }
    } else if (entry.type === "entries" || entry.type === "inset") {
      if (entry.name) parts.push(`\n**${stripTags(entry.name)}**`);
      if (entry.entries) parts.push(entriesToMarkdown(entry.entries));
    } else if (entry.type === "table") {
      // Render simple table
      if (entry.caption) parts.push(`\n*${stripTags(entry.caption)}*`);
      if (entry.colLabels) {
        parts.push(`| ${entry.colLabels.map(c => stripTags(c)).join(" | ")} |`);
        parts.push(`| ${entry.colLabels.map(() => "---").join(" | ")} |`);
      }
      for (const row of entry.rows || []) {
        const cells = row.map(c => {
          if (typeof c === "string") return stripTags(c);
          if (c?.type === "cell") return stripTags(c.entry || entriesToMarkdown(c.entries || []));
          return stripTags(String(c ?? ""));
        });
        parts.push(`| ${cells.join(" | ")} |`);
      }
    } else if (entry.entries) {
      parts.push(entriesToMarkdown(entry.entries));
    } else if (typeof entry === "object") {
      // Unknown type — try to extract text
      if (entry.entry) parts.push(stripTags(entry.entry));
    }
  }
  return parts.join("\n");
}

// ============================================================================
// OBSIDIAN FILE SCANNER
// ============================================================================

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.endsWith(".md") && entry !== "Monster Index.md") {
      results.push(full);
    }
  }
  return results;
}

function getRestrictedMonsters() {
  const allFiles = walkDir(MONSTERS_DIR);
  const restricted = new Map(); // name -> { filePath, typeName }
  for (const file of allFiles) {
    const content = readFileSync(file, "utf-8");
    if (!content.includes("Restricted Content")) continue;
    const lines = content.split("\n");
    const name = (lines[0] || "").replace(/^#\s*/, "").trim();
    const typeLine = (lines[1] || "").replace(/^\*|\*$/g, "").trim();
    const typeMatch = typeLine.match(/^\w+\s+(\w+)/);
    const typeName = typeMatch ? typeMatch[1] : "Unknown";
    restricted.set(name, { filePath: file, typeName });
  }
  return restricted;
}

// ============================================================================
// 5ETOOLS MONSTER -> MARKDOWN
// ============================================================================

function parseAlignment(alArr) {
  if (!alArr || !alArr.length) return "Unaligned";
  // Handle complex alignment objects
  if (typeof alArr[0] === "object") {
    if (alArr[0].special) return alArr[0].special;
    return "Unaligned";
  }
  if (alArr.length === 1) {
    if (alArr[0] === "U") return "Unaligned";
    if (alArr[0] === "A") return "Any alignment";
    return ALIGNMENT_MAP[alArr[0]] || alArr[0];
  }
  // Two-part alignment: [L, G] -> "Lawful Good"
  return alArr.map(a => ALIGNMENT_MAP[a] || a).join(" ");
}

function parseSize(sizeArr) {
  if (!sizeArr || !sizeArr.length) return "Medium";
  return sizeArr.map(s => SIZE_MAP[s] || s).join(" or ");
}

function parseType(type) {
  if (typeof type === "string") return type.charAt(0).toUpperCase() + type.slice(1);
  if (type?.type) {
    let result = type.type.charAt(0).toUpperCase() + type.type.slice(1);
    if (type.tags?.length) result += ` (${type.tags.join(", ")})`;
    if (type.swarmSize) result = `Swarm of ${SIZE_MAP[type.swarmSize] || type.swarmSize} ${result}s`;
    return result;
  }
  return "Unknown";
}

function parseCR(cr) {
  if (!cr) return "?";
  if (typeof cr === "string") return cr;
  if (cr.cr) return cr.cr;
  return "?";
}

function parseAC(acArr) {
  if (!acArr?.length) return "10";
  const ac = acArr[0];
  if (typeof ac === "number") return String(ac);
  if (ac.ac !== undefined) {
    const from = ac.from?.length ? ` (${ac.from.map(f => stripTags(f)).join(", ")})` : "";
    return `${ac.ac}${from}`;
  }
  return String(ac);
}

function parseSpeed(speed) {
  if (!speed) return "30 ft.";
  const parts = [];
  for (const [type, val] of Object.entries(speed)) {
    if (type === "canHover") continue;
    const num = typeof val === "number" ? val : val?.number || 0;
    const cond = typeof val === "object" && val?.condition ? ` ${val.condition}` : "";
    if (type === "walk") {
      parts.unshift(`${num} ft.${cond}`);
    } else {
      parts.push(`${type} ${num} ft.${cond}`);
    }
  }
  return parts.join(", ") || "0 ft.";
}

function crToXP(cr) {
  const xpMap = {
    "0": 0, "1/8": 25, "1/4": 50, "1/2": 100,
    "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
    "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
    "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
    "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
    "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000,
    "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
  };
  return xpMap[cr] ?? 0;
}

function toolsMonsterToMarkdown(m) {
  const size = parseSize(m.size);
  const type = parseType(m.type);
  const alignment = parseAlignment(m.alignment);
  const cr = parseCR(m.cr);
  const xp = crToXP(cr);

  const lines = [];
  lines.push(`# ${m.name}`);
  lines.push(`*${size} ${type}, ${alignment}*`);
  lines.push("");

  // Stats table
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| **Armor Class** | ${parseAC(m.ac)} |`);
  lines.push(`| **Hit Points** | ${m.hp?.average ?? 0}${m.hp?.formula ? ` (${m.hp.formula})` : ""} |`);
  lines.push(`| **Speed** | ${parseSpeed(m.speed)} |`);
  lines.push(`| **Challenge** | ${cr} (${xp.toLocaleString()} XP) |`);
  lines.push("");

  // Ability scores
  lines.push("## Ability Scores");
  lines.push("| STR | DEX | CON | INT | WIS | CHA |");
  lines.push("|-----|-----|-----|-----|-----|-----|");
  const row = STAT_ORDER.map(stat => {
    const v = m[stat] ?? 10;
    const mod = Math.floor((v - 10) / 2);
    return `${v} (${mod >= 0 ? "+" : ""}${mod})`;
  });
  lines.push(`| ${row.join(" | ")} |`);
  lines.push("");

  // Saving throws
  if (m.save) {
    const saves = Object.entries(m.save).map(([stat, bonus]) =>
      `${stat.toUpperCase()} ${bonus}`
    );
    lines.push(`**Saving Throws:** ${saves.join(", ")}`);
  }

  // Skills
  if (m.skill) {
    const skills = Object.entries(m.skill).map(([name, bonus]) =>
      `${name.charAt(0).toUpperCase() + name.slice(1)} ${bonus}`
    );
    lines.push(`**Skills:** ${skills.join(", ")}`);
  }

  // Damage resistances/immunities/vulnerabilities
  if (m.vulnerable?.length) lines.push(`**Damage Vulnerabilities:** ${formatDamageList(m.vulnerable)}`);
  if (m.resist?.length) lines.push(`**Damage Resistances:** ${formatDamageList(m.resist)}`);
  if (m.immune?.length) lines.push(`**Damage Immunities:** ${formatDamageList(m.immune)}`);
  if (m.conditionImmune?.length) {
    const conds = m.conditionImmune.map(c => typeof c === "string" ? c : c.conditionImmune || String(c));
    lines.push(`**Condition Immunities:** ${conds.join(", ")}`);
  }

  // Senses
  const senses = [...(m.senses || [])];
  senses.push(`passive Perception ${m.passive ?? 10}`);
  lines.push(`**Senses:** ${senses.join(", ")}`);

  // Languages
  if (m.languages?.length) {
    lines.push(`**Languages:** ${m.languages.join(", ")}`);
  } else {
    lines.push("**Languages:** —");
  }

  // Traits
  if (m.trait?.length) {
    lines.push("");
    lines.push("## Traits");
    for (const t of m.trait) {
      const name = stripTags(t.name);
      const desc = entriesToMarkdown(t.entries);
      lines.push(`***${name}.*** ${desc}`);
      lines.push("");
    }
  }

  // Spellcasting (sometimes in trait, sometimes separate)
  if (m.spellcasting?.length) {
    if (!m.trait?.length) {
      lines.push("");
      lines.push("## Traits");
    }
    for (const sc of m.spellcasting) {
      const name = stripTags(sc.name || "Spellcasting");
      const headerEntries = sc.headerEntries ? entriesToMarkdown(sc.headerEntries) : "";
      lines.push(`***${name}.*** ${headerEntries}`);
      // Spell lists
      if (sc.will?.length) lines.push(`At will: *${sc.will.map(s => stripTags(s)).join(", ")}*`);
      if (sc.daily) {
        for (const [freq, spells] of Object.entries(sc.daily).sort()) {
          const label = freq.endsWith("e") ? `${freq.replace("e", "")}/day each` : `${freq}/day`;
          lines.push(`${label}: *${spells.map(s => stripTags(s)).join(", ")}*`);
        }
      }
      if (sc.spells) {
        for (const [level, data] of Object.entries(sc.spells).sort((a, b) => Number(a[0]) - Number(b[0]))) {
          const prefix = level === "0" ? "Cantrips (at will)" : `${getOrdinal(Number(level))} level (${data.slots} slot${data.slots === 1 ? "" : "s"})`;
          lines.push(`${prefix}: *${data.spells.map(s => stripTags(s)).join(", ")}*`);
        }
      }
      if (sc.footerEntries) lines.push(entriesToMarkdown(sc.footerEntries));
      lines.push("");
    }
  }

  // Actions
  if (m.action?.length) {
    lines.push("");
    lines.push("## Actions");
    for (const a of m.action) {
      const name = stripTags(a.name);
      const desc = entriesToMarkdown(a.entries);
      lines.push(`***${name}.*** ${desc}`);
      lines.push("");
    }
  }

  // Bonus Actions
  if (m.bonus?.length) {
    lines.push("");
    lines.push("## Bonus Actions");
    for (const a of m.bonus) {
      const name = stripTags(a.name);
      const desc = entriesToMarkdown(a.entries);
      lines.push(`***${name}.*** ${desc}`);
      lines.push("");
    }
  }

  // Reactions
  if (m.reaction?.length) {
    lines.push("");
    lines.push("## Reactions");
    for (const r of m.reaction) {
      const name = stripTags(r.name);
      const desc = entriesToMarkdown(r.entries);
      lines.push(`***${name}.*** ${desc}`);
      lines.push("");
    }
  }

  // Legendary Actions
  if (m.legendary?.length) {
    lines.push("");
    lines.push("## Legendary Actions");
    if (m.legendaryHeader?.length) {
      lines.push(entriesToMarkdown(m.legendaryHeader));
      lines.push("");
    } else {
      lines.push(`The ${m.name.toLowerCase()} can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The ${m.name.toLowerCase()} regains spent legendary actions at the start of its turn.`);
      lines.push("");
    }
    for (const l of m.legendary) {
      const name = stripTags(l.name);
      const desc = entriesToMarkdown(l.entries);
      lines.push(`**${name}.** ${desc}`);
      lines.push("");
    }
  }

  // Mythic Actions
  if (m.mythic?.length) {
    lines.push("");
    lines.push("## Mythic Actions");
    if (m.mythicHeader?.length) {
      lines.push(entriesToMarkdown(m.mythicHeader));
      lines.push("");
    }
    for (const a of m.mythic) {
      const name = stripTags(a.name);
      const desc = entriesToMarkdown(a.entries);
      lines.push(`**${name}.** ${desc}`);
      lines.push("");
    }
  }

  // Lair Actions (from legendaryGroup reference — not always inline)
  if (m.lair?.length) {
    lines.push("");
    lines.push("## Lair Actions");
    lines.push(entriesToMarkdown(m.lair));
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatDamageList(arr) {
  return arr.map(d => {
    if (typeof d === "string") return d;
    if (d?.special) return d.special;
    if (d?.immune) return d.immune.join(", ") + (d.note ? ` ${d.note}` : "");
    if (d?.resist) return d.resist.join(", ") + (d.note ? ` ${d.note}` : "");
    return String(d);
  }).join(", ");
}

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================================
// OPEN5E MONSTER -> MARKDOWN
// ============================================================================

function open5eMonsterToMarkdown(m) {
  const size = m.size?.name || "Medium";
  const type = m.type?.name || "Unknown";
  const alignment = m.alignment || "Unaligned";
  const cr = m.challenge_rating_text || "?";
  const xp = m.experience_points || 0;

  const lines = [];
  lines.push(`# ${m.name}`);
  lines.push(`*${size} ${type}, ${alignment}*`);
  lines.push("");

  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| **Armor Class** | ${m.armor_class}${m.armor_detail ? ` (${m.armor_detail})` : ""} |`);
  lines.push(`| **Hit Points** | ${m.hit_points}${m.hit_dice ? ` (${m.hit_dice})` : ""} |`);

  // Speed
  const speeds = [];
  if (m.speed) {
    for (const [type, val] of Object.entries(m.speed)) {
      if (type === "unit" || type === "hover" || val === 0) continue;
      speeds.push(type === "walk" ? `${val} ft.` : `${type} ${val} ft.`);
    }
  }
  lines.push(`| **Speed** | ${speeds.join(", ") || "0 ft."} |`);
  lines.push(`| **Challenge** | ${cr} (${xp.toLocaleString()} XP) |`);
  lines.push("");

  // Ability scores
  if (m.ability_scores) {
    lines.push("## Ability Scores");
    lines.push("| STR | DEX | CON | INT | WIS | CHA |");
    lines.push("|-----|-----|-----|-----|-----|-----|");
    const abs = m.ability_scores;
    const row = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map(stat => {
      const v = abs[stat] ?? 10;
      const mod = Math.floor((v - 10) / 2);
      return `${v} (${mod >= 0 ? "+" : ""}${mod})`;
    });
    lines.push(`| ${row.join(" | ")} |`);
    lines.push("");
  }

  // Saving throws
  if (m.saving_throws) {
    const saves = Object.entries(m.saving_throws)
      .filter(([_, v]) => v !== null)
      .map(([stat, bonus]) => `${stat.substring(0, 3).toUpperCase()} +${bonus}`);
    if (saves.length) lines.push(`**Saving Throws:** ${saves.join(", ")}`);
  }

  // Skills
  if (m.skill_bonuses) {
    const skills = Object.entries(m.skill_bonuses)
      .filter(([_, v]) => v !== null)
      .map(([name, bonus]) => `${name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ")} +${bonus}`);
    if (skills.length) lines.push(`**Skills:** ${skills.join(", ")}`);
  }

  // Damage/condition info
  if (m.resistances_and_immunities) {
    const ri = m.resistances_and_immunities;
    if (ri.damage_vulnerabilities_display) lines.push(`**Damage Vulnerabilities:** ${ri.damage_vulnerabilities_display}`);
    if (ri.damage_resistances_display) lines.push(`**Damage Resistances:** ${ri.damage_resistances_display}`);
    if (ri.damage_immunities_display) lines.push(`**Damage Immunities:** ${ri.damage_immunities_display}`);
    if (ri.condition_immunities_display) lines.push(`**Condition Immunities:** ${ri.condition_immunities_display}`);
  }

  // Senses
  const senseList = [];
  if (m.darkvision_range) senseList.push(`darkvision ${m.darkvision_range} ft.`);
  if (m.blindsight_range) senseList.push(`blindsight ${m.blindsight_range} ft.`);
  if (m.tremorsense_range) senseList.push(`tremorsense ${m.tremorsense_range} ft.`);
  if (m.truesight_range) senseList.push(`truesight ${m.truesight_range} ft.`);
  senseList.push(`passive Perception ${m.passive_perception ?? 10}`);
  lines.push(`**Senses:** ${senseList.join(", ")}`);

  // Languages
  lines.push(`**Languages:** ${m.languages?.as_string || "—"}`);

  // Traits
  if (m.traits?.length) {
    lines.push("");
    lines.push("## Traits");
    for (const t of m.traits) {
      lines.push(`***${t.name}.*** ${t.desc}`);
      lines.push("");
    }
  }

  // Group actions by type
  const actionsByType = { ACTION: [], BONUS_ACTION: [], REACTION: [], LEGENDARY_ACTION: [] };
  for (const a of m.actions || []) {
    const t = a.action_type || "ACTION";
    if (!actionsByType[t]) actionsByType[t] = [];
    actionsByType[t].push(a);
  }

  if (actionsByType.ACTION.length) {
    lines.push("");
    lines.push("## Actions");
    for (const a of actionsByType.ACTION.sort((x, y) => (x.order_in_statblock ?? 99) - (y.order_in_statblock ?? 99))) {
      const usageStr = a.usage_limits
        ? a.usage_limits.type === "RECHARGE_ON_ROLL"
          ? ` (Recharge ${a.usage_limits.param}-6)`
          : a.usage_limits.type === "PER_DAY"
            ? ` (${a.usage_limits.param}/Day)`
            : ""
        : "";
      lines.push(`***${a.name}${usageStr}.*** ${a.desc}`);
      lines.push("");
    }
  }

  if (actionsByType.BONUS_ACTION.length) {
    lines.push("");
    lines.push("## Bonus Actions");
    for (const a of actionsByType.BONUS_ACTION) {
      lines.push(`***${a.name}.*** ${a.desc}`);
      lines.push("");
    }
  }

  if (actionsByType.REACTION.length) {
    lines.push("");
    lines.push("## Reactions");
    for (const a of actionsByType.REACTION) {
      lines.push(`***${a.name}.*** ${a.desc}`);
      lines.push("");
    }
  }

  if (actionsByType.LEGENDARY_ACTION.length) {
    lines.push("");
    lines.push("## Legendary Actions");
    if (m.legendary_desc) {
      lines.push(m.legendary_desc);
      lines.push("");
    }
    for (const a of actionsByType.LEGENDARY_ACTION.sort((x, y) => (x.order_in_statblock ?? 99) - (y.order_in_statblock ?? 99))) {
      const cost = a.legendary_action_cost > 1 ? ` (Costs ${a.legendary_action_cost} Actions)` : "";
      lines.push(`**${a.name}${cost}.** ${a.desc}`);
      lines.push("");
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("=== Populate Restricted Monsters ===\n");

  // 1. Find restricted monsters in Obsidian
  console.log("Scanning Obsidian vault for restricted monsters...");
  const restricted = getRestrictedMonsters();
  console.log(`  Found ${restricted.size} restricted monsters\n`);

  // 2. Download 5etools bestiary files
  console.log("Checking 5etools bestiary cache...");
  if (!existsSync(TOOLS_CACHE_DIR)) {
    mkdirSync(TOOLS_CACHE_DIR, { recursive: true });
  }

  // Check if we already have cached files
  const cachedFiles = readdirSync(TOOLS_CACHE_DIR).filter(f => f.endsWith(".json"));
  if (cachedFiles.length < 50) {
    console.log("  Downloading bestiary files from GitHub...");
    const resp = await fetch("https://api.github.com/repos/5etools-mirror-3/5etools-src/contents/data/bestiary");
    const files = await resp.json();
    const bestiaryFiles = files.filter(f => {
      if (!f.name.startsWith("bestiary-")) return false;
      if (!f.name.endsWith(".json")) return false;
      if (f.name.includes("fluff") || f.name.includes("legend") || f.name.includes("meta")) return false;
      return true;
    });

    let done = 0;
    for (let i = 0; i < bestiaryFiles.length; i += 10) {
      const batch = bestiaryFiles.slice(i, i + 10);
      await Promise.all(batch.map(async (f) => {
        const url = `https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/bestiary/${f.name}`;
        const r = await fetch(url);
        const text = await r.text();
        writeFileSync(join(TOOLS_CACHE_DIR, f.name), text);
        done++;
        process.stdout.write(`\r  ${done}/${bestiaryFiles.length} files`);
      }));
    }
    console.log("");
  } else {
    console.log(`  Using ${cachedFiles.length} cached files`);
  }

  // Build case-insensitive + normalized lookup for restricted names
  const restrictedByLower = new Map(); // lowercase name -> original name
  const restrictedByNorm = new Map(); // normalized name -> original name
  for (const name of restricted.keys()) {
    restrictedByLower.set(name.toLowerCase(), name);
    restrictedByNorm.set(normalizeName(name), name);
  }

  // Normalize a name: lowercase, straight quotes, collapse whitespace
  function normalizeName(name) {
    return name
      .toLowerCase()
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/ +/g, " ")
      .trim();
  }

  // Helper: match a 5etools monster name against restricted list (case + quote insensitive)
  function findRestrictedName(toolsName) {
    if (restricted.has(toolsName)) return toolsName;
    const lower = toolsName.toLowerCase();
    if (restrictedByLower.has(lower)) return restrictedByLower.get(lower);
    const norm = normalizeName(toolsName);
    if (restrictedByNorm.has(norm)) return restrictedByNorm.get(norm);
    return null;
  }

  // 3. Load all 5etools monsters and match by name
  console.log("\nMatching 5etools monsters against restricted list...");
  const toolsMatches = new Map(); // restricted name -> monster object
  for (const file of readdirSync(TOOLS_CACHE_DIR).filter(f => f.endsWith(".json"))) {
    try {
      const data = JSON.parse(readFileSync(join(TOOLS_CACHE_DIR, file), "utf8"));
      if (!data.monster) continue;
      for (const m of data.monster) {
        const rName = findRestrictedName(m.name);
        if (rName && !toolsMatches.has(rName)) {
          toolsMatches.set(rName, m);
        }
      }
    } catch (e) { /* skip bad files */ }
  }
  console.log(`  5etools matches: ${toolsMatches.size}`);

  // 3b. Load 5etools homebrew creature files
  console.log("\nChecking 5etools homebrew cache...");
  if (!existsSync(HOMEBREW_CACHE_DIR)) {
    mkdirSync(HOMEBREW_CACHE_DIR, { recursive: true });
  }

  const cachedHomebrew = readdirSync(HOMEBREW_CACHE_DIR).filter(f => f.endsWith(".json"));
  if (cachedHomebrew.length < 50) {
    console.log("  Downloading homebrew creature files from GitHub...");
    const hbResp = await fetch("https://api.github.com/repos/TheGiddyLimit/homebrew/contents/creature");
    const hbFiles = await hbResp.json();
    const creatureFiles = hbFiles.filter(f => f.name.endsWith(".json"));

    let hbDone = 0;
    for (let i = 0; i < creatureFiles.length; i += 10) {
      const batch = creatureFiles.slice(i, i + 10);
      await Promise.all(batch.map(async (f) => {
        const outPath = join(HOMEBREW_CACHE_DIR, f.name);
        if (existsSync(outPath)) { hbDone++; return; }
        try {
          const r = await fetch(f.download_url);
          const text = await r.text();
          writeFileSync(outPath, text);
        } catch (e) { /* skip */ }
        hbDone++;
        process.stdout.write(`\r  ${hbDone}/${creatureFiles.length} files`);
      }));
    }
    console.log("");
  } else {
    console.log(`  Using ${cachedHomebrew.length} cached files`);
  }

  // 3c. Download homebrew collection files (larger bundles with many monsters)
  const COLLECTION_CACHE_DIR = "/tmp/5etools-collections";
  if (!existsSync(COLLECTION_CACHE_DIR)) mkdirSync(COLLECTION_CACHE_DIR, { recursive: true });

  const collectionFiles = [
    "Ghostfire Gaming; Dungeons of Drakkenheim.json",
    "Ghostfire Gaming; Monsters of Drakkenheim.json",
    "Ghostfire Gaming; Sebastian Crowe's Guide to Drakkenheim.json",
    "Ghostfire Gaming; Grim Hollow - Lairs of Etharis.json",
    "Ghostfire Gaming; Grim Hollow - The Monster Grimoire.json",
    "Ghostfire Gaming; Grim Hollow - Player's Guide - 2024.json",
    "Loot Tavern; Heliana's Guide To Monster Hunting.json",
    "Loot Tavern; Ryoko's Guide to Yokai Realms.json",
    "Loot Tavern; Wrath of the Kaijus.json",
    "MCDM Productions; Strongholds and Followers.json",
    "MCDM Productions; Where Evil Lives.json",
    "Griffin Macaulay; The Griffon's Saddlebag, Book 1.json",
    "Griffin Macaulay; The Griffon's Saddlebag, Book 2.json",
    "Griffin Macaulay; The Griffon's Saddlebag, Book 3.json",
    "Griffin Macaulay; The Griffon's Saddlebag, Book 4.json",
    "Griffin Macaulay; The Griffon's Saddlebag, Book 5.json",
    "Hit Point Press; Humblewood Campaign Setting.json",
    "Hit Point Press; Humblewood Tales.json",
    "Community; Drakkenheim - Community Pack.json",
    "Dungeon Dudes; Drakkenheim - Eldritch Experiments.json",
  ];

  const cachedCollections = readdirSync(COLLECTION_CACHE_DIR).filter(f => f.endsWith(".json"));
  if (cachedCollections.length < collectionFiles.length / 2) {
    console.log("  Downloading collection files...");
    const COLL_BASE = "https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master/collection";
    let collDone = 0;
    for (const fileName of collectionFiles) {
      const outPath = join(COLLECTION_CACHE_DIR, fileName);
      if (existsSync(outPath)) { collDone++; continue; }
      try {
        const r = await fetch(`${COLL_BASE}/${encodeURIComponent(fileName)}`);
        if (r.ok) writeFileSync(outPath, await r.text());
      } catch (e) { /* skip */ }
      collDone++;
      process.stdout.write(`\r  ${collDone}/${collectionFiles.length} collection files`);
    }
    console.log("");
  } else {
    console.log(`  Using ${cachedCollections.length} cached collection files`);
  }

  // 3d. Download homebrew adventure and book files
  const ADV_CACHE_DIR = "/tmp/5etools-adventures";
  const BOOK_CACHE_DIR = "/tmp/5etools-books";
  for (const dir of [ADV_CACHE_DIR, BOOK_CACHE_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  for (const [dirName, cacheDir] of [["adventure", ADV_CACHE_DIR], ["book", BOOK_CACHE_DIR]]) {
    const cached = readdirSync(cacheDir).filter(f => f.endsWith(".json"));
    if (cached.length < 10) {
      console.log(`  Downloading ${dirName} files...`);
      try {
        const resp = await fetch(`https://api.github.com/repos/TheGiddyLimit/homebrew/contents/${dirName}`);
        const files = (await resp.json()).filter(f => f.name.endsWith(".json"));
        let done = 0;
        for (let i = 0; i < files.length; i += 5) {
          const batch = files.slice(i, i + 5);
          await Promise.all(batch.map(async (f) => {
            const out = join(cacheDir, f.name);
            if (existsSync(out)) { done++; return; }
            try {
              const r = await fetch(f.download_url);
              writeFileSync(out, await r.text());
            } catch (e) { /* skip */ }
            done++;
          }));
          process.stdout.write(`\r  ${done}/${files.length} ${dirName} files`);
        }
        console.log("");
      } catch (e) { console.log(`  Error fetching ${dirName} list: ${e.message}`); }
    } else {
      console.log(`  Using ${cached.length} cached ${dirName} files`);
    }
  }

  // Match homebrew monsters from creature/, collection/, adventure/, and book/ dirs
  console.log("  Matching homebrew monsters...");
  const homebrewMatches = new Map();
  const homebrewDirs = [HOMEBREW_CACHE_DIR, COLLECTION_CACHE_DIR, ADV_CACHE_DIR, BOOK_CACHE_DIR];
  for (const dir of homebrewDirs) {
    for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
        const monsters = data.monster || [];
        for (const m of monsters) {
          const rName = findRestrictedName(m.name);
          if (rName && !toolsMatches.has(rName) && !homebrewMatches.has(rName)) {
            homebrewMatches.set(rName, m);
          }
        }
      } catch (e) { /* skip bad files */ }
    }
  }
  console.log(`  Homebrew matches: ${homebrewMatches.size}`);

  // 4. Fetch remaining from Open5e (with local cache)
  const OPEN5E_CACHE_DIR = "/tmp/open5e-creatures";
  const OPEN5E_INDEX_FILE = join(OPEN5E_CACHE_DIR, "_index.json");
  if (!existsSync(OPEN5E_CACHE_DIR)) mkdirSync(OPEN5E_CACHE_DIR, { recursive: true });

  const remaining = [...restricted.keys()].filter(n => !toolsMatches.has(n) && !homebrewMatches.has(n));
  console.log(`\nFetching Open5e creatures for ${remaining.length} remaining monsters...`);

  // Load or build the name -> key index
  let open5eIndex; // { name: key } for ALL Open5e creatures
  if (existsSync(OPEN5E_INDEX_FILE)) {
    open5eIndex = JSON.parse(readFileSync(OPEN5E_INDEX_FILE, "utf8"));
    console.log(`  Using cached Open5e index (${Object.keys(open5eIndex).length} creatures)`);
  } else {
    open5eIndex = {};
    let url = "https://api.open5e.com/v2/creatures/?format=json&limit=100&fields=name,key";
    let page = 0;
    while (url) {
      try {
        const resp = await fetch(url);
        const data = await resp.json();
        for (const c of data.results) {
          open5eIndex[c.name] = c.key;
        }
        url = data.next;
        page++;
        process.stdout.write(`\r  Scanned ${page * 100}+ Open5e creatures...`);
      } catch (e) {
        console.warn(`\n  Error fetching Open5e page: ${e.message}`);
        break;
      }
    }
    writeFileSync(OPEN5E_INDEX_FILE, JSON.stringify(open5eIndex, null, 2));
    console.log(`\n  Cached Open5e index (${Object.keys(open5eIndex).length} creatures)`);
  }

  // Find matches in the index
  const open5eKeyMap = new Map();
  for (const name of remaining) {
    if (open5eIndex[name]) {
      open5eKeyMap.set(name, open5eIndex[name]);
    }
  }
  console.log(`  Open5e matches: ${open5eKeyMap.size}`);

  // Fetch full data for matches (with per-creature caching)
  const open5eMatches = new Map();
  let fetched = 0;
  for (const [name, key] of open5eKeyMap) {
    const cacheFile = join(OPEN5E_CACHE_DIR, `${key}.json`);
    try {
      let data;
      if (existsSync(cacheFile)) {
        data = JSON.parse(readFileSync(cacheFile, "utf8"));
      } else {
        const resp = await fetch(`https://api.open5e.com/v2/creatures/${key}/?format=json`);
        data = await resp.json();
        writeFileSync(cacheFile, JSON.stringify(data, null, 2));
        await new Promise(r => setTimeout(r, 100)); // rate limit only for API calls
      }
      open5eMatches.set(name, data);
      fetched++;
      process.stdout.write(`\r  Fetched ${fetched}/${open5eKeyMap.size} Open5e stat blocks...`);
    } catch (e) {
      console.warn(`\n  Error fetching ${name}: ${e.message}`);
    }
  }
  if (fetched > 0) console.log("");

  // 5. Fuzzy match remaining monsters using base name (strip parenthetical suffix)
  const stillRemaining = [...restricted.keys()].filter(n =>
    !toolsMatches.has(n) && !homebrewMatches.has(n) && !open5eMatches.has(n)
  );
  console.log(`\nFuzzy matching ${stillRemaining.length} remaining monsters against base names...`);

  // Build index of all available monsters (lowercase name -> monster object)
  const allMonstersByLower = new Map();
  const allSourceDirs = [TOOLS_CACHE_DIR, HOMEBREW_CACHE_DIR, COLLECTION_CACHE_DIR, ADV_CACHE_DIR, BOOK_CACHE_DIR];
  for (const dir of allSourceDirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
        for (const m of (data.monster || [])) {
          if (m.name && !m._copy) {
            const key = m.name.toLowerCase();
            if (!allMonstersByLower.has(key)) allMonstersByLower.set(key, m);
          }
        }
      } catch (e) {}
    }
  }

  // Also build normalized lookup for available monsters
  const allMonstersByNorm = new Map();
  for (const [lower, monster] of allMonstersByLower) {
    const norm = normalizeName(monster.name);
    if (!allMonstersByNorm.has(norm)) allMonstersByNorm.set(norm, monster);
  }

  // Manual mappings for known naming differences between DDB and 5etools
  const MANUAL_MAP = {
    "Clawfoot Raptor": "Clawfoot",
    "Empyrean Iota (Celestial)": "Empyrean Iota",
    "Empyrean Iota (Fiend)": "Empyrean Iota",
    "Planar Incarnate (Celestial Form)": "Planar Incarnate",
    "Planar Incarnate (Fiend Form)": "Planar Incarnate",
    "Lambent Delerium Dreg": "Lambent Dreg",
    "Gutbuster Haze Hulk": "Gutbuster Hulk",
    // Verified naming differences (DDB short name -> 5etools full name)
    "Nurvureem": "Nurvureem, The Dark Lady",
    "Rishaal": "Rishaal the Page-Turner",
    "Refrum": "Master Refrum",
    "Kayalithica": "Thane Kayalithica",
    "Lhupo": "Lhupo the Goblin",
    "Bita": "Bita, the Council Speaker",
    "Horgar Steelshadow V": "Deepking Horgar Steelshadow V",
    "Pudding King": "The Pudding King",
    "Rose Durst": 'Rosavalda "Rose" Durst',
    "Thorn Durst": 'Thornboldt "Thorn" Durst',
    "Stone Giant of Deadstone Cleft": "Deadstone Cleft Stone Giant",
    "Statue of Lolth": "Animated Statue of Lolth",
    "Tile Chimera": "Animated Tile Chimera",
    "Witchlight Hand": "Witchlight Hand (Medium)",
    "Monastery of the Distressed Body, Grand Master": "Monastery of the Distressed Body Grand Master",
    "Monastery of the Distressed Body, Elder Monk": "Elder Monastery of the Distressed Body Monk",
    "Rakdos Performer": "Rakdos Performer, Blade Juggler",
    "Mutated Drow": "Giant Mutated Drow",
    "Uthgardt Leader": "Uthgardt Barbarian Leader",
    "Jade Spider": "Jade Giant Spider",
  };

  const fuzzyMatches = new Map(); // restricted name -> { monster, baseName }
  for (const name of stillRemaining) {
    // Strategy 0: Manual mapping
    if (MANUAL_MAP[name]) {
      const target = MANUAL_MAP[name].toLowerCase();
      if (allMonstersByLower.has(target)) {
        fuzzyMatches.set(name, { monster: allMonstersByLower.get(target), baseName: MANUAL_MAP[name] });
        continue;
      }
    }
    // Strategy 1: Normalized name match (handles quotes, double spaces)
    const norm = normalizeName(name);
    if (allMonstersByNorm.has(norm)) {
      const m = allMonstersByNorm.get(norm);
      fuzzyMatches.set(name, { monster: m, baseName: m.name });
      continue;
    }
    // Strategy 2: Strip parenthetical suffix
    const base = name.replace(/\s*\([^)]+\)\s*$/, "").trim();
    if (base !== name && allMonstersByLower.has(base.toLowerCase())) {
      fuzzyMatches.set(name, { monster: allMonstersByLower.get(base.toLowerCase()), baseName: base });
      continue;
    }
    // Strategy 3: Strip parenthetical + normalize
    if (base !== name) {
      const baseNorm = normalizeName(base);
      if (allMonstersByNorm.has(baseNorm)) {
        const m = allMonstersByNorm.get(baseNorm);
        fuzzyMatches.set(name, { monster: m, baseName: m.name });
        continue;
      }
    }
    // Strategy 4: Spellcaster reformat ("Spellcaster - Healer" -> "Spellcaster (Healer)")
    const altSpell = name.replace(/Spellcaster - (Healer|Mage)/, "Spellcaster ($1)");
    const noLevel = altSpell.replace(/\s*\(level \d+\)\s*$/, "").trim();
    if (noLevel !== name && allMonstersByLower.has(noLevel.toLowerCase())) {
      fuzzyMatches.set(name, { monster: allMonstersByLower.get(noLevel.toLowerCase()), baseName: noLevel });
      continue;
    }
    // Strategy 5: Remove hyphens
    const noHyphen = name.replace(/\s*-\s*/g, " ");
    if (noHyphen !== name && allMonstersByLower.has(noHyphen.toLowerCase())) {
      fuzzyMatches.set(name, { monster: allMonstersByLower.get(noHyphen.toLowerCase()), baseName: noHyphen });
      continue;
    }
  }
  console.log(`  Fuzzy matches: ${fuzzyMatches.size}`);

  // 6. Write updated files
  const totalMatches = toolsMatches.size + homebrewMatches.size + open5eMatches.size + fuzzyMatches.size;
  console.log(`\nWriting ${totalMatches} monster files (${toolsMatches.size} 5etools + ${homebrewMatches.size} homebrew + ${open5eMatches.size} Open5e + ${fuzzyMatches.size} fuzzy)...`);
  let written = 0;
  let errors = 0;

  for (const [name, info] of restricted) {
    let markdown = null;
    let source = null;

    if (toolsMatches.has(name)) {
      try {
        markdown = toolsMonsterToMarkdown(toolsMatches.get(name));
        source = "5etools";
      } catch (e) {
        errors++;
        continue;
      }
    } else if (homebrewMatches.has(name)) {
      try {
        markdown = toolsMonsterToMarkdown(homebrewMatches.get(name));
        source = "homebrew";
      } catch (e) {
        errors++;
        continue;
      }
    } else if (open5eMatches.has(name)) {
      try {
        markdown = open5eMonsterToMarkdown(open5eMatches.get(name));
        source = "Open5e";
      } catch (e) {
        errors++;
        continue;
      }
    } else if (fuzzyMatches.has(name)) {
      try {
        const { monster, baseName } = fuzzyMatches.get(name);
        markdown = toolsMonsterToMarkdown(monster);
        // Prepend note about fuzzy match and replace title with original name
        markdown = markdown.replace(/^# .+/, `# ${name}`);
        markdown = `> [!note] Base stat block from "${baseName}". Actual "${name}" may differ.\n\n${markdown}`;
        source = "fuzzy";
      } catch (e) {
        errors++;
        continue;
      }
    }

    if (markdown) {
      writeFileSync(info.filePath, markdown + "\n", "utf-8");
      written++;
      if (written % 100 === 0) {
        process.stdout.write(`\r  Written ${written}/${totalMatches}...`);
      }
    }
  }

  const stillRestricted = restricted.size - written;
  console.log(`\r  Written ${written} monster files (${errors} errors)`);
  console.log(`  Still restricted: ${stillRestricted} monsters`);
  console.log(`\nDone.`);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
