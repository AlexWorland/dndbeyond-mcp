import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DdbClient } from "../api/client.js";
import { ENDPOINTS } from "../api/endpoints.js";
import type { DdbCampaignResponse } from "../types/api.js";

const CAMPAIGN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function registerCampaignResources(server: McpServer, client: DdbClient) {
  // Resource 1: dndbeyond://campaigns - Lists all user's active campaigns
  server.registerResource(
    "campaigns",
    "dndbeyond://campaigns",
    {
      description: "Lists all of the user's active D&D Beyond campaigns with DM and player count",
      mimeType: "text/plain",
    },
    async () => {
      const response = await client.get<DdbCampaignResponse>(
        ENDPOINTS.campaign.list(),
        "campaigns",
        CAMPAIGN_CACHE_TTL
      );

      if (!response.data || response.data.length === 0) {
        return {
          contents: [
            {
              uri: "dndbeyond://campaigns",
              text: "No active campaigns found.",
              mimeType: "text/plain",
            },
          ],
        };
      }

      const lines = ["Active Campaigns:", ""];
      for (const campaign of response.data) {
        const playerCount = campaign.characters.length;
        lines.push(
          `• ${campaign.name} (ID: ${campaign.id}, DM: ${campaign.dmUsername}, ${playerCount} player${playerCount !== 1 ? "s" : ""})`
        );
      }

      return {
        contents: [
          {
            uri: "dndbeyond://campaigns",
            text: lines.join("\n"),
            mimeType: "text/plain",
          },
        ],
      };
    }
  );

  // Resource 2: dndbeyond://campaign/{id}/party - Party roster for a campaign
  server.registerResource(
    "campaign-party",
    new ResourceTemplate("dndbeyond://campaign/{id}/party", {
      list: undefined,
    }),
    {
      description: "Shows the party roster for a specific campaign with character names and player usernames",
      mimeType: "text/plain",
    },
    async (uri) => {
      const match = uri.toString().match(/^dndbeyond:\/\/campaign\/(\d+)\/party$/);
      if (!match) {
        throw new Error("Invalid campaign party URI format");
      }

      const campaignId = parseInt(match[1], 10);

      const response = await client.get<DdbCampaignResponse>(
        ENDPOINTS.campaign.list(),
        `campaign:${campaignId}:characters`,
        CAMPAIGN_CACHE_TTL
      );

      const campaign = response.data.find((c) => c.id === campaignId);
      if (!campaign) {
        return {
          contents: [
            {
              uri: uri.toString(),
              text: `Campaign ${campaignId} not found.`,
              mimeType: "text/plain",
            },
          ],
        };
      }

      if (campaign.characters.length === 0) {
        return {
          contents: [
            {
              uri: uri.toString(),
              text: `Campaign "${campaign.name}" has no characters yet.`,
              mimeType: "text/plain",
            },
          ],
        };
      }

      const lines = [`Party Roster for "${campaign.name}":`, ""];
      for (const character of campaign.characters) {
        lines.push(`• ${character.characterName} (${character.username})`);
      }

      return {
        contents: [
          {
            uri: uri.toString(),
            text: lines.join("\n"),
            mimeType: "text/plain",
          },
        ],
      };
    }
  );
}
