# The Society Book 🎰

A virtual sportsbook Discord bot for **The 1912 Society** server, built with Discord.js v14 and TypeScript. Users earn **1912 Coins** through activity and use them to wager on real sports games via The Odds API.

---

## Features

- 🪙 **Coin Economy** — Earn coins by chatting, reacting, and claiming daily rewards
- 🏈 **Live Sportsbook** — Real odds from The Odds API (NFL, NCAA Football, NBA, NCAA Basketball, MLB)
- 🎰 **Multi-Step Betting** — Moneyline, Spread, and Over/Under markets
- 🤖 **Auto-Settlement** — Bets settle automatically every 15 minutes once games complete
- 🏆 **Leaderboard** — Sortable rankings by balance, profit, win rate, and total bets
- 👑 **Admin Tools** — Full admin command suite with audit logging

---

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo>
cd your-repo
pnpm install
```

### 2. Set environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID from Discord Developer Portal |
| `DISCORD_GUILD_ID` | Your server's ID (for instant command registration in dev) |
| `PREMIUM_ROLE_ID` | Role ID that grants premium status (optional) |
| `ODDS_API_KEY` | API key from [The Odds API](https://the-odds-api.com/) |
| `DB_PATH` | Path to SQLite database file (default: `./data/society_book.db`) |

### 3. Register slash commands

```bash
pnpm --filter @workspace/discord-bot run deploy-commands
```

> **Tip:** With `DISCORD_GUILD_ID` set, commands appear instantly. Without it, global commands take up to 1 hour.

### 4. Start the bot

```bash
pnpm --filter @workspace/discord-bot run dev
```

---

## Discord Developer Portal Setup

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Create a **New Application** → name it "The Society Book"
3. Go to **Bot** → click **Add Bot** → copy the **Token**
4. Enable these **Privileged Gateway Intents**:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
5. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Read Message History`, `Add Reactions`, `Use Slash Commands`
6. Use the generated URL to invite the bot to your server

---

## Commands

### User Commands

| Command | Description |
|---|---|
| `/coins` | Check your balance and betting stats |
| `/daily` | Claim daily coin reward |
| `/game sport:<sport>` | Browse upcoming games with live odds |
| `/bet` | Place a wager (multi-step interactive flow) |
| `/mybets [status]` | View your open/historical bets |
| `/history [limit]` | View settled bets with profit/loss |
| `/leaderboard` | Top 10 players (sortable) |

### Admin Commands

| Command | Description |
|---|---|
| `/addcoins @user <amount>` | Add coins to a user |
| `/removecoins @user <amount>` | Remove coins from a user |
| `/settlebet <id> <outcome>` | Manually settle a bet (won/lost/void) |
| `/cancelbet <id>` | Cancel a pending bet and refund |
| `/lockbets` | Prevent new bets from being placed |
| `/unlockbets` | Allow betting again |

---

## Coin Economy

| Action | Coins | Cooldown |
|---|---|---|
| Sending a message | +10 | 60 seconds |
| Giving a reaction | +2 | 30 seconds |
| Receiving a reaction | +5 | None |
| Daily reward (Free) | +25 | 24 hours |
| Daily reward (Premium) | +100 | 24 hours |
| Starting balance | 500 | — |

### Betting Limits

| Tier | Max Wager |
|---|---|
| Free | 1,000 coins |
| Premium | 5,000 coins |

Set the `PREMIUM_ROLE_ID` environment variable to your premium role's ID. Members with that role get the premium tier benefits.

---

## Supported Sports & Bet Types

**Sports:** NFL · NCAA Football · NBA · NCAA Basketball · MLB

**Markets:**
- **Moneyline** — Pick the outright winner
- **Spread** — Bet against the point spread
- **Over/Under** — Bet on total combined score

---

## Auto-Settlement

The bot automatically checks game scores via The Odds API every **15 minutes**. When a game completes:

- Winning bets are paid out (wager + profit)
- Losing bets are deducted (already done at placement)
- Push/tie bets are refunded

Admins can also manually settle individual bets with `/settlebet`.

---

## Database

SQLite is used by default for simplicity. The schema is structured to migrate to PostgreSQL easily:

- All queries use parameterized statements (no raw SQL concatenation)
- Timestamps stored as Unix integers (compatible with both)
- To migrate: replace `better-sqlite3` with `pg` and update `database/index.ts`

---

## Deployment (Railway)

1. Push your code to GitHub
2. Create a new Railway project → **Deploy from GitHub**
3. Add all environment variables from `.env` in Railway's dashboard
4. Railway auto-detects the start command from `package.json`

> **Note:** Railway's free tier may restart the bot periodically. The SQLite database persists as long as you use a Railway Volume for the `./data/` directory.

---

## Project Structure

```
src/
├── index.ts              # Entry point
├── types.ts              # TypeScript interfaces
├── deploy-commands.ts    # Slash command registration script
├── commands/
│   ├── index.ts          # Command registry
│   ├── coins.ts
│   ├── daily.ts
│   ├── leaderboard.ts
│   ├── bet.ts            # Multi-step betting flow
│   ├── mybets.ts
│   ├── history.ts
│   ├── game.ts
│   └── admin/
│       ├── addcoins.ts
│       ├── removecoins.ts
│       ├── settlebet.ts
│       ├── cancelbet.ts
│       ├── lockbets.ts
│       └── unlockbets.ts
├── events/
│   ├── ready.ts
│   ├── interactionCreate.ts
│   ├── messageCreate.ts
│   └── messageReactionAdd.ts
├── services/
│   ├── coinService.ts
│   ├── bettingService.ts
│   ├── oddsService.ts
│   └── settlementService.ts
├── database/
│   └── index.ts          # SQLite setup + schema
└── utils/
    ├── formatters.ts
    ├── embeds.ts
    └── permissions.ts
```

---

## Anti-Abuse

- **Message cooldown:** 60-second cooldown prevents coin farming from rapid messaging
- **Reaction cooldown:** 30-second cooldown per user for giving reactions
- **Bet limits:** Maximum wager enforced per tier
- **Admin audit log:** All admin actions are logged to the database
- **No transfers:** Coins cannot be sent, gifted, or traded between users

---

## License

MIT — built for The 1912 Society Discord server.
