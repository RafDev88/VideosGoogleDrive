const path = require("node:path");

const NOISE_TOKENS = [
  "1080p",
  "2160p",
  "720p",
  "480p",
  "360p",
  "4k",
  "uhd",
  "fullhd",
  "bluray",
  "brrip",
  "webrip",
  "web-dl",
  "webdl",
  "hdrip",
  "dvdrip",
  "cam",
  "hdcam",
  "ts",
  "tc",
  "x264",
  "x265",
  "xvid",
  "h264",
  "h265",
  "hevc",
  "aac",
  "ac3",
  "dts",
  "ddp5 1",
  "ddp5.1",
  "5 1",
  "5.1",
  "hdr",
  "dv",
  "dubbed",
  "dublado",
  "dual audio",
  "dual-audio",
  "multi",
  "multi audio",
  "legendado",
  "subbed",
  "pt br",
  "ptbr",
  "latino",
  "proper",
  "repack",
  "extended",
  "remux",
  "imax",
  "nf",
  "amzn",
  "hmax"
];

function normalizeSeparators(name) {
  return name
    .replace(path.extname(name), "")
    .replace(/[._]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function removeBracketedNoise(value) {
  return value.replace(/\[[^\]]+\]|\{[^}]+\}/g, " ");
}

function cleanupWhitespace(value) {
  return value
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([:)])/g, "$1")
    .trim();
}

function stripNoise(name) {
  let value = removeBracketedNoise(normalizeSeparators(name));

  for (const token of NOISE_TOKENS) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    value = value.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
  }

  value = value.replace(/\((?:19|20)\d{2}\)/g, " ");
  value = value.replace(/\b(?:19|20)\d{2}\b/g, " ");
  value = value.replace(/\bS\d{1,2}E\d{1,2}\b/gi, " ");
  value = value.replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ");
  value = value.replace(/\bS\d{1,2}\b/gi, " ");
  value = value.replace(/\b\d{1,2}x\d{1,2}\b/gi, " ");
  value = value.replace(/\b(?:Part|Parte)\s*\d{1,2}\b/gi, " ");
  value = value.replace(/\bSeason\s*\d{1,2}\b/gi, " ");
  value = value.replace(/\bTemporada\s*\d{1,2}\b/gi, " ");
  value = value.replace(/\b(?:Complete|Completa)\b/gi, " ");
  value = value.replace(/\b(?:Episode|Episodio|Ep)\s*\d{1,3}\b/gi, " ");
  value = value.replace(/\b(?:Capitulo|Chapter)\s*\d{1,3}\b/gi, " ");
  value = value.replace(/\b(?:1080|2160|720|480)\s*p\b/gi, " ");
  return cleanupWhitespace(value);
}

function parseSeasonEpisode(name) {
  const normalized = normalizeSeparators(name);
  const patterns = [
    /\bS(\d{1,2})E(\d{1,3})\b/i,
    /\bS(\d{1,2})\s*E(\d{1,3})\b/i,
    /\b(\d{1,2})x(\d{1,3})\b/i,
    /\bSeason\s*(\d{1,2})\s*Episode\s*(\d{1,3})\b/i,
    /\bTemporada\s*(\d{1,2})\s*Episodio\s*(\d{1,3})\b/i,
    /\bTemporada\s*(\d{1,2})\s*Ep\s*(\d{1,3})\b/i,
    /\bCapitulo\s*(\d{1,3})\b/i,
    /\bEp\s*(\d{1,3})\b/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    if (pattern.source.includes("Capitulo\\s*") || pattern.source.includes("Ep\\s*")) {
      return { season: 1, episode: Number(match[1]) };
    }

    return {
      season: Number(match[1]),
      episode: Number(match[2])
    };
  }

  return { season: null, episode: null };
}

function parseYear(name) {
  const match = name.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function inferMediaType(name) {
  return /\bS\d{1,2}E\d{1,2}\b|\bS\d{1,2}\s*E\d{1,3}\b|\b\d{1,2}x\d{1,2}\b|temporada|season|episode|episodio|capitulo|\bep\s*\d{1,3}\b/i.test(name)
    ? "tv"
    : "movie";
}

function buildSeriesKey(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseMediaFilename(filename) {
  const mediaType = inferMediaType(filename);
  const title = stripNoise(filename) || normalizeSeparators(filename);
  const year = parseYear(filename);
  const { season, episode } = parseSeasonEpisode(filename);

  return {
    mediaType,
    title,
    year,
    season,
    episode,
    seriesKey: mediaType === "tv" ? buildSeriesKey(title) : null
  };
}

module.exports = {
  parseMediaFilename
};
