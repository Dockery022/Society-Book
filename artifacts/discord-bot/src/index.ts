/**
 * The Society Book — Discord Bot Entry Point
 * A virtual sportsbook for The 1912 Society server.
 */

import "dotenv/config";
import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import type { BotClient, Command } from "./types.js";
import { commands } from "./commands/index.js";

// ─── Validate Required Environment Variables ──────────────────────────────────

const requiredEnvVars = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"];
for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`[Config] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ─── Create Client ────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ],
}) as BotClient;

// ─── Register Commands ────────────────────────────────────────────────────────

client.commands = new Collection<string, Command>();
for (const command of commands) {
  client.commands.set(command.data.name, command);
  console.log(`[Commands] Registered: /${command.data.name}`);
}

// ─── Register Event Handlers ──────────────────────────────────────────────────

const eventModules = [
  await import("./events/ready.js"),
  await import("./events/interactionCreate.js"),
  await import("./events/messageCreate.js"),
  await import("./events/messageReactionAdd.js"),
];

for (const mod of eventModules) {
  const event = mod.default;
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`[Events] Registered: ${event.name}`);
}

// ─── Error Handling ───────────────────────────────────────────────────────────

client.on("error", (error) => {
  console.error("[Client] WebSocket error:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Process] Uncaught exception:", error);
  process.exit(1);
});

// ─── Connect to Discord ───────────────────────────────────────────────────────

console.log("[Bot] Starting The Society Book…");
await client.login(process.env.DISCORD_TOKEN);
