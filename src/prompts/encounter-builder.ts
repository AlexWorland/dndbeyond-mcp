import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerEncounterBuilderPrompt(server: McpServer): void {
  server.prompt(
    "encounter-builder",
    "Build a balanced D&D encounter with CR calculations",
    {
      partySize: z.string().describe("Number of players in the party"),
      partyLevel: z.string().describe("Average party level"),
      difficulty: z.string().describe("Encounter difficulty (easy, medium, hard, deadly)"),
      environment: z.string().describe("Environment or theme for the encounter"),
    },
    async (args) => {
      const partySize = args.partySize;
      const partyLevel = args.partyLevel;
      const difficulty = args.difficulty;
      const environment = args.environment;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Build a ${difficulty} encounter for a party of ${partySize} level ${partyLevel} characters in a ${environment} environment.

Please:
1. Calculate the appropriate XP budget based on party size, level, and difficulty
2. Search for monsters that fit the environment and theme (use search_monsters)
3. Suggest a balanced combination of monsters that meets the XP budget
4. Provide tactical notes on how to run the encounter
5. Note any environmental hazards or features that could enhance the encounter

Include CR calculations and explain your monster selection choices.`,
            },
          },
        ],
      };
    }
  );
}
