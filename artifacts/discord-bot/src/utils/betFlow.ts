/**
 * betFlow.ts — Shared bet placement flow used by both /bet and /game.
 *
 * showSelectionMenu  → pick team/over/under for a market
 * showAmountModal    → enter wager amount via modal
 */

import {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  EmbedBuilder,
  AttachmentBuilder,
  type MessageComponentInteraction,
  type StringSelectMenuInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { OddsApiGame } from "../types.js";
import { calcPotentialReturn, formatOdds } from "../services/oddsService.js";
import { placeBet } from "../services/bettingService.js";
import { getBalance, getMaxWager } from "../services/coinService.js";
import { isPremium, requireGuildMember } from "../utils/permissions.js";
import { buildBetSlipEmbed, buildErrorEmbed } from "../utils/embeds.js";
import { isoToUnix, formatCoins, formatDateTime } from "../utils/formatters.js";
import { generateMatchupImage } from "../utils/matchupImageGenerator.js";

const TIMEOUT_MS = 180_000;

export type MarketKey = "moneyline" | "spread" | "total";

const MARKET_LABELS: Record<MarketKey, string> = {
  moneyline: "💵 Moneyline",
  spread: "📊 Spread",
  total: "🔢 Over/Under",
};

// ─── Selection menu (team / over / under) ─────────────────────────────────────

export async function showSelectionMenu(
  interaction: MessageComponentInteraction,
  game: OddsApiGame,
  sportKey: string,
  marketKey: MarketKey,
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  const bm = game.bookmakers?.[0];
  const apiKey =
    marketKey === "total" ? "totals" : marketKey === "spread" ? "spreads" : "h2h";
  const market = bm?.markets.find((m) => m.key === apiKey);

  if (!market?.outcomes?.length) {
    await interaction.update({
      embeds: [buildErrorEmbed("No odds available for that market right now.")],
      components: [],
    });
    return;
  }

  const options = market.outcomes.map((outcome) => {
    const sign = (outcome.point ?? 0) >= 0 ? "+" : "";
    const label =
      marketKey === "total"
        ? `${outcome.name} ${outcome.point} (${formatOdds(outcome.price)})`
        : marketKey === "spread"
        ? `${outcome.name} ${sign}${outcome.point} (${formatOdds(outcome.price)})`
        : `${outcome.name} (${formatOdds(outcome.price)})`;

    return new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setValue(
        JSON.stringify({
          team: outcome.name,
          odds: outcome.price,
          line: outcome.point ?? null,
        })
      );
  });

  const selectionSelect = new StringSelectMenuBuilder()
    .setCustomId("bet_selection")
    .setPlaceholder("Choose your pick…")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectionSelect);
  const commence = isoToUnix(game.commence_time);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🎰 Place a Bet")
    .setDescription(
      [
        `**${game.away_team} @ ${game.home_team}**`,
        formatDateTime(commence),
        "",
        `${MARKET_LABELS[marketKey]} — Choose your **selection**.`,
      ].join("\n")
    )
    .setFooter({ text: "The 1912 Society Book" });

  const reply = await interaction.update({ embeds: [embed], components: [row] });

  const selectionCollector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: TIMEOUT_MS,
    max: 1,
    filter: (i) =>
      i.customId === "bet_selection" && i.user.id === originalInteraction.user.id,
  });

  selectionCollector.on("collect", async (selectInteraction) => {
    const raw = JSON.parse(selectInteraction.values[0]!) as {
      team: string;
      odds: number;
      line: number | null;
    };
    await showAmountModal(
      selectInteraction,
      game,
      sportKey,
      marketKey,
      raw,
      originalInteraction
    );
  });
}

// ─── Amount modal ─────────────────────────────────────────────────────────────

export async function showAmountModal(
  interaction: StringSelectMenuInteraction,
  game: OddsApiGame,
  sportKey: string,
  marketKey: MarketKey,
  selection: { team: string; odds: number; line: number | null },
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  const balance = await getBalance(originalInteraction.user.id);

  const modal = new ModalBuilder()
    .setCustomId("bet_amount_modal")
    .setTitle("Enter Wager Amount");

  const amountInput = new TextInputBuilder()
    .setCustomId("bet_amount_input")
    .setLabel(`Balance: ${Number(balance).toLocaleString()} coins`)
    .setPlaceholder("Enter amount (e.g. 250)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(6);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
  await interaction.showModal(modal);

  let modalInteraction;
  try {
    modalInteraction = await interaction.awaitModalSubmit({
      time: 120_000,
      filter: (m) =>
        m.customId === "bet_amount_modal" && m.user.id === originalInteraction.user.id,
    });
  } catch {
    return; // timed out
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

  const member = await requireGuildMember(originalInteraction);
  const premium = member ? isPremium(member) : false;
  const maxWager = getMaxWager(premium);

  if (amount > maxWager) {
    await originalInteraction.editReply({
      embeds: [
        buildErrorEmbed(
          `Maximum wager is **${formatCoins(maxWager)}**.${
            !premium ? "\nUpgrade to Premium for a 5,000 coin max wager!" : ""
          }`
        ),
      ],
      components: [],
    });
    return;
  }

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

  const result = await placeBet(originalInteraction.user.id, slip);

  if (!result.success || !result.bet) {
    await originalInteraction.editReply({
      embeds: [buildErrorEmbed(result.error ?? "Failed to place bet.")],
      components: [],
    });
    return;
  }

  const slipEmbed = buildBetSlipEmbed(result.bet);
  const username = originalInteraction.member
    ? (originalInteraction.member as import("discord.js").GuildMember).displayName
    : originalInteraction.user.username;
  slipEmbed.setTitle(`✅ Bet placed by ${username}`);

  try {
    const imgBuffer = await generateMatchupImage(game.away_team, game.home_team, sportKey);
    const attachment = new AttachmentBuilder(imgBuffer, { name: "matchup.png" });
    slipEmbed.setImage("attachment://matchup.png");
    await originalInteraction.editReply({ embeds: [slipEmbed], components: [], files: [attachment] });
  } catch {
    await originalInteraction.editReply({ embeds: [slipEmbed], components: [] });
  }
}
