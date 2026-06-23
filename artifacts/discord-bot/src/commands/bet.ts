/**
 * /bet command — multi-step flow for placing wagers.
 *
 * Flow:
 *   1. User runs /bet → picks a sport via select menu
 *   2. Bot fetches games → user picks game
 *   3. Bot shows bet type buttons (Moneyline / Spread / Over-Under)
 *   4. Bot shows selection options based on market
 *   5. User enters amount via modal
 *   6. Bet placed, slip shown
 */

import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type MessageComponentInteraction,
} from "discord.js";
import type { Command, OddsApiGame } from "../types.js";
import { SUPPORTED_SPORTS, SPORT_EMOJIS } from "../types.js";
import {
  getGamesWithOdds,
  calcPotentialReturn,
  formatOdds,
} from "../services/oddsService.js";
import { placeBet, areBetsLocked } from "../services/bettingService.js";
import { getBalance, getMaxWager } from "../services/coinService.js";
import { isPremium, requireGuildMember } from "../utils/permissions.js";
import {
  buildBetSlipEmbed,
  buildErrorEmbed,
} from "../utils/embeds.js";
import { isoToUnix, formatCoins, formatDateTime } from "../utils/formatters.js";

// ─── Interaction timeout ──────────────────────────────────────────────────────

const TIMEOUT_MS = 180_000; // 3 minutes

// ─── Step 1: Sport selection ──────────────────────────────────────────────────

async function showSportSelect(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const select = new StringSelectMenuBuilder()
    .setCustomId("bet_sport")
    .setPlaceholder("Choose a sport…")
    .addOptions(
      Object.entries(SUPPORTED_SPORTS).map(([key, name]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(name)
          .setValue(key)
          .setEmoji(SPORT_EMOJIS[key] ?? "🏟️")
      )
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const embed = new EmbedBuilder()
    .setColor(0x1a2332)
    .setTitle("🎰 Place a Bet — Step 1 of 4")
    .setDescription("Select a **sport** to browse upcoming games.")
    .setFooter({ text: "The 1912 Society Book • This menu expires in 3 minutes" });

  const reply = await interaction.editReply({ embeds: [embed], components: [row] });

  // Collect sport selection
  const sportCollector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: TIMEOUT_MS,
    max: 1,
    filter: (i) => i.customId === "bet_sport" && i.user.id === interaction.user.id,
  });

  sportCollector.on("collect", async (sportInteraction) => {
    const sportKey = sportInteraction.values[0]!;
    await showGameSelect(sportInteraction, sportKey, interaction);
  });

  sportCollector.on("end", async (_, reason) => {
    if (reason === "time") {
      try {
        await interaction.editReply({ components: [] });
      } catch { /* ignored */ }
    }
  });
}

// ─── Step 2: Game selection ───────────────────────────────────────────────────

