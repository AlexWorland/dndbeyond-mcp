import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerSessionPrepPrompt(server: McpServer): void {
  server.prompt(
    "session-prep",
    "DM session preparation workflow for a D&D campaign",
    {
      campaignId: z.string().describe("Campaign ID to prepare for"),
      partyLevel: z.string().describe("Average party level"),
    },
    async (args) => {
      const campaignId = args.campaignId;
      const partyLevel = args.partyLevel;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Prepare a D&D session for campaign ${campaignId} at party level ${partyLevel}.

Please help me with:
1. Review party composition and capabilities (use get_campaign_characters)
2. Suggest appropriate encounters based on party level and composition
3. Note any unresolved plot hooks or character arcs from the campaign
4. Recommend relevant monsters, items, or spells for this session

Focus on creating balanced, engaging challenges for this specific party.`,
            },
          },
        ],
      };
    }
  );
}
