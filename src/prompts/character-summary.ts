import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCharacterSummaryPrompt(server: McpServer): void {
  server.prompt(
    "character-summary",
    "Retrieve a D&D character and provide a comprehensive summary",
    {
      characterName: z.string().describe("Name of the character to summarize"),
    },
    async (args) => {
      const characterName = args.characterName;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please retrieve the D&D character named "${characterName}" and provide a comprehensive summary including:

- Basic information (name, race, class, level, background)
- Ability scores (STR, DEX, CON, INT, WIS, CHA)
- Hit points, armor class, initiative, speed
- Proficiency bonus and proficient skills
- Notable features and abilities
- Prepared/known spells (if applicable)
- Current inventory and equipment
- Campaign association (if any)

Use the get_character tool to retrieve the character data.`,
            },
          },
        ],
      };
    }
  );
}
