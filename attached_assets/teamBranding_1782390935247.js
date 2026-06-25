const fs = require("fs");
const path = require("path");

const logosDir = path.join(__dirname, "..", "assets", "logos");

const teamColors = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "assets", "team-colors.json"), "utf8")
);

const logoFiles = fs.readdirSync(logosDir);

const LOGO_OVERRIDES = {
  "Miami (FL)": "miami.png",
  "Miami (OH)": "miamiOH.png",
  "Connecticut": "connecticut.png",
  "UConn": "connecticut.png",
  "LSU": "lsu.png",
  "SMU": "smu.png",
  "TCU": "TCU.png",
  "UCF": "ucf.png",
  "UCLA": "ucla.png",
  "UNLV": "unlv.png",
  "USC": "usc.png",
  "UTEP": "utep.png",
  "UAB": "uab.png",
  "BYU": "byu.png",
  "Ole Miss": "oleMiss.png",
  "Mississippi": "oleMiss.png",
  "NC State": "ncState.png",
  "N.C. State": "ncState.png",
  "North Carolina State": "ncState.png",
  "Penn": "penn.png",
  "Penn State": "pennState.png",
  "Pitt": "pittsburgh.png",
  "Pittsburgh": "pittsburgh.png",
  "UMass": "massachusetts.png",
  "Massachusetts": "massachusetts.png",
  "Texas A&M": "texasAM.png",
  "Alabama A&M": "alabamaAM.png",
  "Florida A&M": "floridaAM.png",
  "North Carolina A&T": "northCarolinaAT.png",
  "William & Mary": "williamMary.png",
  "Boston College": "boston.png",
  "Marquette": "marquette.png",
  "Providence": "providence.webp",
  "St. John's": "stJohns.png",
  "Saint John's": "stJohns.png",
  "Seton Hall": "setonHall.webp",
  "Loyola Chicago": "loyolaChicago.png",
  "Loyola-Chicago": "loyolaChicago.png",
  "St. Bonaventure": "stBonaventure.png",
  "Saint Bonaventure": "stBonaventure.png",
  "Saint Joseph's": "saintJosephs.png",
  "Saint Louis": "saintLouis.png",
  "Louisiana": "louisianaLafayette.png",
  "ULM": "louisianaMonroe.png",
  "Louisiana Tech": "LouisianaTech.png",
  "Georgia Tech": "georgiaTech.png",
  "Georgia State": "georgiaState.png",
  "Georgia Southern": "georgiaSouthern.png",
  "Texas Southern": "texasSouthern.png",
  "Texas State": "texasState.png",
  "Texas Tech": "texasTech.png",
  "UTSA": "texasSanAntonio.png",
  "Virginia Tech": "virginiaTech.png",
  "West Virginia": "westVirginia.png",
  "Wake Forest": "wakeForest.png",
  "Washington State": "washingtonState.png",
  "Ohio State": "ohioState.png",
  "Michigan State": "michiganState.png",
  "Iowa State": "iowaState.png",
  "Kansas State": "kansasState.png",
  "Oregon State": "oregonState.png",
  "Oklahoma State": "OklahomaState.png",
  "Oklahoma St.": "OklahomaState.png",
  "Mississippi State": "mississippiState.png",
  "Fresno State": "fresnoState.png",
  "Boise State": "boiseState.png",
  "San Diego State": "sanDiegoState.png",
  "Colorado State": "coloradoState.png",
  "Arizona State": "arizonaState.png",
  "Ball State": "ballState.png",
  "Kent State": "kentState.png",
  "McNeese": "mcNeeseState.png",
  "Arkansas-Pine Bluff": "arkansasPineBluff.png",
  "Arkansas State": "arkansasState.png",
  "Appalachian State": "appalachianState.png",
  "Jackson State": "jacksonState.png",
  "Jacksonville State": "jacksonvilleState.png",
  "Murray State": "murrayState.png",
  "Morehead State": "moreheadState.png",
  "Morgan State": "morganState.png",
  "Montana State": "montanaState.png",
  "Nicholls": "nichollsState.png",
  "Norfolk State": "norfolkState.png",
  "North Dakota State": "northDakotaState.png",
  "South Dakota State": "southDakotaState.png",
  "Portland State": "portlandState.png",
  "Sacramento State": "sacramentoState.png",
  "Sam Houston": "samHouston.png",
  "Southeast Missouri State": "southeastMissouri.png",
  "Southern Illinois": "southernIllinois.png",
  "Southern Miss": "southernMiss.png",
  "Stephen F. Austin": "stephenFAustin.png",
  "UC Davis": "ucDavis.png",
  "Illinois State": "illinoisState.png",
  "Indiana State": "indianaState.png",
  "Kennesaw State": "kennesawState.png",
  "Missouri State": "missouriState.png",
  "Austin Peay": "austinPeay.png",
  "Tennessee State": "tennesseeState.png",
  "Tennessee Tech": "tennesseeTech.png",
  "Alcorn State": "alcornState.png",
  "Alabama State": "alabamaState.png",
  "Coppin State": "coppinState.png",
  "Delaware State": "delawareState.png",
  "Grambling": "gramblingState.png",
  "Mississippi Valley State": "mississippiValleyState.png",
  "Prairie View A&M": "prairieViewAM.png",
  "New Mexico State": "newMexicoState.png",
  "South Carolina State": "southCarolinaState.png",
  "Bethune-Cookman": "bethuneCookman.png",
  "North Carolina Central": "northCarolinaCentral.png",
  "Central Connecticut": "centralConnecticut.png",
  "James Madison": "jamesMadison.png",
  "Charleston Southern": "charlestonSouthern.png",
  "Gardner-Webb": "gardnerWebb.png",
  "Incarnate Word": "incarnateWord.png",
  "Little Rock": "littleRock.png",
  "Youngstown State": "youngstownState.png",
  "Stony Brook": "stonyBrook.png",
  "SIU Edwardsville": "siuEdwardsville.png",
  "Southeastern Louisiana": "southeasternLouisiana.png",
  "Northwestern State": "northwesternState.png",
  "Idaho State": "idahoState.png",
  "Utah State": "utahState.png",
  "Wichita State": "wichitaState.png",
  "Wright State": "wrightState.png",
  "San Jose State": "sanJoseState.png",
  "Cleveland State": "clevelandState.png",
  "Coastal Carolina": "coastalCarolina.png",
  "Western Carolina": "westernCarolina.png",
  "Western Kentucky": "westernKentucky.png",
  "Western Michigan": "westernMichigan.png",
  "Western Illinois": "westernIllinois.png",
  "Eastern Kentucky": "easternKentucky.png",
  "Eastern Michigan": "easternMichigan.png",
  "Eastern Illinois": "easternIllinois.png",
  "Eastern Washington": "easternWashington.png",
  "East Carolina": "eastCarolina.png",
  "East Tennessee State": "eastTennessee.png",
  "Central Michigan": "centralMichigan.png",
  "Central Arkansas": "centralArkansas.png",
  "South Carolina": "southCarolina.png",
  "South Alabama": "southAlabama.png",
  "South Florida": "southFlorida.png",
  "North Florida": "northFlorida.png",
  "North Texas": "northTexas.png",
  "Northern Illinois": "northernIllinois.png",
  "Northern Iowa": "northernIowa.png",
  "Northern Kentucky": "northernKentucky.png",
  "North Carolina": "northCarolina.png",
  "FAU": "floridaAtlantic.png",
  "FIU": "floridaIntl.png",
  "Florida Atlantic": "floridaAtlantic.png",
  "Florida State": "floridaState.png",
  "Middle Tennessee": "middleTennessee.png",
  "UT Martin": "tennesseeMartin.png",
  "Loyola-Chicago": "loyolaChicago.png",
  "Houston Christian": "houstonBaptist.png",
  "The Citadel": "citadel.png",
  "North Carolina A&T": "northCarolinaAT.png",
  "Saint Bonaventure": "stBonaventure.png",
  "Florida A&M": "floridaAM.png",
  "Weber State": "weberState.png",
  "New Mexico": "newMexico.png",
};

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/\bst\.\s*/g, 'state ')
    .replace(/[().\-']/g, '')
    .replace(/&/g, 'and')
    .replace(/\s+/g, '')
    .trim();
}

const colorLookup = {};
for (const [key, val] of Object.entries(teamColors)) {
  colorLookup[normalize(key)] = val;
}

const logoOverrideLookup = {};
for (const [key, val] of Object.entries(LOGO_OVERRIDES)) {
  logoOverrideLookup[normalize(key)] = val;
}

function findLogo(teamName) {
  const override = LOGO_OVERRIDES[teamName] || logoOverrideLookup[normalize(teamName)];
  if (override) {
    const exists = logoFiles.includes(override);
    return exists ? override : null;
  }

  const inputNorm = normalize(teamName);

  let match = logoFiles.find(f => {
    const base = normalize(f.replace('.png', ''));
    return base === inputNorm;
  });
  if (match) return match;

  match = logoFiles.find(f => {
    const base = f.replace('.png', '');
    const expanded = normalize(base.replace(/([a-z])([A-Z])/g, '$1 $2'));
    return expanded === inputNorm;
  });
  if (match) return match;

  return null;
}

function getBranding(teamName) {

  let color = teamColors[teamName] || colorLookup[normalize(teamName)];

  if (!color) {
    color = '#888888';
  }

  const logoFile = findLogo(teamName);

  return {
    name: teamName,
    color,
    logo: logoFile,
    logoPath: logoFile ? path.join(logosDir, logoFile) : null
  };

}

module.exports = { getBranding };
