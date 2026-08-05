

# dndbeyond-mcp

Un servidor MCP (Model Context Protocol) en TypeScript para D&D Beyond. Otorga a Claude (y a otros asistentes de IA compatibles con MCP) acceso a tus personajes, campañas, hechizos, monstruos, objetos y más de D&D Beyond.

> **Descargo de responsabilidad:** Este proyecto utiliza endpoints no oficiales de D&D Beyond obtenidos mediante ingeniería inversa. No está afiliado, respaldado ni apoyado por D&D Beyond ni Wizards of the Coast. Los endpoints pueden cambiar sin previo aviso.

## Características

- **Gestión de personajes** — Leer hojas de personaje, actualizar puntos de golpe (HP), espacios de hechizo, salvamentos contra muerte, moneda
- **Acceso a campañas** — Listar campañas, ver listas de grupo
- **Consultas de referencia** — Buscar y recuperar hechizos, monstruos, objetos mágicos, rasgos, condiciones y clases
- **Prompts de flujo de trabajo** — Preparación de sesiones, creación de encuentros, guía para subir de nivel, recomendaciones de hechizos
- **Autenticación basada en navegador** — Flujo de inicio de sesión impulsado por Playwright (sin extracción manual de cookies)

## Instalación

Puedes ejecutar este servidor sin instalarlo a través de `npx`:

```bash
npx dndbeyond-mcp
```

O instálalo globalmente:

```bash
npm install -g dndbeyond-mcp
```

## Configuración

Antes de usar el servidor, auténticate en D&D Beyond:

```bash
npx dndbeyond-mcp setup
```

Esto abre una ventana del navegador donde inicies sesión en D&D Beyond como de costumbre. El servidor captura automáticamente tu cookie de sesión y la guarda en `~/.dndbeyond-mcp/config.json`.

## Configuración de Claude Desktop

Agrega esto a tu archivo de configuración de Claude Desktop:

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

Después de agregar la configuración, reinicia Claude Desktop.

## Herramientas

### Personaje
- `get_character` — Hoja de personaje completa por ID o nombre
- `list_characters` — Todos tus personajes
- `update_hp` — Aplicar daño o curación
- `update_spell_slots` — Usar o restaurar espacios de hechizo
- `update_death_saves` — Registrar salvamentos contra muerte
- `update_currency` — Modificar oro/plata/cobre
- `use_ability` — Decrementar características de uso limitado

### Campaña
- `list_campaigns` — Tus campañas activas
- `get_campaign_characters` — Todos los personajes en una campaña

### Referencia
- `search_spells` / `get_spell` — Búsqueda de hechizos con filtros
- `search_monsters` / `get_monster` — Fichas de monstruos
- `search_items` / `get_item` — Catálogo de objetos mágicos
- `search_feats` — Descubrimiento de rasgos
- `get_condition` — Reglas de condiciones
- `search_classes` — Información de clases/subclases

### Utilidad
- `setup_auth` — Volver a ejecutar el flujo de inicio de sesión
- `check_auth` — Verificar que la sesión es válida

## Recursos

| URI | Descripción |
|-----|-------------|
| `dndbeyond://characters` | Tu lista de personajes |
| `dndbeyond://character/{id}` | Hoja de personaje |
| `dndbeyond://character/{id}/spells` | Lista de hechizos |
| `dndbeyond://character/{id}/inventory` | Inventario |
| `dndbeyond://campaigns` | Tus campañas |
| `dndbeyond://campaign/{id}/party` | Lista de grupo |

## Prompts

| Prompt | Propósito |
|--------|---------|
| `character-summary` | Resumen completo del personaje |
| `session-prep` | Preparación de sesión del Director de Juego |
| `encounter-builder` | Diseño de encuentros equilibrados |
| `spell-advisor` | Recomendaciones de hechizos |
| `level-up-guide` | Guía para subir de nivel |
| `rules-lookup` | Aclaración de reglas |

## Seguridad

Este servidor almacena tu cookie de sesión de D&D Beyond localmente en `~/.dndbeyond-mcp/config.json`. La cookie otorga acceso completo a tu cuenta de D&D Beyond. Nunca compartas este archivo. El servidor solo se comunica con dominios de `dndbeyond.com`.

## Licencia

MIT