async function showGameSelect(
  interaction: StringSelectMenuInteraction,
  sportKey: string,
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  const loadingEmbed = new EmbedBuilder()
    .setColor(0x1a2332)
    .setTitle("🎰 Place a Bet — Step 2 of 4")
    .setDescription(`Fetching upcoming **${SUPPORTED_SPORTS[sportKey]}** games…`);

  await interaction.update({ embeds: [loadingEmbed], components: [] });

  let games: OddsApiGame[];
  try {
    games = await getGamesWithOdds(sportKey);
  } catch {
    await originalInteraction.editReply({
      embeds: [buildErrorEmbed("Failed to fetch games from The Odds API. Please try again later.")],
      components: [],
    });
    return;
  }

  const now = Date.now();
  const upcoming = games
    .filter((g) => new Date(g.commence_time).getTime() > now)
    .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
    .slice(0, 25);

  if (upcoming.length === 0) {
    await originalInteraction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setDescription(`No upcoming ${SUPPORTED_SPORTS[sportKey]} games available right now.`),
      ],
      components: [],
    });
    return;
  }

  const gameSelect = new StringSelectMenuBuilder()
    .setCustomId("bet_game")
    .setPlaceholder("Choose a game…")
    .addOptions(
      upcoming.map((g) => {
        const dt = new Date(g.commence_time).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        });
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${g.away_team} @ ${g.home_team}`)
          .setValue(g.id)
          .setDescription(dt + " ET");
      })
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameSelect);

  const embed = new EmbedBuilder()
    .setColor(0x1a2332)
    .setTitle("🎰 Place a Bet — Step 2 of 4")
    .setDescription(`**${SUPPORTED_SPORTS[sportKey]}** — Select a game to bet on.`)
    .setFooter({ text: "The 1912 Society Book" });

  const reply = await originalInteraction.editReply({ embeds: [embed], components: [row] });

  const gameCollector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: TIMEOUT_MS,
    max: 1,
    filter: (i) => i.customId === "bet_game" && i.user.id === originalInteraction.user.id,
  });

  gameCollector.on("collect", async (gameInteraction) => {
    const gameId = gameInteraction.values[0]!;
    const game = upcoming.find((g) => g.id === gameId)!;
    await showMarketSelect(gameInteraction, game, sportKey, originalInteraction);
  });
}

// ─── Step 3: Bet type selection ───────────────────────────────────────────────

async function showMarketSelect(
  interaction: StringSelectMenuInteraction,
  game: OddsApiGame,
  sportKey: string,
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  const commence = isoToUnix(game.commence_time);
  const embed = new EmbedBuilder()
    .setColor(0x1a2332)
    .setTitle("🎰 Place a Bet — Step 3 of 4")
    .setDescription(
      `**${game.away_team} @ ${game.home_team}**\n${formatDateTime(commence)}\n\nSelect a **market** to bet on.`
    )
    .setFooter({ text: "The 1912 Society Book" });

  const moneylineBtn = new ButtonBuilder()
    .setCustomId("bet_market_moneyline")
    .setLabel("💵 Moneyline")
    .setStyle(ButtonStyle.Primary);

  const spreadBtn = new ButtonBuilder()
    .setCustomId("bet_market_spread")
    .setLabel("📊 Spread")
    .setStyle(ButtonStyle.Primary);

  const totalBtn = new ButtonBuilder()
    .setCustomId("bet_market_total")
    .setLabel("🔢 Over/Under")
    .setStyle(ButtonStyle.Primary);

  const backBtn = new ButtonBuilder()
    .setCustomId("bet_back")
    .setLabel("← Back")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    moneylineBtn,
    spreadBtn,
    totalBtn,
    backBtn
  );

  const reply = await interaction.update({ embeds: [embed], components: [row] });

  const btnCollector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TIMEOUT_MS,
    max: 1,
    filter: (i) =>
      i.customId.startsWith("bet_market_") || i.customId === "bet_back"
        ? i.user.id === originalInteraction.user.id
        : false,
  });

  btnCollector.on("collect", async (btnInteraction) => {
    if (btnInteraction.customId === "bet_back") {
      await showSportSelect(originalInteraction);
      return;
    }

    const marketKey = btnInteraction.customId.replace("bet_market_", "") as
      | "moneyline"
      | "spread"
      | "total";

    await showSelectionMenu(btnInteraction, game, sportKey, marketKey, originalInteraction);
  });
}

// ─── Step 4a: Selection options ───────────────────────────────────────────────

async function showSelectionMenu(
  interaction: ButtonInteraction,
  game: OddsApiGame,
  sportKey: string,
  marketKey: "moneyline" | "spread" | "total",
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  const bm = game.bookmakers?.[0];
  const apiMarketKey = marketKey === "total" ? "totals" : marketKey === "spread" ? "spreads" : "h2h";
  const market = bm?.markets.find((m) => m.key === apiMarketKey);

  if (!market || !market.outcomes?.length) {
    await interaction.update({
      embeds: [buildErrorEmbed("No odds available for that market right now.")],
      components: [],
    });
    return;
  }

  const options = market.outcomes.map((outcome) => {
    const sign = outcome.point !== undefined ? (outcome.point >= 0 ? "+" : "") : "";
    const label =
      marketKey === "total"
        ? `${outcome.name} ${outcome.point} (${formatOdds(outcome.price)})`
        : marketKey === "spread"
        ? `${outcome.name} ${sign}${outcome.point} (${formatOdds(outcome.price)})`
        : `${outcome.name} (${formatOdds(outcome.price)})`;

    const value = JSON.stringify({
      team: outcome.name,
      odds: outcome.price,
      line: outcome.point ?? null,
    });

    return new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setValue(value);
  });

  const selectionSelect = new StringSelectMenuBuilder()
    .setCustomId("bet_selection")
    .setPlaceholder("Choose your pick…")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectionSelect);

  const commence = isoToUnix(game.commence_time);
  const marketLabels: Record<string, string> = {
    moneyline: "💵 Moneyline",
    spread: "📊 Spread",
    total: "🔢 Over/Under",
  };

  const embed = new EmbedBuilder()
    .setColor(0x1a2332)
    .setTitle("🎰 Place a Bet — Step 4 of 4")
    .setDescription(
      `**${game.away_team} @ ${game.home_team}**\n${formatDateTime(commence)}\n\n${marketLabels[marketKey]} — Choose your **selection**.`
    )
    .setFooter({ text: "The 1912 Society Book" });

  const reply = await interaction.update({ embeds: [embed], components: [row] });

  const selectionCollector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: TIMEOUT_MS,
    max: 1,
    filter: (i) => i.customId === "bet_selection" && i.user.id === originalInteraction.user.id,
  });

  selectionCollector.on("collect", async (selectInteraction) => {
    const raw = JSON.parse(selectInteraction.values[0]!) as {
      team: string;
      odds: number;
      line: number | null;
    };

    await showAmountModal(selectInteraction, game, sportKey, marketKey, raw, originalInteraction);
  });
}

// ─── Step 4b: Amount modal ────────────────────────────────────────────────────

async function showAmountModal(
  interaction: StringSelectMenuInteraction,
  game: OddsApiGame,
  sportKey: string,
  marketKey: "moneyline" | "spread" | "total",
  selection: { team: string; odds: number; line: number | null },
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  const balance = getBalance(originalInteraction.user.id);

  const modal = new ModalBuilder()
    .setCustomId("bet_amount_modal")
    .setTitle("Enter Wager Amount");

  const amountInput = new TextInputBuilder()
    .setCustomId("bet_amount_input")
    .setLabel(`Balance: ${balance.toLocaleString()} coins`)
    .setPlaceholder("Enter amount (e.g. 250)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(6);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
  modal.addComponents(row);

  await interaction.showModal(modal);

  // Wait for modal submission
  let modalInteraction: ModalSubmitInteraction;
  try {
    modalInteraction = await interaction.awaitModalSubmit({
      time: 120_000,
      filter: (m) =>
        m.customId === "bet_amount_modal" &&
        m.user.id === originalInteraction.user.id,
    });
  } catch {
    // Timed out
    return;
  }

  await modalInteraction.deferUpdate();

  const rawAmount = modalInteraction.fields.getTextInputValue("bet_amount_input");
  const amount = parseInt(rawAmount.replace(/[^0-9]/g, ""), 10);

  if (isNaN(amount) || amount <= 0) {
    await originalInteraction.editReply({
      embeds: [buildErrorEmbed("Invalid amount. Please enter a whole number greater than 0.")],
      components: [],
    });
    return;
  }

  // Check premium status for max wager
  const member = await requireGuildMember(originalInteraction);
  const premium = member ? isPremium(member) : false;
  const maxWager = getMaxWager(premium);

  if (amount > maxWager) {
    await originalInteraction.editReply({
      embeds: [
        buildErrorEmbed(
          `Maximum wager is **${formatCoins(maxWager)}**.\n${
            !premium ? "Upgrade to Premium for a 5,000 coin max wager!" : ""
          }`
        ),
      ],
      components: [],
    });
    return;
  }

  // Place the bet
  const slip = {
    gameId: game.id,
    sport: sportKey,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    commenceTime: isoToUnix(game.commence_time),
    betType: marketKey,
    team: selection.team,
    line: selection.line,
    odds: selection.odds,
    amount,
    potentialReturn: calcPotentialReturn(selection.odds, amount),
  };

  const result = placeBet(originalInteraction.user.id, slip);

  if (!result.success || !result.bet) {
    await originalInteraction.editReply({
      embeds: [buildErrorEmbed(result.error ?? "Failed to place bet.")],
      components: [],
    });
    return;
  }

  const slipEmbed = buildBetSlipEmbed(result.bet);
  slipEmbed.setTitle("✅ Bet Placed! — Bet Slip #" + result.bet.id);

  await originalInteraction.editReply({ embeds: [slipEmbed], components: [] });
}

// ─── Command Definition ───────────────────────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("bet")
    .setDescription("Place a wager on an upcoming game using 1912 Coins."),

  async execute(interaction) {
    if (areBetsLocked()) {
      await interaction.reply({
        content: "🔒 Betting is currently **locked** by an admin. Check back soon!",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: false });
    await showSportSelect(interaction);
  },
};

export default command;
