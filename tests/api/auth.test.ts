import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  getCobaltSession,
  saveCobaltSession,
  buildAuthHeaders,
  isAuthenticated,
} from "../../src/api/auth.js";

vi.mock("node:fs/promises");

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getCobaltSession", () => {
    it("shouldReturnNullWhenNoConfigFileExists", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT: no such file or directory"));

      const result = await getCobaltSession();

      expect(result).toBeNull();
    });

    it("shouldReturnSessionWhenConfigFileExists", async () => {
      const mockConfig = JSON.stringify({
        cobaltSession: "test-session-123",
        savedAt: "2026-02-13T10:00:00.000Z",
      });
      mockReadFile.mockResolvedValue(mockConfig);

      const result = await getCobaltSession();

      expect(result).toBe("test-session-123");
      expect(mockReadFile).toHaveBeenCalledWith(
        join(homedir(), ".dndbeyond-mcp", "config.json"),
        "utf-8"
      );
    });

    it("shouldReturnNullWhenConfigFileIsInvalid", async () => {
      mockReadFile.mockResolvedValue("invalid json");

      const result = await getCobaltSession();

      expect(result).toBeNull();
    });

    it("shouldReturnNullWhenCobaltSessionIsEmpty", async () => {
      const mockConfig = JSON.stringify({
        cobaltSession: "",
        savedAt: "2026-02-13T10:00:00.000Z",
      });
      mockReadFile.mockResolvedValue(mockConfig);

      const result = await getCobaltSession();

      expect(result).toBeNull();
    });
  });

  describe("saveCobaltSession", () => {
    it("shouldCreateDirectoryAndSaveConfig", async () => {
      const testCookie = "my-cobalt-session-456";
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await saveCobaltSession(testCookie);

      expect(mockMkdir).toHaveBeenCalledWith(
        join(homedir(), ".dndbeyond-mcp"),
        { recursive: true }
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        join(homedir(), ".dndbeyond-mcp", "config.json"),
        expect.stringContaining("my-cobalt-session-456"),
        "utf-8"
      );
    });

    it("shouldSaveConfigWithCorrectStructure", async () => {
      const testCookie = "session-789";
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await saveCobaltSession(testCookie);

      const writeCall = mockWriteFile.mock.calls[0];
      const savedContent = writeCall[1] as string;
      const savedConfig = JSON.parse(savedContent);

      expect(savedConfig.cobaltSession).toBe("session-789");
      expect(savedConfig.savedAt).toBeDefined();
      expect(new Date(savedConfig.savedAt).toString()).not.toBe("Invalid Date");
    });
  });

  describe("buildAuthHeaders", () => {
    it("shouldReturnCorrectHeaders", () => {
      const headers = buildAuthHeaders("test-session-abc");

      expect(headers).toEqual({
        Cookie: "CobaltSession=test-session-abc",
        Accept: "application/json",
        "Content-Type": "application/json",
      });
    });

    it("shouldIncludeAllRequiredHeaderFields", () => {
      const headers = buildAuthHeaders("any-session");

      expect(headers).toHaveProperty("Cookie");
      expect(headers).toHaveProperty("Accept");
      expect(headers).toHaveProperty("Content-Type");
    });
  });

  describe("isAuthenticated", () => {
    it("shouldReturnFalseWhenNoSession", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const result = await isAuthenticated();

      expect(result).toBe(false);
    });

    it("shouldReturnTrueWhenSessionExists", async () => {
      const mockConfig = JSON.stringify({
        cobaltSession: "valid-session",
        savedAt: "2026-02-13T10:00:00.000Z",
      });
      mockReadFile.mockResolvedValue(mockConfig);

      const result = await isAuthenticated();

      expect(result).toBe(true);
    });

    it("shouldReturnFalseWhenSessionIsEmpty", async () => {
      const mockConfig = JSON.stringify({
        cobaltSession: "",
        savedAt: "2026-02-13T10:00:00.000Z",
      });
      mockReadFile.mockResolvedValue(mockConfig);

      const result = await isAuthenticated();

      expect(result).toBe(false);
    });
  });
});
