/**
 * Command registry — imports and exports all slash commands.
 */

import type { Command } from "../types.js";

import coins from "./coins.js";
import daily from "./daily.js";
import leaderboard from "./leaderboard.js";
import bet from "./bet.js";
import mybets from "./mybets.js";
import history from "./history.js";
import game from "./game.js";

// Admin commands
import addcoins from "./admin/addcoins.js";
import removecoins from "./admin/removecoins.js";
import settlebet from "./admin/settlebet.js";
import cancelbet from "./admin/cancelbet.js";
import lockbets from "./admin/lockbets.js";
import unlockbets from "./admin/unlockbets.js";
import setupemojis from "./admin/setupemojis.js";
import serverbonus from "./admin/serverbonus.js";

export const commands: Command[] = [
  // User commands
  coins,
  daily,
  leaderboard,
  bet,
  mybets,
  history,
  game,
  // Admin commands
  addcoins,
  removecoins,
  settlebet,
  cancelbet,
  lockbets,
  unlockbets,
  setupemojis,
  serverbonus,
];
