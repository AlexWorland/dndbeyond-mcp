import { describe, it, expect, beforeEach, vi } from "vitest";
import { listCampaigns, getCampaignCharacters } from "../../src/tools/campaign.js";
import { DdbClient } from "../../src/api/client.js";
import type { DdbCampaign } from "../../src/types/api.js";

const sampleCampaigns: DdbCampaign[] = [
  {
    id: 101,
    name: "Lost Mines of Phandelver",
    dmId: 1,
    dmUsername: "DungeonMaster",
    characters: [
      {
        characterId: 1001,
        characterName: "Thorin Stonehammer",
        userId: 10,
        username: "player1",
      },
      {
        characterId: 1002,
        characterName: "Elara Moonwhisper",
        userId: 11,
        username: "player2",
      },
      {
        characterId: 1003,
        characterName: "Grimjaw",
        userId: 12,
        username: "player3",
      },
    ],
  },
  {
    id: 102,
    name: "Curse of Strahd",
    dmId: 2,
    dmUsername: "DarkDM",
    characters: [
      {
        characterId: 2001,
        characterName: "Van Helsing",
        userId: 20,
        username: "hunter",
      },
    ],
  },
];

describe("campaign tools", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
    vi.clearAllMocks();
  });

  describe("listCampaigns", () => {
    it("shouldFormatCampaignListCorrectly", async () => {
      vi.mocked(mockClient.get).mockResolvedValue(sampleCampaigns);

      const result = await listCampaigns(mockClient);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Active Campaigns:");
      expect(result.content[0].text).toContain("Lost Mines of Phandelver");
      expect(result.content[0].text).toContain("DM: DungeonMaster");
      expect(result.content[0].text).toContain("3 players");
      expect(result.content[0].text).toContain("Curse of Strahd");
      expect(result.content[0].text).toContain("DM: DarkDM");
      expect(result.content[0].text).toContain("1 player");
    });

    it("shouldHandleEmptyCampaignList", async () => {
      vi.mocked(mockClient.get).mockResolvedValue([]);

      const result = await listCampaigns(mockClient);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("No active campaigns found.");
    });

    it("shouldUseCampaignCacheKey", async () => {
      vi.mocked(mockClient.get).mockResolvedValue(sampleCampaigns);

      await listCampaigns(mockClient);

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        "campaigns",
        expect.any(Number)
      );
    });
  });

  describe("getCampaignCharacters", () => {
    it("shouldReturnFormattedPartyRoster", async () => {
      vi.mocked(mockClient.get).mockResolvedValue(sampleCampaigns);

      const result = await getCampaignCharacters(mockClient, { campaignId: 101 });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain('Party Roster for "Lost Mines of Phandelver"');
      expect(result.content[0].text).toContain("Thorin Stonehammer (player1)");
      expect(result.content[0].text).toContain("Elara Moonwhisper (player2)");
      expect(result.content[0].text).toContain("Grimjaw (player3)");
    });

    it("shouldHandleCampaignNotFound", async () => {
      vi.mocked(mockClient.get).mockResolvedValue(sampleCampaigns);

      const result = await getCampaignCharacters(mockClient, { campaignId: 999 });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("Campaign 999 not found.");
    });

    it("shouldHandleCampaignWithNoCharacters", async () => {
      vi.mocked(mockClient.get).mockResolvedValue([
        {
          id: 103,
          name: "Empty Campaign",
          dmId: 3,
          dmUsername: "NewDM",
          characters: [],
        },
      ]);

      const result = await getCampaignCharacters(mockClient, { campaignId: 103 });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe('Campaign "Empty Campaign" has no characters yet.');
    });

    it("shouldUseCampaignSpecificCacheKey", async () => {
      vi.mocked(mockClient.get).mockResolvedValue(sampleCampaigns);

      await getCampaignCharacters(mockClient, { campaignId: 101 });

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        "campaign:101:characters",
        expect.any(Number)
      );
    });
  });
});
