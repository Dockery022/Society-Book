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
  type AutocompleteInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { Command, OddsApiGame } from "../types.js";
import { SUPPORTED_SPORTS, SPORT_EMOJIS } from "../types.js";
import { getGamesWithOdds } from "../services/oddsService.js";
import { areBetsLocked } from "../services/bettingService.js";
import { buildGameEmbed, buildErrorEmbed } from "../utils/embeds.js";
import { isoToUnix } from "../utils/formatters.js";
import { showSelectionMenu, type MarketKey } from "../utils/betFlow.js";

// ── NCAA sports that support team search ──────────────────────────────────────
const NCAA_SPORTS = new Set(["americanfootball_ncaaf", "basketball_ncaab"]);

// ── Short-lived autocomplete cache (5-min TTL) ────────────────────────────────
const gameCache = new Map<string, { games: OddsApiGame[]; expires: number }>();

async function getCachedGames(sportKey: string): Promise<OddsApiGame[]> {
  const cached = gameCache.get(sportKey);
  if (cached && cached.expires > Date.now()) return cached.games;
  const games = await getGamesWithOdds(sportKey);
  gameCache.set(sportKey, { games, expires: Date.now() + 5 * 60 * 1000 });
  return games;
}

// ── Autocomplete handler ──────────────────────────────────────────────────────
async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const sportKey = interaction.options.getString("sport") ?? "";
  const query = interaction.options.getFocused().toLowerCase().trim();

  if (!NCAA_SPORTS.has(sportKey)) {
    await interaction.respond([]);
    return;
  }

  let games: OddsApiGame[];
  try {
    games = await getCachedGames(sportKey);
  } catch {
    await interaction.respond([]);
    return;
  }

  const now = Date.now();
  const upcoming = games.filter((g) => new Date(g.commence_time).getTime() > now);
  const teamSet = new Set<string>();
  for (const g of upcoming) {
    teamSet.add(g.home_team);
    teamSet.add(g.away_team);
  }

  const matches = [...teamSet]
    .filter((t) => !query || t.toLowerCase().includes(query))
    .sort()
    .slice(0, 25);

  await interaction.respond(matches.map((t) => ({ name: t, value: t })));
}

// ── Row builders ──────────────────────────────────────────────────────────────

function buildGameSelectRow(
  games: OddsApiGame[],
  sportKey: string,
  selectedId?: string,
  locked = false
) {
  const sportEmoji = SPORT_EMOJIS[sportKey] ?? "🏟️";
  const options: StringSelectMenuOptionBuilder[] = [];

  // Search option (first) — only when not locked
  if (!locked) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel("🔍 Search by team name…")
        .setValue("__search__")
        .setDescription("Filter the list by typing a team name")
    );
  }

  for (const g of games) {
    const dateStr = new Date(g.commence_time).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(`${g.away_team} @ ${g.home_team}`)
      .setValue(g.id)
      .setDescription(dateStr + " ET");
    if (g.id === selectedId) opt.setDefault(true);
    options.push(opt);
  }

  // Discord max 25 options
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("game_select")
      .setPlaceholder(locked ? "🔒 Game locked" : `${sportEmoji} Select a game to view odds…`)
      .setDisabled(locked)
      .addOptions(options.slice(0, 25))
  );
}

function buildMarketRow() {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("game_market")
      .setPlaceholder("💰 Place a bet — select a market…")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("💵 Moneyline")
          .setValue("moneyline")
          .setDescription("Pick a team to win outright"),
        new StringSelectMenuOptionBuilder()
          .setLabel("📊 Spread")
          .setValue("spread")
          .setDescription("Bet against the point spread"),
        new StringSelectMenuOptionBuilder()
          .setLabel("🔢 Over/Under")
          .setValue("total")
          .setDescription("Bet on the combined total score")
      )
  );
}

function buildLockRow(locked: boolean) {
  const btn = new ButtonBuilder()
    .setCustomId("game_lock")
    .setLabel(locked ? "🔓 Unlock Game" : "🔒 Lock Game")
    .setStyle(locked ? ButtonStyle.Secondary : ButtonStyle.Success);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
}

