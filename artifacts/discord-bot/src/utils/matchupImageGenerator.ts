/**
 * Matchup image generator — ESPN/DraftKings style 1280×720 graphic.
 * Diagonal team-color split, team logos, faded ghost logos, metallic VS.
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Image } from "@napi-rs/canvas";
import { readFile } from "fs/promises";
import { getTeamData } from "../data/teams.js";
import type { TeamData } from "../data/teams.js";

const W = 1280;
const H = 720;

// Diagonal split: goes from (590, 0) at the top to (700, 720) at the bottom
const SPLIT_TOP = 590;
const SPLIT_BOT = 700;

// In-memory logo cache — keyed by path or URL, persists across bets
const logoCache = new Map<string, Image | null>();

async function fetchLogo(team: TeamData): Promise<Image | null> {
  // Prefer local file (NCAA logos) — faster and no network dependency
  if (team.logoPath) {
    const key = team.logoPath;
    if (logoCache.has(key)) return logoCache.get(key)!;
    try {
      const buf = await readFile(team.logoPath);
      const img = await loadImage(buf);
      logoCache.set(key, img);
      return img;
    } catch {
      logoCache.set(key, null);
      return null;
    }
  }
  // Fall back to remote URL (NFL / NBA / MLB / WNBA / Soccer)
  const url = team.logoUrl ?? "";
  if (logoCache.has(url)) return logoCache.get(url)!;
  if (!url) { logoCache.set(url, null); return null; }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) { logoCache.set(url, null); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    const img = await loadImage(buf);
    logoCache.set(url, img);
    return img;
  } catch {
    logoCache.set(url, null);
    return null;
  }
}

/** x position of the diagonal split at a given y */
function splitX(y: number): number {
  return SPLIT_TOP + (SPLIT_BOT - SPLIT_TOP) * (y / H);
}

export async function generateMatchupImage(
  awayTeam: string,
  homeTeam: string
): Promise<Buffer> {
  const away = getTeamData(awayTeam);
  const home = getTeamData(homeTeam);

  // Fetch logos in parallel — don't block if one fails
  const [awayLogo, homeLogo] = await Promise.all([
    fetchLogo(away),
    fetchLogo(home),
  ]);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── Dark base ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, W, H);

  // ── Away side (left) ───────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(SPLIT_TOP + 2, 0);
  ctx.lineTo(SPLIT_BOT + 2, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.clip();

  const awayGrad = ctx.createLinearGradient(0, 0, SPLIT_TOP, 0);
  awayGrad.addColorStop(0, darken(away.primary, 0.55));
  awayGrad.addColorStop(1, away.primary);
  ctx.fillStyle = awayGrad;
  ctx.fillRect(0, 0, W, H);

  // Ghost logo (faded background)
  if (awayLogo) {
    const gSize = 500;
    const gx = splitX(H / 2) / 2 - gSize / 2;
    ctx.globalAlpha = 0.13;
    ctx.drawImage(awayLogo, gx, H / 2 - gSize / 2, gSize, gSize);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // ── Home side (right) ──────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(SPLIT_TOP - 2, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(SPLIT_BOT - 2, H);
  ctx.closePath();
  ctx.clip();

  const homeGrad = ctx.createLinearGradient(SPLIT_TOP, 0, W, 0);
  homeGrad.addColorStop(0, home.primary);
  homeGrad.addColorStop(1, darken(home.primary, 0.55));
  ctx.fillStyle = homeGrad;
  ctx.fillRect(0, 0, W, H);

  // Ghost logo
  if (homeLogo) {
    const gSize = 500;
    const gx = splitX(H / 2) + (W - splitX(H / 2)) / 2 - gSize / 2;
    ctx.globalAlpha = 0.13;
    ctx.drawImage(homeLogo, gx, H / 2 - gSize / 2, gSize, gSize);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // ── Diagonal glow strip ───────────────────────────────────────────────────
  const midSplit = (SPLIT_TOP + SPLIT_BOT) / 2;
  const glowGrad = ctx.createLinearGradient(midSplit - 30, 0, midSplit + 30, 0);
  glowGrad.addColorStop(0, "rgba(255,255,255,0)");
  glowGrad.addColorStop(0.5, "rgba(255,255,255,0.55)");
  glowGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.moveTo(SPLIT_TOP - 25, 0);
  ctx.lineTo(SPLIT_TOP + 25, 0);
  ctx.lineTo(SPLIT_BOT + 25, H);
  ctx.lineTo(SPLIT_BOT - 25, H);
  ctx.closePath();
  ctx.fill();

  // ── Main logos ────────────────────────────────────────────────────────────
  const logoSize = 250;
  const halfAway = splitX(H / 2) / 2;
  const halfHome = splitX(H / 2) + (W - splitX(H / 2)) / 2;

  if (awayLogo) {
    ctx.drawImage(awayLogo, halfAway - logoSize / 2, H / 2 - logoSize / 2, logoSize, logoSize);
  } else {
    drawFallbackText(ctx, awayTeam, halfAway, H / 2);
  }

  if (homeLogo) {
    ctx.drawImage(homeLogo, halfHome - logoSize / 2, H / 2 - logoSize / 2, logoSize, logoSize);
  } else {
    drawFallbackText(ctx, homeTeam, halfHome, H / 2);
  }

  // ── Metallic VS ────────────────────────────────────────────────────────────
  const vsX = midSplit;
  const vsY = H / 2;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 96px sans-serif";

  // Dark shadow
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  // Metallic gradient fill
  const vsGrad = ctx.createLinearGradient(vsX - 60, vsY - 55, vsX + 60, vsY + 55);
  vsGrad.addColorStop(0, "#ffffff");
  vsGrad.addColorStop(0.3, "#e0e0e0");
  vsGrad.addColorStop(0.5, "#ffffff");
  vsGrad.addColorStop(0.7, "#c0c0c0");
  vsGrad.addColorStop(1, "#ffffff");

  // Stroke for definition
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.lineWidth = 6;
  ctx.strokeText("VS", vsX, vsY);

  ctx.fillStyle = vsGrad;
  ctx.fillText("VS", vsX, vsY);
  ctx.restore();

  // ── Edge vignette ─────────────────────────────────────────────────────────
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  return canvas.toBuffer("image/png");
}

/** Darken a hex color by the given factor (0–1) */
function darken(hex: string, factor: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.floor(((n >> 16) & 255) * (1 - factor));
  const g = Math.floor(((n >> 8) & 255) * (1 - factor));
  const b = Math.floor((n & 255) * (1 - factor));
  return `rgb(${r},${g},${b})`;
}

/** Render team abbreviation as text fallback when no logo is available */
function drawFallbackText(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  name: string,
  x: number,
  y: number
): void {
  const abbrev = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 72px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(abbrev, x, y);
  ctx.restore();
}
