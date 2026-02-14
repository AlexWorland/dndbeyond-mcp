import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerRulesLookupPrompt(server: McpServer): void {
  server.prompt(
    "rules-lookup",
    "Clarify D&D 5e rules questions using available reference tools",
    {
      question: z.string().describe("The rules question to answer"),
    },
    async (args) => {
      const question = args.question;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Answer this D&D 5e rules question: "${question}"

Please:
1. Use available reference tools to look up relevant information:
   - search_spells / get_spell for spell mechanics
   - get_condition for condition effects
   - search_classes for class/subclass features
   - search_feats for feat details
2. Provide a clear, authoritative answer based on official 5e rules
3. Include any relevant mechanics, DC calculations, or timing considerations
4. Note common misconceptions if applicable
5. Cite the specific rules source when possible

Focus on accurate, practical guidance that can be applied immediately at the table.`,
            },
          },
        ],
      };
    }
  );
}
