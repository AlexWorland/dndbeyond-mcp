import { describe, it, expect, vi } from "vitest";
import { registerCampaignResources } from "../../src/resources/campaign.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCampaign } from "../../src/types/api.js";
import { HttpError } from "../../src/resilience/index.js";

function createMockClient(): DdbClient {
  return {
    get: vi.fn(),
    getRaw: vi.fn(),
  } as unknown as DdbClient;
}

const mockCampaigns: DdbCampaign[] = [
  {
    id: 999,
    name: "Lost Mines of Phandelver",
    dmId: 1,
    dmUsername: "dm_user",
    playerCount: 4,
    dateCreated: "1/1/2026",
  },
  {
    id: 888,
    name: "Curse of Strahd",
    dmId: 1,
    dmUsername: "dm_user",
    playerCount: 3,
    dateCreated: "2/1/2026",
  },
];

const mockCampaignCharacters = [
  {
    id: 12345,
    name: "Thorin Ironforge",
    userId: 2,
    userName: "player1",
    avatarUrl: "",
    characterStatus: 1,
    isAssigned: true,
  },
  {
    id: 67890,
    name: "Elara Moonshadow",
    userId: 3,
    userName: "player2",
    avatarUrl: "",
    characterStatus: 1,
    isAssigned: true,
  },
];

// registerCampaignResources calls server.registerResource(name, uri, opts, handler)
function createMockServer() {
  const handlers: Record<string, Function> = {};
  const mockServer = {
    resource: vi.fn(),
    registerResource: vi.fn((name: string, _uri: unknown, _opts: unknown, handler: Function) => {
      handlers[name] = handler;
    }),
  };
  return { mockServer, handlers };
}

describe("Campaign Resources", () => {
  it("should format campaigns list", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.get).mockResolvedValue(mockCampaigns);

    const { mockServer, handlers } = createMockServer();
    registerCampaignResources(mockServer as any, mockClient);

    // campaigns handler takes no args (static resource)
    const result = await handlers["campaigns"]();

    expect(result.contents).toHaveLength(1);
    const text = result.contents[0].text;
    expect(text).toContain("Lost Mines of Phandelver");
    expect(text).toContain("Curse of Strahd");
    expect(text).toContain("dm_user");
  });

  it("should use correct cache key for campaigns list (not campaign-specific)", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.get).mockResolvedValue(mockCampaigns);

    const { mockServer, handlers } = createMockServer();
    registerCampaignResources(mockServer as any, mockClient);

    await handlers["campaigns"]();

    // client.get(url, cacheKey, ttl) — verify 2nd arg is "campaigns"
    expect(mockClient.get).toHaveBeenCalledWith(
      expect.any(String),
      "campaigns",
      expect.any(Number)
    );
  });

  it("should use correct cache key for campaign party fetch", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters);

    const { mockServer, handlers } = createMockServer();
    registerCampaignResources(mockServer as any, mockClient);

    // party handler receives a URI object with .toString()
    const uri = { toString: () => "dndbeyond://campaign/999/party" };
    await handlers["campaign-party"](uri);

    // First call: campaign list with cache key "campaigns" (the bug fix)
    expect(mockClient.get).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      "campaigns",
      expect.any(Number)
    );

    // Second call: campaign characters
    expect(mockClient.get).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      "campaign:999:characters",
      expect.any(Number)
    );
  });

  it("should format campaign party correctly", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters);

    const { mockServer, handlers } = createMockServer();
    registerCampaignResources(mockServer as any, mockClient);

    const uri = { toString: () => "dndbeyond://campaign/999/party" };
    const result = await handlers["campaign-party"](uri);

    expect(result.contents).toHaveLength(1);
    const text = result.contents[0].text;
    expect(text).toContain("Lost Mines of Phandelver");
    expect(text).toContain("Thorin Ironforge");
    expect(text).toContain("Elara Moonshadow");
  });

  it("should return error for invalid URI in campaign party handler", async () => {
    const mockClient = createMockClient();

    const { mockServer, handlers } = createMockServer();
    registerCampaignResources(mockServer as any, mockClient);

    const uri = { toString: () => "dndbeyond://campaign/invalid/party" };
    const result = await handlers["campaign-party"](uri);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Invalid campaign party URI format");
  });

  it("should handle HttpError in campaigns list", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.get).mockRejectedValue(new HttpError("API error", 500));

    const { mockServer, handlers } = createMockServer();
    registerCampaignResources(mockServer as any, mockClient);

    const result = await handlers["campaigns"]();

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Error:");
    expect(result.contents[0].text).toContain("API error");
  });

  it("should handle HttpError in campaign party", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.get).mockRejectedValue(new HttpError("API error", 500));

    const { mockServer, handlers } = createMockServer();
    registerCampaignResources(mockServer as any, mockClient);

    const uri = { toString: () => "dndbeyond://campaign/999/party" };
    const result = await handlers["campaign-party"](uri);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Error:");
    expect(result.contents[0].text).toContain("API error");
  });
});