// ── Command ───────────────────────────────────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Browse upcoming games, view live odds, and place a bet.")
    .addStringOption((opt) =>
      opt
        .setName("sport")
        .setDescription("Pick a sport to browse")
        .setRequired(true)
        .addChoices(
          ...Object.entries(SUPPORTED_SPORTS).map(([key, name]) => ({ name, value: key }))
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("team")
        .setDescription("NCAA only — search for a specific team")
        .setRequired(false)
        .setAutocomplete(true)
    ),

  autocomplete: handleAutocomplete,

  async execute(interaction) {
    const sportKey = interaction.options.getString("sport", true);
    const teamFilter = interaction.options.getString("team")?.toLowerCase().trim() ?? null;
    await interaction.deferReply();

    let allGames: OddsApiGame[];
    try {
      allGames = await getCachedGames(sportKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await interaction.editReply({ embeds: [buildErrorEmbed(`Failed to fetch odds: ${msg}`)] });
      return;
    }

    const now = Date.now();
    let upcoming = allGames
      .filter((g) => new Date(g.commence_time).getTime() > now)
      .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());

    if (teamFilter) {
      upcoming = upcoming.filter(
        (g) =>
          g.home_team.toLowerCase().includes(teamFilter) ||
          g.away_team.toLowerCase().includes(teamFilter)
      );
    }

    if (upcoming.length === 0) {
      const msg = teamFilter
        ? `No upcoming games found for **${interaction.options.getString("team")}**.`
        : `No upcoming ${SUPPORTED_SPORTS[sportKey]} games with odds right now.`;
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle("No Games Found")
            .setDescription(msg)
            .setFooter({ text: "The 1912 Society Book" }),
        ],
      });
      return;
    }

    // Working state
    let displayGames = upcoming.slice(0, 24); // leave room for the Search option
    let currentGame = displayGames[0]!;
    let locked = false;

    const render = () => [
      buildGameSelectRow(displayGames, sportKey, currentGame.id, locked),
      buildMarketRow(),
      buildLockRow(locked),
    ];

    const reply = await interaction.editReply({
      embeds: [buildGameEmbed(currentGame)],
      components: render(),
    });

    // ── Collector for select + button ─────────────────────────────────────────
    const collector = reply.createMessageComponentCollector({
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (ci) => {
      // ── Lock / Unlock button ────────────────────────────────────────────────
      if (ci.isButton() && ci.customId === "game_lock") {
        locked = !locked;
        await ci.update({
          embeds: [buildGameEmbed(currentGame)],
          components: render(),
        });
        return;
      }

      if (!ci.isStringSelectMenu()) return;

      // ── Game select ─────────────────────────────────────────────────────────
      if (ci.customId === "game_select") {
        const value = ci.values[0]!;

        // Team search option
        if (value === "__search__") {
          const modal = new ModalBuilder()
            .setCustomId("game_team_search")
            .setTitle("Search by Team Name");
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("team_query")
                .setLabel("Team name (partial is fine)")
                .setPlaceholder("e.g. Ohio, Duke, Alabama…")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(50)
            )
          );

          await (ci as StringSelectMenuInteraction).showModal(modal);

          let modalSubmit;
          try {
            modalSubmit = await ci.awaitModalSubmit({
              time: 60_000,
              filter: (m) =>
                m.customId === "game_team_search" && m.user.id === interaction.user.id,
            });
          } catch {
            return;
          }

          const query = modalSubmit.fields.getTextInputValue("team_query").toLowerCase().trim();
          const filtered = upcoming.filter(
            (g) =>
              g.home_team.toLowerCase().includes(query) ||
              g.away_team.toLowerCase().includes(query)
          );

          if (filtered.length === 0) {
            await modalSubmit.reply({
              content: `❌ No games found for **"${query}"**. Try a different name.`,
              ephemeral: true,
            });
            return;
          }

          displayGames = filtered.slice(0, 24);
          currentGame = displayGames[0]!;
          await modalSubmit.deferUpdate();
          await interaction.editReply({
            embeds: [buildGameEmbed(currentGame)],
            components: render(),
          });
          return;
        }

        // Normal game selection
        currentGame = displayGames.find((g) => g.id === value) ?? currentGame;
        await ci.update({
          embeds: [buildGameEmbed(currentGame)],
          components: render(),
        });
        return;
      }

      // ── Market select → bet flow ────────────────────────────────────────────
      if (ci.customId === "game_market") {
        if (await areBetsLocked()) {
          await ci.update({
            embeds: [buildErrorEmbed("🔒 Betting is currently **locked** by an admin.")],
            components: [],
          });
          collector.stop();
          return;
        }

        const marketKey = ci.values[0]! as MarketKey;
        collector.stop("market_selected");
        await showSelectionMenu(ci, currentGame, sportKey, marketKey, interaction);
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        try { await interaction.editReply({ components: [] }); } catch { /* ignored */ }
      }
    });
  },
};

export default command;
