# dndbeyond-mcp

A TypeScript MCP (Model Context Protocol) server for D&D Beyond. Gives Claude (and other MCP-compatible AI assistants) access to your D&D Beyond characters, campaigns, spells, monsters, items, and more.

> **Disclaimer:** This project uses unofficial, reverse-engineered D&D Beyond endpoints. It is not affiliated with, endorsed by, or supported by D&D Beyond or Wizards of the Coast. Endpoints may change without notice.

## Features

- **Character Management** — Read character sheets, update HP, spell slots, death saves, currency
- **Campaign Access** — List campaigns, view party rosters
- **Reference Lookups** — Search and retrieve spells, monsters, magic items, feats, conditions, classes
- **Workflow Prompts** — Session prep, encounter building, level-up guidance, spell recommendations
- **Browser-Based Auth** — Playwright-powered login flow (no manual cookie extraction)

## Installation

You can run this server without installing via `npx`:

```bash
npx dndbeyond-mcp
```

Or install globally:

```bash
npm install -g dndbeyond-mcp
```

## Setup

Before using the server, authenticate with D&D Beyond:

```bash
npx dndbeyond-mcp setup
```

This opens a browser window where you log into D&D Beyond normally. The server captures your session cookie automatically and saves it to `~/.dndbeyond-mcp/config.json`.

## Claude Desktop Configuration

Add this to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dndbeyond": {
      "command": "npx",
      "args": ["-y", "dndbeyond-mcp"]
    }
  }
}
```

After adding the configuration, restart Claude Desktop.

## Tools

### Character
- `get_character` — Full character sheet by ID or name
- `list_characters` — All your characters
- `update_hp` — Apply damage or healing
- `update_spell_slots` — Use or restore spell slots
- `update_death_saves` — Record death saves
- `update_currency` — Modify gold/silver/copper
- `use_ability` — Decrement limited-use features

### Campaign
- `list_campaigns` — Your active campaigns
- `get_campaign_characters` — All characters in a campaign

### Reference
- `search_spells` / `get_spell` — Spell lookup with filters
- `search_monsters` / `get_monster` — Monster stat blocks
- `search_items` / `get_item` — Magic item catalog
- `search_feats` — Feat discovery
- `get_condition` — Condition rules
- `search_classes` — Class/subclass info

### Utility
- `setup_auth` — Re-run login flow
- `check_auth` — Verify session is valid

## Resources

| URI | Description |
|-----|-------------|
| `dndbeyond://characters` | Your character list |
| `dndbeyond://character/{id}` | Character sheet |
| `dndbeyond://character/{id}/spells` | Spell list |
| `dndbeyond://character/{id}/inventory` | Inventory |
| `dndbeyond://campaigns` | Your campaigns |
| `dndbeyond://campaign/{id}/party` | Party roster |

## Prompts

| Prompt | Purpose |
|--------|---------|
| `character-summary` | Full character rundown |
| `session-prep` | DM session preparation |
| `encounter-builder` | Balanced encounter design |
| `spell-advisor` | Spell recommendations |
| `level-up-guide` | Level-up walkthrough |
| `rules-lookup` | Rules clarification |

## Security

This server stores your D&D Beyond session cookie locally at `~/.dndbeyond-mcp/config.json`. The cookie provides full access to your D&D Beyond account. Never share this file. The server only communicates with `dndbeyond.com` domains.

## License

MIT
