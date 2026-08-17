---
description: Install vibe-harness into an AI client (rules + MCP server + skills)
---

Run `npx @vibeharness/cli install` at the project root; pass the client id (`claude-code`, `cursor`, `opencode`, `vscode-copilot`, `windsurf`, `antigravity`, `qwen`) to skip the prompt.
It writes the client rules file, registers the vibe-harness MCP server in the client config and installs extras (skills/slash commands). After it finishes, the user can immediately use VibeHarness tools.
