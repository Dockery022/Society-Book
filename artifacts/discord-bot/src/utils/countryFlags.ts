/**
 * Country name → Unicode flag emoji mapping
 * Used to decorate team names in soccer embeds.
 */

const FLAGS: Record<string, string> = {
  // A
  "Algeria": "🇩🇿",
  "Angola": "🇦🇴",
  "Argentina": "🇦🇷",
  "Australia": "🇦🇺",
  "Austria": "🇦🇹",
  // B
  "Belgium": "🇧🇪",
  "Bolivia": "🇧🇴",
  "Bosnia": "🇧🇦",
  "Bosnia and Herzegovina": "🇧🇦",
  "Brazil": "🇧🇷",
  "Burkina Faso": "🇧🇫",
  // C
  "Cameroon": "🇨🇲",
  "Canada": "🇨🇦",
  "Cape Verde": "🇨🇻",
  "Chile": "🇨🇱",
  "China": "🇨🇳",
  "Colombia": "🇨🇴",
  "Columbia": "🇨🇴",
  "Costa Rica": "🇨🇷",
  "Croatia": "🇭🇷",
  "Cuba": "🇨🇺",
  "Curacao": "🇨🇼",
  "Czech Republic": "🇨🇿",
  "Czechia": "🇨🇿",
  // D
  "Denmark": "🇩🇰",
  "DR Congo": "🇨🇩",
  "Democratic Republic of Congo": "🇨🇩",
  // E
  "Ecuador": "🇪🇨",
  "Egypt": "🇪🇬",
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  // F
  "France": "🇫🇷",
  // G
  "Germany": "🇩🇪",
  "Ghana": "🇬🇭",
  "Greece": "🇬🇷",
  "Guatemala": "🇬🇹",
  // H
  "Honduras": "🇭🇳",
  "Hungary": "🇭🇺",
  // I
  "Indonesia": "🇮🇩",
  "Iran": "🇮🇷",
  "Iraq": "🇮🇶",
  "Israel": "🇮🇱",
  "Italy": "🇮🇹",
  "Ivory Coast": "🇨🇮",
  "Côte d'Ivoire": "🇨🇮",
  // J
  "Jamaica": "🇯🇲",
  "Japan": "🇯🇵",
  "Jordan": "🇯🇴",
  // K
  "Kazakhstan": "🇰🇿",
  "Kenya": "🇰🇪",
  // M
  "Mali": "🇲🇱",
  "Mexico": "🇲🇽",
  "Morocco": "🇲🇦",
  // N
  "Netherlands": "🇳🇱",
  "New Zealand": "🇳🇿",
  "Nigeria": "🇳🇬",
  "North Korea": "🇰🇵",
  "Norway": "🇳🇴",
  // P
  "Panama": "🇵🇦",
  "Paraguay": "🇵🇾",
  "Peru": "🇵🇪",
  "Poland": "🇵🇱",
  "Portugal": "🇵🇹",
  // Q
  "Qatar": "🇶🇦",
  // R
  "Romania": "🇷🇴",
  // S
  "Saudi Arabia": "🇸🇦",
  "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Senegal": "🇸🇳",
  "Serbia": "🇷🇸",
  "Slovakia": "🇸🇰",
  "Slovenia": "🇸🇮",
  "South Korea": "🇰🇷",
  "Spain": "🇪🇸",
  "Sweden": "🇸🇪",
  "Switzerland": "🇨🇭",
  // T
  "Tunisia": "🇹🇳",
  "Turkey": "🇹🇷",
  "Türkiye": "🇹🇷",
  // U
  "Ukraine": "🇺🇦",
  "United States": "🇺🇸",
  "USA": "🇺🇸",
  "Uruguay": "🇺🇾",
  // V
  "Venezuela": "🇻🇪",
  // W
  "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
};

/**
 * Returns the flag emoji for a country name, or an empty string if not found.
 */
export function getFlagEmoji(countryName: string): string {
  // Exact match
  if (FLAGS[countryName]) return FLAGS[countryName];

  // Case-insensitive fallback
  const lower = countryName.toLowerCase();
  for (const [key, flag] of Object.entries(FLAGS)) {
    if (key.toLowerCase() === lower) return flag;
  }

  return "";
}

/**
 * Decorates a team name with its flag emoji, e.g. "🇫🇷 France"
 */
export function withFlag(teamName: string): string {
  const flag = getFlagEmoji(teamName);
  return flag ? `${flag} ${teamName}` : teamName;
}
