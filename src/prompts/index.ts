import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCharacterSummaryPrompt } from "./character-summary.js";
import { registerSessionPrepPrompt } from "./session-prep.js";
import { registerEncounterBuilderPrompt } from "./encounter-builder.js";
import { registerSpellAdvisorPrompt } from "./spell-advisor.js";
import { registerLevelUpGuidePrompt } from "./level-up-guide.js";
import { registerRulesLookupPrompt } from "./rules-lookup.js";

export function registerAllPrompts(server: McpServer): void {
  registerCharacterSummaryPrompt(server);
  registerSessionPrepPrompt(server);
  registerEncounterBuilderPrompt(server);
  registerSpellAdvisorPrompt(server);
  registerLevelUpGuidePrompt(server);
  registerRulesLookupPrompt(server);
}
