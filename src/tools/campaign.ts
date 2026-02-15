import { DdbClient } from "../api/client.js";
import { ENDPOINTS } from "../api/endpoints.js";
import type { DdbCampaign, DdbCampaignCharacter2 } from "../types/api.js";

const CAMPAIGN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function listCampaigns(client: DdbClient, includeAll?: boolean) {
  // client.get() auto-unwraps the { success, data } envelope
  // Use user-campaigns endpoint when includeAll is true, otherwise active-campaigns (default)
  const endpoint = includeAll ? ENDPOINTS.campaign.userCampaigns() : ENDPOINTS.campaign.list();
  const cacheKey = includeAll ? "user-campaigns" : "campaigns";
  const campaigns = await client.get<DdbCampaign[]>(
    endpoint,
    cacheKey,
    CAMPAIGN_CACHE_TTL
  );

  if (!campaigns || campaigns.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "No active campaigns found.",
        },
      ],
    };
  }

  const lines = ["Active Campaigns:", ""];
  for (const campaign of campaigns) {
    const playerCount = campaign.playerCount;
    lines.push(
      `• ${campaign.name} (DM: ${campaign.dmUsername}, ${playerCount} player${playerCount !== 1 ? "s" : ""})`
    );
  }

  return {
    content: [
      {
        type: "text" as const,
        text: lines.join("\n"),
      },
    ],
  };
}

export async function getCampaignCharacters(
  client: DdbClient,
  params: { campaignId: number; includeAll?: boolean }
) {
  // First fetch campaigns to verify the campaign exists
  const endpoint = params.includeAll ? ENDPOINTS.campaign.userCampaigns() : ENDPOINTS.campaign.list();
  const cacheKey = params.includeAll ? "user-campaigns" : "campaigns";
  const campaigns = await client.get<DdbCampaign[]>(
    endpoint,
    cacheKey,
    CAMPAIGN_CACHE_TTL
  );

  const campaign = campaigns.find((c) => c.id === params.campaignId);
  if (!campaign) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Campaign ${params.campaignId} not found.`,
        },
      ],
    };
  }

  // Fetch characters from the new endpoint
  const characters = await client.get<DdbCampaignCharacter2[]>(
    ENDPOINTS.campaign.characters(params.campaignId),
    `campaign:${params.campaignId}:characters`,
    CAMPAIGN_CACHE_TTL
  );

  if (characters.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Campaign "${campaign.name}" has no characters yet.`,
        },
      ],
    };
  }

  const lines = [`Party Roster for "${campaign.name}":`, ""];
  for (const character of characters) {
    lines.push(`• ${character.name} (${character.userName})`);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: lines.join("\n"),
      },
    ],
  };
}
