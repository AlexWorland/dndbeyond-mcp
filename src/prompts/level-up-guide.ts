import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerLevelUpGuidePrompt(server: McpServer): void {
  server.prompt(
    "level-up-guide",
    "Guide a character through level-up decisions",
    {
      characterId: z.string().describe("Character ID that is leveling up"),
    },
    async (args) => {
      const characterId = args.characterId;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Guide character ${characterId} through their level-up process.

Please:
1. Retrieve the character's current information (use get_character)
2. Identify their current level and class
3. Explain the new class features gained at the next level
4. If applicable, recommend new spells to learn/prepare
5. If this is an ASI level, recommend ability score improvements or feats
6. Consider the character's existing build and playstyle in your recommendations
7. Explain the mechanical and roleplay implications of each choice

Provide a comprehensive walkthrough that helps the player make informed decisions about their character progression.`,
            },
          },
        ],
      };
    }
  );
}
