import { DdbClient } from "../api/client.js";
import { ENDPOINTS } from "../api/endpoints.js";
import type { DdbCampaignResponse } from "../types/api.js";

const CAMPAIGN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function listCampaigns(client: DdbClient) {
  const response = await client.get<DdbCampaignResponse>(
    ENDPOINTS.campaign.list(),
    "campaigns",
    CAMPAIGN_CACHE_TTL
  );

  if (!response.data || response.data.length === 0) {
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
  for (const campaign of response.data) {
    const playerCount = campaign.characters.length;
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
  params: { campaignId: number }
) {
  const response = await client.get<DdbCampaignResponse>(
    ENDPOINTS.campaign.list(),
    `campaign:${params.campaignId}:characters`,
    CAMPAIGN_CACHE_TTL
  );

  const campaign = response.data.find((c) => c.id === params.campaignId);
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

  if (campaign.characters.length === 0) {
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
  for (const character of campaign.characters) {
    lines.push(`• ${character.characterName} (${character.username})`);
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
