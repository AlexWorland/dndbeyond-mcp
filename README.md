# dndbeyond-mcp

A TypeScript MCP (Model Context Protocol) server for D&D Beyond. Gives Claude (and other MCP-compatible AI assistants) access to your D&D Beyond characters, campaigns, spells, monsters, items, and more.

> **Disclaimer:** This project uses unofficial, reverse-engineered D&D Beyond endpoints. It is not affiliated with, endorsed by, or supported by D&D Beyond or Wizards of the Coast. Endpoints may change without notice.

## Features

- **Character Management** — Read character sheets, update HP, spell slots, death saves, currency, inventory, and custom items
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
- `set_progression` — Set current XP/progression
- `set_hp_base` / `set_hp_bonus` / `set_hp_override` / `restore_hp` — Manage HP internals
- `set_character_preference` / `set_help_text` — Update sheet preferences/help text
- `add_known_spell` / `remove_known_spell` / `set_spell_prepared` — Manage known/prepared class spells
- `set_character_source_categories` / `set_character_campaign_setting` — Manage DDB source/category content settings
- `set_custom_background` / `set_has_custom_background` — Manage custom background data and activation
- `set_custom_value` / `delete_custom_value` / `delete_custom_entity_values` — Manage DDB custom/entity-scoped values
- `manage_custom_proficiency` / `manage_custom_movement` / `manage_custom_sense` / `manage_custom_defense_adjustment` / `manage_custom_action` — Create/update/delete DDB custom sheet entities
- `manage_character_feat` / `manage_character_infusion` / `manage_optional_feature` — Manage feat, infusion, and optional-feature endpoint families
- `manage_roll_result` — Manage DDB roll result groups/results
- `manage_vehicle` — Manage DDB vehicle mappings, fuel, conditions, and component data; vehicle/component IDs are DDB string IDs like `sjliv`/`sjliv06c`
- `set_character_decoration` / `get_character_rule_data` / `get_character_share_url` / `generate_character_pdf` / `manage_premade_info` / `set_character_feature_flag` — Additional typed character-service endpoints reverse-engineered from the DDB web app; PDF generation requires DDB `exportData`, and feature flags require a `flags` array
- `list_experimental_ddb_endpoints` / `call_experimental_ddb_endpoint` — Allowlisted fallback for DDB character-service endpoints whose payloads still vary by feature/account state
- `list_inventory_items` — List inventory and IDs used by inventory write tools
- `add_catalog_item` — Add an official/catalog item by name or entity ID
- `set_inventory_item_quantity` — Change item quantity
- `set_inventory_item_equipped` — Equip or unequip an item
- `set_inventory_item_attuned` — Attune or unattune an item
- `set_inventory_item_charge` — Update item charges
- `move_inventory_item` — Move items into/out of containers
- `remove_inventory_item` — Remove an inventory item
- `create_custom_item` / `update_custom_item` / `delete_custom_item` — Manage custom items

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
