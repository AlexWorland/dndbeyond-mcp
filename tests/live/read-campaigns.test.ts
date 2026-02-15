import { describe, it, expect } from "vitest";
import { getLiveClient } from "./setup.js";
import { listCampaigns, getCampaignCharacters } from "../../src/tools/campaign.js";
import { ENDPOINTS } from "../../src/api/endpoints.js";
import type { DdbCampaign } from "../../src/types/api.js";

describe("Live: Campaign endpoints", () => {
  it("should list active campaigns", async () => {
    const client = await getLiveClient();
    const result = await listCampaigns(client);
    const text = result.content[0].text;

    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);

    if (!text.includes("No active campaigns")) {
      expect(text).toContain("Active Campaigns:");
      expect(text).toMatch(/•/);
    }
  });

  it("should get campaign characters for first campaign with characters", async () => {
    const client = await getLiveClient();
    const campaigns = await client.get<DdbCampaign[]>(
      ENDPOINTS.campaign.list(),
      "live-campaigns-raw",
      60_000
    );

    if (!campaigns || campaigns.length === 0) {
      return; // Skip if no campaigns
    }

    // Find a campaign with characters
    for (const campaign of campaigns) {
      const result = await getCampaignCharacters(client, {
        campaignId: campaign.id,
      });
      const text = result.content[0].text;

      if (text.includes("Party Roster")) {
        expect(text).toContain("Party Roster");
        expect(text).toMatch(/•/);
        return; // Found one, test passes
      }
    }

    // All campaigns empty — still valid, just no characters to show
  });
});
