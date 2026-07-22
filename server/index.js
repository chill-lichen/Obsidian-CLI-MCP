#!/usr/bin/env node
/**
 * obsidian-cli-mcp — zero-dependency MCP stdio server that wraps the official
 * Obsidian CLI. Add it to Claude Desktop's config as a local MCP server; its
 * tools are then available to Claude (including proxied Cowork cloud sessions).
 *
 * Requirements on this machine:
 *   - Obsidian app running, with the CLI enabled (Settings → General → Command line interface)
 *   - Node.js (any recent version)
 *
 * Env vars (optional):
 *   OBSIDIAN_BIN    path to the obsidian CLI binary (default: /usr/local/bin/obsidian, falls back to `obsidian` on PATH)
 *   OBSIDIAN_VAULT  default vault name to target (appended as vault=<name> when a tool call doesn't specify one)
 *   OBSIDIAN_TIMEOUT_MS  per-command timeout (default 60000)
 */

'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const readline = require('readline');

const BIN = process.env.OBSIDIAN_BIN
  || (fs.existsSync('/usr/local/bin/obsidian') ? '/usr/local/bin/obsidian' : 'obsidian');
const DEFAULT_VAULT = process.env.OBSIDIAN_VAULT || '';
const TIMEOUT = parseInt(process.env.OBSIDIAN_TIMEOUT_MS || '60000', 10);

const SERVER_INFO = { name: 'obsidian-cli', version: '1.0.1' };
const PROTOCOL_VERSION = '2025-06-18';

const TOOLS = [
  {
    name: 'obsidian_cli',
    description:
      'Run the official Obsidian CLI with arbitrary arguments against the running Obsidian app. ' +
      'Pass arguments as an array using the CLI\'s key=value property syntax, e.g. ["help"], ' +
      '["search", "query=meeting"], ["daily"], ["create", "name=My Note"], ' +
      'or developer commands like eval for executing JavaScript inside the app ' +
      '(which can call any plugin API — Dataview, Excalidraw, Smart Connections, graph view). ' +
      'Run ["help"] first to discover available commands. ' +
      'vault=<name> is appended automatically if OBSIDIAN_VAULT is set and no vault= arg is given ' +
      '(skipped for help/version). Boolean flags use double-dash, e.g. --silent.',
    inputSchema: {
      type: 'object',
      properties: {
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Arguments passed to the obsidian binary, one array element per token.'
        },
        stdin: {
          type: 'string',
          description: 'Optional text piped to the command\'s stdin (for commands that read input).'
        }
      },
      required: ['args']
    }
  },
  {
    name: 'obsidian_help',
    description: 'Shortcut for `obsidian help` — lists all available CLI commands. Call this first in a session to discover capabilities.',
    inputSchema: { type: 'object', properties: {} }
  }
];

function runObsidian(args, stdinText) {
  return new Promise((resolve) => {
    const finalArgs = [...args];
    // Official Obsidian CLI uses key=value property syntax (vault="name"), not --vault flags.
    const NO_VAULT_COMMANDS = new Set(['help', 'version', '--version', '-v']);
    const hasVaultArg = finalArgs.some(a => a.startsWith('vault='));
    if (DEFAULT_VAULT && !hasVaultArg && !NO_VAULT_COMMANDS.has(finalArgs[0])) {
      finalArgs.push(`vault=${DEFAULT_VAULT}`);
    }
    const child = execFile(BIN, finalArgs, { timeout: TIMEOUT, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let text = '';
        if (stdout) text += stdout;
        if (stderr) text += (text ? '\n--- stderr ---\n' : '') + stderr;
        if (err && !err.killed && err.code !== 0) {
          text = `[exit code ${err.code ?? 'unknown'}]` + (text ? '\n' + text : '\n' + String(err.message));
        } else if (err && err.killed) {
          text = `[timed out after ${TIMEOUT}ms]` + (text ? '\n' + text : '');
        }
        resolve(text || '[no output]');
      });
    if (stdinText != null && child.stdin) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }
  });
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}
function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO
    });
  } else if (method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) {
    // notifications need no response
  } else if (method === 'ping') {
    reply(id, {});
  } else if (method === 'tools/list') {
    reply(id, { tools: TOOLS });
  } else if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    try {
      let text;
      if (name === 'obsidian_cli') {
        if (!Array.isArray(args.args)) throw new Error('args must be an array of strings');
        text = await runObsidian(args.args.map(String), args.stdin);
      } else if (name === 'obsidian_help') {
        text = await runObsidian(['help']);
      } else {
        replyError(id, -32602, `Unknown tool: ${name}`);
        return;
      }
      reply(id, { content: [{ type: 'text', text }], isError: false });
    } catch (e) {
      reply(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
    }
  } else if (id !== undefined) {
    replyError(id, -32601, `Method not found: ${method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  Promise.resolve(handle(msg)).catch(() => {});
});
rl.on('close', () => process.exit(0));
