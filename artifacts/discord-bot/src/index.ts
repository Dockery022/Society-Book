/**
 * The Society Book — Discord Bot Entry Point
 */

import "dotenv/config";
import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import type { BotClient, BotEvent, Command } from "./types.js";
import { commands } from "./commands/index.js";
import readyEvent from "./events/ready.js";
import interactionCreateEvent from "./events/interactionCreate.js";
import messageCreateEvent from "./events/messageCreate.js";
import messageReactionAddEvent from "./events/messageReactionAdd.js";
import guildMemberAddEvent from "./events/guildMemberAdd.js";

// ─── Validate Required Environment Variables ──────────────────────────────────

const requiredEnvVars = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DATABASE_URL"];
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
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
}) as BotClient;

// ─── Register Commands ────────────────────────────────────────────────────────

client.commands = new Collection<string, Command>();
for (const command of commands) {
  client.commands.set(command.data.name, command);
  console.log(`[Commands] Registered: /${command.data.name}`);
}

// ─── Register Event Handlers ──────────────────────────────────────────────────

const eventModules: BotEvent[] = [
  readyEvent,
  interactionCreateEvent,
  messageCreateEvent,
  messageReactionAddEvent,
  guildMemberAddEvent,
];

for (const event of eventModules) {
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

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

process.on("SIGTERM", () => {
  console.log("[Bot] SIGTERM received — shutting down gracefully.");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[Bot] SIGINT received — shutting down gracefully.");
  process.exit(0);
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
console.log("[Bot] Starting The Society Book…");
await client.login(process.env.DISCORD_TOKEN);
