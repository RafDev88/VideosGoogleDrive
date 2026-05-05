const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreResult(result, title, year) {
  const wanted = normalizeTitle(title);
  const candidate = normalizeTitle(result.title || result.name || "");
  const original = normalizeTitle(result.original_title || result.original_name || "");
  const candidateYear = Number(String(result.release_date || result.first_air_date || "").slice(0, 4) || 0);

  let score = 0;

  if (candidate === wanted || original === wanted) {
    score += 120;
  } else if (candidate.includes(wanted) || wanted.includes(candidate)) {
    score += 70;
  }

  const wantedWords = wanted.split(" ").filter(Boolean);
  const candidateWords = new Set(candidate.split(" ").filter(Boolean));
  score += wantedWords.filter((word) => candidateWords.has(word)).length * 8;

  if (year && candidateYear) {
    if (candidateYear === year) {
      score += 40;
    } else if (Math.abs(candidateYear - year) === 1) {
      score += 15;
    }
  }

  score += Math.min(Number(result.vote_count || 0), 500) / 50;

  return score;
}

async function createTmdbService(apiToken) {
  if (!apiToken) {
    throw new Error("Preencha o token do TMDb para buscar capas e sinopses.");
  }

  async function request(endpoint, searchParams = {}) {
    const url = new URL(`${TMDB_API_BASE}${endpoint}`);
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`TMDb respondeu com status ${response.status}`);
    }

    return response.json();
  }

  async function searchByTitle(title, mediaType = "movie", options = {}) {
    if (!title) {
      return null;
    }

    const endpoint = mediaType === "tv" ? "/search/tv" : "/search/movie";
    const attempts = [
      {
        query: title,
        language: "pt-BR",
        include_adult: false,
        year: mediaType === "movie" ? options.year : undefined,
        first_air_date_year: mediaType === "tv" ? options.year : undefined
      },
      {
        query: title,
        language: "en-US",
        include_adult: false
      }
    ];

    let results = [];
    for (const params of attempts) {
      const data = await request(endpoint, params);
      if (data.results?.length) {
        results = data.results;
        break;
      }
    }

    const sorted = [...results].sort((a, b) => scoreResult(b, title, options.year) - scoreResult(a, title, options.year));
    const result = sorted[0];
    if (!result) {
      return null;
    }

    return {
      id: result.id,
      mediaType,
      title: result.title || result.name || title,
      originalTitle: result.original_title || result.original_name || "",
      overview: result.overview || "Sem sinopse encontrada.",
      posterUrl: result.poster_path ? `${TMDB_IMAGE_BASE}${result.poster_path}` : "",
      backdropUrl: result.backdrop_path ? `${TMDB_IMAGE_BASE}${result.backdrop_path}` : "",
      releaseDate: result.release_date || result.first_air_date || "",
      voteAverage: result.vote_average || 0
    };
  }

  return {
    searchByTitle
  };
}

module.exports = {
  createTmdbService
};
