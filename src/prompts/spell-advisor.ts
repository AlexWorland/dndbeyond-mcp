import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerSpellAdvisorPrompt(server: McpServer): void {
  server.prompt(
    "spell-advisor",
    "Recommend optimal spells based on character and situation",
    {
      characterId: z.string().describe("Character ID to provide spell advice for"),
      situation: z.string().describe("The combat or roleplay situation"),
    },
    async (args) => {
      const characterId = args.characterId;
      const situation = args.situation;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Provide spell recommendations for character ${characterId} in the following situation: "${situation}"

Please:
1. Retrieve the character's known/prepared spells (use get_character)
2. Review their current spell slots and class features
3. Recommend the most effective spells for this situation
4. Explain the tactical reasoning behind each recommendation
5. Note any concentration requirements or spell interactions
6. Suggest alternative approaches if spell slots are limited

Focus on practical, situation-appropriate advice based on what the character actually has prepared.`,
            },
          },
        ],
      };
    }
  );
}
