import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { TtlCache } from "../../src/cache/lru.js";
import { CircuitBreaker, RateLimiter } from "../../src/resilience/index.js";
import { DdbClient } from "../../src/api/client.js";
import { registerAllPrompts } from "../../src/prompts/index.js";
import { registerCharacterResources } from "../../src/resources/character.js";
import { registerCampaignResources } from "../../src/resources/campaign.js";
import { setupAuth, checkAuth } from "../../src/tools/auth.js";
import {
  getCharacter,
  listCharacters,
  updateHp,
} from "../../src/tools/character.js";
import { listCampaigns } from "../../src/tools/campaign.js";
import * as auth from "../../src/api/auth.js";

/**
 * Create a server instance with all tools, resources, and prompts registered.
 * This mirrors the setup in src/server.ts but without connecting to stdio.
 */
function createTestServer(): { server: McpServer; client: DdbClient } {
  const cache = new TtlCache<unknown>(60_000);
  const circuitBreaker = new CircuitBreaker(5, 30_000);
  // Use a much faster rate limiter for tests (1000 req/sec instead of 2 req/sec)
  const rateLimiter = new RateLimiter(1000, 1);
  const client = new DdbClient(cache, circuitBreaker, rateLimiter);

  const server = new McpServer({
    name: "dndbeyond-mcp",
    version: "0.1.0",
  });

  // Register all prompts
  registerAllPrompts(server);

  // Register all resources
  registerCharacterResources(server, client);
  registerCampaignResources(server, client);

  // Register a subset of tools for testing
  server.tool(
    "check_auth",
    "Check authentication status",
    {},
    async () => checkAuth(client)
  );

  server.tool(
    "list_campaigns",
    "List all active campaigns",
    {},
    async () => listCampaigns(client)
  );

  server.tool(
    "list_characters",
    "List all characters",
    {},
    async () => listCharacters(client)
  );

  server.tool(
    "get_character",
    "Get character details",
    {
      characterId: z.number().optional(),
      characterName: z.string().optional(),
    },
    async (params) =>
      getCharacter(client, {
        characterId: params.characterId,
        characterName: params.characterName,
      })
  );

  server.tool(
    "update_hp",
    "Update character HP",
    {
      characterId: z.number(),
      hpChange: z.number(),
    },
    async (params) =>
      updateHp(client, {
        characterId: params.characterId,
        hpChange: params.hpChange,
      })
  );

  return { server, client };
}

describe("MCP Server Integration", () => {
  let server: McpServer;
  let mcpClient: DdbClient;
  let client: Client;
  let serverTransport: InMemoryTransport;
  let clientTransport: InMemoryTransport;

  beforeEach(() => {
    // Mock auth functions used by DdbClient.buildHeaders
    vi.spyOn(auth, "getCobaltSession").mockResolvedValue("mock-session-token");
    vi.spyOn(auth, "getCobaltToken").mockResolvedValue("mock-bearer-token");
    vi.spyOn(auth, "getAllCookies").mockResolvedValue([
      { name: "CobaltSession", value: "mock-session" },
    ]);
  });

  beforeAll(async () => {
    const testServer = createTestServer();
    server = testServer.server;
    mcpClient = testServer.client;

    // Create in-memory transport pair
    [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

    // Connect server and client
    await server.connect(serverTransport);
    client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it("should initialize the server successfully", () => {
    expect(server).toBeDefined();
    expect(mcpClient).toBeDefined();
  });

  it("should list all registered tools", async () => {
    const response = await client.listTools();
    expect(response.tools).toBeDefined();
    expect(response.tools.length).toBeGreaterThan(0);

    const toolNames = response.tools.map((tool) => tool.name);
    expect(toolNames).toContain("check_auth");
    expect(toolNames).toContain("list_campaigns");
    expect(toolNames).toContain("list_characters");
    expect(toolNames).toContain("get_character");
    expect(toolNames).toContain("update_hp");
  });

  it("should list all registered resources", async () => {
    const response = await client.listResources();
    expect(response.resources).toBeDefined();
    expect(response.resources.length).toBeGreaterThan(0);

    const resourceUris = response.resources.map((r) => r.uri);
    expect(resourceUris).toContain("dndbeyond://characters");
    expect(resourceUris).toContain("dndbeyond://campaigns");
  });

  it("should list all registered prompts", async () => {
    const response = await client.listPrompts();
    expect(response.prompts).toBeDefined();
    expect(response.prompts.length).toBeGreaterThan(0);

    const promptNames = response.prompts.map((p) => p.name);
    expect(promptNames).toContain("character-summary");
    expect(promptNames).toContain("session-prep");
    expect(promptNames).toContain("encounter-builder");
    expect(promptNames).toContain("spell-advisor");
    expect(promptNames).toContain("level-up-guide");
    expect(promptNames).toContain("rules-lookup");
  });

  it("should execute check_auth tool with mocked API", async () => {
    // Mock the global fetch to avoid actual HTTP calls
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;

    try {
      const response = await client.callTool({
        name: "check_auth",
        arguments: {},
      });

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.content[0]).toHaveProperty("type", "text");
      expect(response.content[0]).toHaveProperty("text");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should execute list_campaigns tool with mocked API", async () => {
    // Mock successful API response (status envelope for Waterdeep/campaign endpoints)
    const mockCampaigns = {
      status: "success",
      data: [
        {
          id: 1,
          name: "Test Campaign",
          dmUsername: "TestDM",
          characters: [
            { characterId: 101, characterName: "TestChar1", username: "Player1" },
            { characterId: 102, characterName: "TestChar2", username: "Player2" },
          ],
        },
      ],
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCampaigns,
    }) as unknown as typeof fetch;

    try {
      const response = await client.callTool({
        name: "list_campaigns",
        arguments: {},
      });

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0]).toHaveProperty("type", "text");

      const text = (response.content[0] as { text: string }).text;
      expect(text).toContain("Test Campaign");
      expect(text).toContain("TestDM");
      expect(text).toContain("2 players");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should read a resource with mocked API", async () => {
    // Mock successful API response for campaigns (status envelope)
    const mockCampaigns = {
      status: "success",
      data: [
        {
          id: 1,
          name: "Test Campaign",
          dmUsername: "TestDM",
          characters: [],
        },
      ],
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCampaigns,
    }) as unknown as typeof fetch;

    try {
      const response = await client.readResource({
        uri: "dndbeyond://campaigns",
      });

      expect(response).toBeDefined();
      expect(response.contents).toBeDefined();
      expect(Array.isArray(response.contents)).toBe(true);
      expect(response.contents[0]).toHaveProperty("uri", "dndbeyond://campaigns");
      expect(response.contents[0]).toHaveProperty("text");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should get a prompt with arguments", async () => {
    const response = await client.getPrompt({
      name: "character-summary",
      arguments: {
        characterName: "TestCharacter",
      },
    });

    expect(response).toBeDefined();
    expect(response.messages).toBeDefined();
    expect(Array.isArray(response.messages)).toBe(true);
    expect(response.messages.length).toBeGreaterThan(0);
    expect(response.messages[0]).toHaveProperty("role", "user");
    expect(response.messages[0].content).toHaveProperty("type", "text");

    const messageText = (response.messages[0].content as { text: string }).text;
    expect(messageText).toContain("TestCharacter");
  });
});
