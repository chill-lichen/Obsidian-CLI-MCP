# obsidian-cli-mcp

A zero-dependency [MCP](https://modelcontextprotocol.io) server + Claude Desktop extension
(`.mcpb`) that bridges an AI assistant to the **official [Obsidian CLI](https://obsidian.md/cli)**
— so Claude (or any MCP client) can drive your *running* Obsidian app: search, daily notes,
templates, Dataview queries, plugin APIs via JS eval, graph view, screenshots, and anything else
the CLI exposes.

> **⚠️ Disclaimer.** Independent community project — not affiliated with, endorsed by, or
> supported by Obsidian. Provided as is, no warranty (see [LICENSE](LICENSE)). The `eval`-style
> CLI commands let an AI assistant execute JavaScript inside your Obsidian app — review what you
> approve, and keep per-call tool approval on in your MCP client.

## Why

The official Obsidian CLI talks to the running Obsidian app over IPC — it is not a standalone
file tool. Wrapping it in an MCP server means an assistant can use the app's own engine
(Dataview index, plugin APIs, renderer) instead of just editing markdown files on disk. It also
works from sandboxed/cloud assistant sessions (e.g. Claude Cowork) where the assistant cannot
run local binaries itself: the MCP server runs on your machine and is proxied to the assistant.

## Tools exposed

| Tool | Description |
|---|---|
| `obsidian_cli` | Run the CLI with arbitrary arguments (`args` array, one token per element). Optional `stdin` string. |
| `obsidian_help` | Shortcut for `obsidian help` — discover available commands. |

The CLI uses `key=value` property syntax (e.g. `search query=meeting vault="My Vault"`);
double-dash is only for boolean flags (e.g. `--silent`). If a **Default vault name** is
configured, `vault=<name>` is appended automatically to every command that doesn't specify one
(skipped for `help`/`version`).

## Prerequisites

1. **Obsidian** with the CLI enabled: Settings → General → *Command line interface*, then follow
   the on-screen registration. Verify in a terminal: `obsidian help`. **The app must be running.**
2. **Node.js 18+** (Claude Desktop ships its own Node runtime; standalone MCP clients need Node
   on PATH).

## Install

### Option A — Claude Desktop extension (one click)

Download `dist/obsidian-cli.mcpb` (or grab it from Releases) and double-click it, or drag it
onto the Claude Desktop window. Then configure it under **Settings → Extensions → obsidian-cli**.

### Option B — any MCP client (config file)

Clone this repo, then point your client at `server/index.js`. For Claude Desktop that's
`claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows:
`%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "obsidian-cli": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-cli-mcp/server/index.js"],
      "env": {
        "OBSIDIAN_VAULT": "My Vault",
        "OBSIDIAN_BIN": "/usr/local/bin/obsidian"
      }
    }
  }
}
```

Restart your client fully, then try: *"run obsidian help"*.

## Configuration — adjust paths for your machine

All settings are optional. Set them in the extension's settings UI (Option A) or as `env` vars
(Option B):

| Setting / env var | Default | What to change it to |
|---|---|---|
| Default vault name / `OBSIDIAN_VAULT` | *(empty)* | The name of the vault to target when a command doesn't say — as shown in Obsidian's vault switcher. Leave empty to pass `vault=` explicitly per command. |
| Obsidian CLI path / `OBSIDIAN_BIN` | `/usr/local/bin/obsidian` | **macOS:** `/usr/local/bin/obsidian` (created by the app's CLI registration). **Linux:** `~/.local/bin/obsidian` — use the absolute path, e.g. `/home/you/.local/bin/obsidian`. **Windows:** the `Obsidian.com` redirector next to `Obsidian.exe`, e.g. `C:\Users\you\AppData\Local\Programs\Obsidian\Obsidian.com`. If unset and the default doesn't exist, the server falls back to `obsidian` on PATH. |
| `OBSIDIAN_TIMEOUT_MS` | `60000` | Per-command timeout in milliseconds (env-only; not in the extension UI). |

## Usage examples

Ask your assistant things like:

- "Run `obsidian help` and tell me what's available."
- "Search my vault for notes mentioning quarterly review."
- "Create today's daily note from my template."
- "Run this Dataview query across my projects folder." (requires the Dataview plugin; executed
  via the CLI's eval/dev commands)

## Building the .mcpb yourself

The bundle is just a zip of `manifest.json` + `server/`:

```bash
zip -r obsidian-cli.mcpb manifest.json server/
```

or use the official tooling: `npm i -g @anthropic-ai/mcpb && mcpb pack`.

## Security notes

- The `obsidian_cli` tool can run **any** CLI command, including developer commands that execute
  JavaScript inside the app. Keep it on "needs approval" in your client's tool permissions;
  `obsidian_help` is read-only and safe to always-allow.
- The server binds to nothing — it's pure stdio, spawned by your MCP client, and only ever
  executes the one configured binary.

## License

[BSD-3-Clause](LICENSE).
