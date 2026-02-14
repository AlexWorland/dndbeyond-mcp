#!/usr/bin/env node
import { startServer } from "./server.js";

startServer().catch((error) => {
  console.error("dndbeyond-mcp: fatal error:", error);
  process.exit(1);
});
