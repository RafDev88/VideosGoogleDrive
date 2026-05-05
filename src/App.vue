<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastViewport } from "@/components/ui/toast";

const VideoPlayer = defineAsyncComponent(() => import("./components/VideoPlayer.vue"));

const items = ref([]);
const activeItem = ref(null);
const loading = ref(true);
const error = ref("");
const search = ref("");
const detailsOpen = ref(false);
const settingsOpen = ref(false);
const savingSettings = ref(false);
const testingSettings = ref(false);
const connectingDrive = ref(false);
const generatingRefreshToken = ref(false);
const searchingMetadata = ref(false);
const testResults = ref(null);
const googleTokenDebug = ref(null);
const toasts = ref([]);
const settingsFields = ref([]);
const googleAuthCode = ref("");
const metadataSearchTitle = ref("");
const playerSection = ref(null);
const carouselRefs = ref({});
const heroIndex = ref(0);
let heroRotationTimer = 0;

const configStatus = ref({
  configured: false,
  missingRequired: [],
  envPath: "",
  mediaPort: null
});

const libraryState = ref({
  playback: {},
  favorites: [],
  recent: [],
  seriesProgress: {}
});

const settingsForm = reactive({
  TMDB_API_TOKEN: "",
  GOOGLE_DRIVE_CLIENT_ID: "",
  GOOGLE_DRIVE_CLIENT_SECRET: "",
  GOOGLE_DRIVE_REFRESH_TOKEN: "",
  GOOGLE_DRIVE_FOLDER_ID: "",
  GOOGLE_DRIVE_SHARED_DRIVE_ID: "",
  GOOGLE_DRIVE_RECURSIVE: "true",
  APP_MEDIA_PORT: "3867"
});

const filteredItems = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) {
    return items.value;
  }

  return items.value.filter((item) =>
    (item.metadata?.title || item.parsedTitle || item.name).toLowerCase().includes(term)
  );
});

const heroCandidates = computed(() =>
  filteredItems.value
    .filter((item) => item.metadata?.backdropUrl || item.metadata?.posterUrl)
    .slice(0, 8)
);

const featuredItem = computed(() => {
  if (activeItem.value) {
    return activeItem.value;
  }

  if (!heroCandidates.value.length) {
    return filteredItems.value[0] || null;
  }

  return heroCandidates.value[heroIndex.value % heroCandidates.value.length] || heroCandidates.value[0] || null;
});

const heroStyle = computed(() =>
  featuredItem.value?.metadata?.backdropUrl
    ? {
        backgroundImage: `linear-gradient(90deg, rgba(5,5,5,.96) 0%, rgba(5,5,5,.78) 42%, rgba(5,5,5,.28) 100%), url(${featuredItem.value.metadata.backdropUrl})`
      }
    : {}
);

const movieItems = computed(() => filteredItems.value.filter((item) => item.mediaType === "movie").slice(0, 18));

const seriesGroups = computed(() => {
  const groups = new Map();

  for (const item of filteredItems.value.filter((entry) => entry.mediaType === "tv")) {
    const key = item.seriesKey || item.parsedTitle || item.id;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: item.metadata?.title || item.parsedTitle,
        posterUrl: item.metadata?.posterUrl || "",
        year: item.metadata?.releaseDate?.slice(0, 4) || "",
        vote: Number(item.metadata?.voteAverage || 0).toFixed(1),
        episodes: []
      });
    }
    groups.get(key).episodes.push(item);
  }

  return [...groups.values()]
    .map((group) => {
      group.episodes.sort(
        (a, b) => ((a.season || 1) - (b.season || 1)) || ((a.episode || 0) - (b.episode || 0))
      );
      group.firstItem = group.episodes[0];
      return group;
    })
    .slice(0, 18);
});

const continueWatchingItems = computed(() =>
  filteredItems.value
    .filter((item) => {
      const playback = libraryState.value.playback[item.id];
      return playback && playback.position > 0 && playback.duration > 0 && playback.position < playback.duration * 0.97;
    })
    .sort(
      (a, b) =>
        new Date(libraryState.value.playback[b.id]?.updatedAt || 0) -
        new Date(libraryState.value.playback[a.id]?.updatedAt || 0)
    )
    .slice(0, 18)
);

const nextEpisodeItems = computed(() =>
  seriesGroups.value
    .map((group) => {
      const progress = libraryState.value.seriesProgress?.[group.key];
      if (!progress) {
        return null;
      }

      const currentIndex = group.episodes.findIndex((episode) => episode.id === progress.fileId);
      if (currentIndex < 0) {
        return null;
      }

      const episode = progress.finished ? group.episodes[currentIndex + 1] : group.episodes[currentIndex];
      if (!episode) {
        return null;
      }

      return {
        key: episode.id,
        title: group.title,
        episode,
        posterUrl: episode.metadata?.posterUrl || group.posterUrl || "",
        year: episode.metadata?.releaseDate?.slice(0, 4) || "",
        vote: Number(episode.metadata?.voteAverage || 0).toFixed(1)
      };
    })
    .filter(Boolean)
    .slice(0, 18)
);

const favoriteItems = computed(() =>
  libraryState.value.favorites
    .map((id) => items.value.find((item) => item.id === id))
    .filter(Boolean)
    .slice(0, 18)
);

const settingsSections = computed(() => ({
  tmdb: settingsFields.value.filter((field) => field.key.startsWith("TMDB_")),
  drive: settingsFields.value.filter((field) => field.key.startsWith("GOOGLE_DRIVE_")),
  app: settingsFields.value.filter((field) => field.key.startsWith("APP_"))
}));

const driveFieldMap = computed(() =>
  Object.fromEntries(settingsSections.value.drive.map((field) => [field.key, field]))
);

const tmdbConfigured = computed(() => Boolean(settingsForm.TMDB_API_TOKEN.trim()));
const googleCredentialsReady = computed(
  () => Boolean(settingsForm.GOOGLE_DRIVE_CLIENT_ID.trim()) && Boolean(settingsForm.GOOGLE_DRIVE_CLIENT_SECRET.trim())
);
const googleRefreshReady = computed(() => Boolean(settingsForm.GOOGLE_DRIVE_REFRESH_TOKEN.trim()));
const googleFolderReady = computed(() => Boolean(settingsForm.GOOGLE_DRIVE_FOLDER_ID.trim()));
const driveSetupProgress = computed(
  () => [googleCredentialsReady.value, googleRefreshReady.value, googleFolderReady.value].filter(Boolean).length
);
const googleDriveConfigured = computed(() => googleCredentialsReady.value && googleRefreshReady.value && googleFolderReady.value);

const googleSetupSteps = computed(() => [
  {
    title: "Credenciais",
    description: "Cole o Client ID e o Client Secret do Google Cloud.",
    done: googleCredentialsReady.value
  },
  {
    title: "Autorizacao",
    description: "Abra o login do Google, copie o code e gere o refresh token.",
    done: googleRefreshReady.value
  },
  {
    title: "Biblioteca",
    description: "Cole a URL da pasta ou o Folder ID para importar seus videos.",
    done: googleFolderReady.value
  }
]);

const driveTestDetails = computed(() => testResults.value?.drive?.details || null);
const ffmpegTestDetails = computed(() => testResults.value?.ffmpeg?.details || null);

function titleFor(item) {
  return item?.metadata?.title || item?.parsedTitle || item?.name || "";
}

function metaYear(item) {
  return item?.metadata?.releaseDate?.slice(0, 4) || item?.year || "";
}

function metaVote(item) {
  return Number(item?.metadata?.voteAverage || 0).toFixed(1);
}

function metadataMatched(item) {
  return Boolean(item?.metadata?.matched);
}

function shortOverview(item) {
  const overview = item?.metadata?.overview || "";
  if (!overview) {
    return "";
  }

  return overview.length > 140 ? `${overview.slice(0, 137)}...` : overview;
}

function fieldLabel(key, fallback = key) {
  return driveFieldMap.value[key]?.label || fallback;
}

function pushToast(title, description, variant = "success") {
  const id = `${Date.now()}-${Math.random()}`;
  toasts.value = [...toasts.value, { id, title, description, variant }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }, 3200);
}

function setCarouselRef(key, element) {
  if (element) {
    carouselRefs.value[key] = element;
  }
}

function scrollCarousel(key, direction = 1) {
  const element = carouselRefs.value[key];
  if (!element) {
    return;
  }

  element.scrollBy({
    left: direction * 760,
    behavior: "smooth"
  });
}

function getPlaybackProgress(item) {
  const playback = libraryState.value.playback[item.id];
  if (!playback?.duration) {
    return 0;
  }

  return Math.max(0, Math.min(100, (playback.position / playback.duration) * 100));
}

function applySettingsState(state) {
  settingsFields.value = state.fields || [];
  for (const field of state.fields || []) {
    settingsForm[field.key] = field.value ?? "";
  }
}

async function loadConfigState() {
  configStatus.value = await window.mediaApp.getConfig();
}

async function loadLibraryState() {
  libraryState.value = await window.mediaApp.getLibraryState();
}

async function loadSettingsState() {
  const state = await window.mediaApp.getSettings();
  applySettingsState(state);
}

async function loadLibrary(forceRefresh = false) {
  loading.value = true;
  error.value = "";

  try {
    items.value = forceRefresh ? await window.mediaApp.refreshLibrary() : await window.mediaApp.listLibrary();
    activeItem.value = items.value.find((item) => item.id === activeItem.value?.id) || items.value[0] || null;
    await loadLibraryState();
  } catch (err) {
    error.value = err.message || "Falha ao carregar biblioteca.";
    pushToast("Erro ao carregar", error.value, "error");
  } finally {
    loading.value = false;
  }
}

function selectItem(item) {
  activeItem.value = item;
  metadataSearchTitle.value = item?.metadata?.title || item?.parsedTitle || item?.name || "";
}

function setHeroFromCarousel(item) {
  activeItem.value = item;
}

async function toggleFavorite(item) {
  const result = await window.mediaApp.toggleFavorite(item.id);
  libraryState.value.favorites = result.favorites;
  pushToast(result.isFavorite ? "Adicionado a Minha Lista" : "Removido de Minha Lista", titleFor(item));
}

async function searchMetadataForFeaturedItem() {
  if (!featuredItem.value) {
    return;
  }

  searchingMetadata.value = true;
  try {
    const result = await window.mediaApp.searchMetadata({
      title: metadataSearchTitle.value.trim() || featuredItem.value.parsedTitle || featuredItem.value.name,
      mediaType: featuredItem.value.mediaType,
      year: featuredItem.value.year
    });

    if (!result) {
      pushToast("Nada encontrado", "O TMDb nao encontrou um titulo com essa busca.", "error");
      return;
    }

    const nextMetadata = {
      ...result,
      matched: true,
      matchReason: "manual"
    };

    await window.mediaApp.saveMetadata({
      fileId: featuredItem.value.id,
      metadata: nextMetadata,
      key: {
        title: featuredItem.value.parsedTitle || featuredItem.value.name,
        mediaType: featuredItem.value.mediaType,
        year: featuredItem.value.year
      }
    });

    featuredItem.value.metadata = nextMetadata;

    items.value = items.value.map((item) =>
      item.id === featuredItem.value.id
        ? { ...item, metadata: nextMetadata }
        : item
    );

    pushToast("TMDb sincronizado", `Metadados atualizados para ${nextMetadata.title}.`);
  } catch (error) {
    pushToast("Falha na busca", error.message || "Nao foi possivel buscar no TMDb.", "error");
  } finally {
    searchingMetadata.value = false;
  }
}

async function saveSettings() {
  savingSettings.value = true;
  try {
    const payload = buildNormalizedSettingsPayload();
    settingsForm.GOOGLE_DRIVE_FOLDER_ID = payload.GOOGLE_DRIVE_FOLDER_ID;
    const state = await window.mediaApp.saveSettings(payload);
    applySettingsState(state);
    await loadConfigState();
    if (state.isConfigured) {
      await loadLibrary(true);
    }
    pushToast("Configuracoes salvas", "O aplicativo foi atualizado.");
    return state;
  } catch (err) {
    pushToast("Erro ao salvar", err.message || "Nao foi possivel salvar.", "error");
    return null;
  } finally {
    savingSettings.value = false;
  }
}

async function testSettingsConnection() {
  testingSettings.value = true;
  try {
    const payload = buildNormalizedSettingsPayload();
    settingsForm.GOOGLE_DRIVE_FOLDER_ID = payload.GOOGLE_DRIVE_FOLDER_ID;
    testResults.value = await window.mediaApp.testSettings(payload);
    return testResults.value;
  } catch (err) {
    pushToast("Falha no teste", err.message || "Nao foi possivel testar.", "error");
    testResults.value = null;
    return null;
  } finally {
    testingSettings.value = false;
  }
}

async function connectDriveAndLoad() {
  connectingDrive.value = true;
  try {
    testResults.value = null;
    const savedState = await saveSettings();
    if (!savedState) {
      return;
    }

    const result = await testSettingsConnection();
    if (result?.drive?.ok) {
      await loadLibrary(true);
      settingsOpen.value = false;
      pushToast("Biblioteca conectada", "Seus videos do Google Drive foram carregados.");
    }
  } finally {
    connectingDrive.value = false;
  }
}

function extractFolderIdFromInput() {
  const value = settingsForm.GOOGLE_DRIVE_FOLDER_ID || "";
  const match = value.match(/\/folders\/([^/?]+)/i) || value.match(/[?&]id=([^&]+)/i);
  if (!match) {
    pushToast("Folder ID nao encontrado", "Cole a URL completa da pasta do Drive.", "error");
    return;
  }
  settingsForm.GOOGLE_DRIVE_FOLDER_ID = match[1];
  pushToast("Folder ID identificado", "A URL foi convertida para o ID da pasta.");
}

function normalizeFolderValue(value) {
  const stringValue = String(value || "").trim();
  const match = stringValue.match(/\/folders\/([^/?]+)/i) || stringValue.match(/[?&]id=([^&]+)/i);
  return match ? match[1] : stringValue;
}

function buildNormalizedSettingsPayload() {
  return {
    ...settingsForm,
    GOOGLE_DRIVE_FOLDER_ID: normalizeFolderValue(settingsForm.GOOGLE_DRIVE_FOLDER_ID),
    GOOGLE_DRIVE_RECURSIVE: settingsForm.GOOGLE_DRIVE_RECURSIVE === "false" ? "false" : "true"
  };
}

async function startGoogleOAuthFlow() {
  try {
    googleTokenDebug.value = null;
    const { authUrl } = await window.mediaApp.generateGoogleAuthUrl({
      clientId: settingsForm.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: settingsForm.GOOGLE_DRIVE_CLIENT_SECRET
    });
    await window.mediaApp.openExternal(authUrl);
    pushToast("Autorizacao aberta", "Depois do login, cole a URL completa retornada pelo Google.");
  } catch (err) {
    pushToast("Falha ao gerar URL", err.message || "Nao foi possivel iniciar.", "error");
  }
}

async function exchangeGoogleCode() {
  generatingRefreshToken.value = true;
  try {
    const tokens = await window.mediaApp.exchangeGoogleCode({
      clientId: settingsForm.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: settingsForm.GOOGLE_DRIVE_CLIENT_SECRET,
      code: googleAuthCode.value.trim()
    });
    googleTokenDebug.value = tokens;
    if (!tokens.refreshToken) {
      throw new Error("O Google respondeu, mas nao enviou refresh token. Revogue o acesso do app na sua conta Google e autorize novamente.");
    }
    settingsForm.GOOGLE_DRIVE_REFRESH_TOKEN = tokens.refreshToken;
    googleAuthCode.value = "";
    pushToast("Refresh token gerado", "O token foi preenchido automaticamente.");
  } catch (err) {
    pushToast("Falha ao gerar token", err.message || "Tente novamente.", "error");
  } finally {
    generatingRefreshToken.value = false;
  }
}

onMounted(async () => {
  await loadConfigState();
  await loadSettingsState();
  await loadLibraryState();

  if (!configStatus.value.configured) {
    settingsOpen.value = true;
    loading.value = false;
    return;
  }

  await loadLibrary();
  metadataSearchTitle.value = activeItem.value?.metadata?.title || activeItem.value?.parsedTitle || activeItem.value?.name || "";
});

watch(
  () => heroCandidates.value.length,
  (length) => {
    if (heroRotationTimer) {
      clearInterval(heroRotationTimer);
      heroRotationTimer = 0;
    }

    if (length > 1) {
      heroRotationTimer = setInterval(() => {
        if (activeItem.value) {
          return;
        }

        heroIndex.value = (heroIndex.value + 1) % length;
      }, 7000);
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (heroRotationTimer) {
    clearInterval(heroRotationTimer);
  }
});
</script>

<template>
  <div class="min-h-screen bg-app text-white">
    <div class="mx-auto max-w-[1720px] px-4 pb-12 sm:px-6 lg:px-8">
      <header class="sticky top-0 z-30 mb-6 flex items-center justify-between gap-4 border-b border-white/8 bg-[rgba(5,5,5,0.92)] py-5 backdrop-blur-xl">
        <div class="flex items-center gap-7">
          <div class="text-2xl font-bold tracking-tight">
            <span class="text-red-500">Cine</span>Drive
          </div>
          <div class="hidden items-center gap-5 md:flex">
            <span class="text-sm font-medium text-white">Inicio</span>
            <span class="text-sm font-medium text-white/50">Series</span>
            <span class="text-sm font-medium text-white/50">Filmes</span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="hidden min-w-[300px] md:block">
            <Input v-model="search" placeholder="Buscar filmes e series" class="h-11 rounded-full border-white/10 bg-white/6" />
          </div>
          <Button variant="outline" size="sm" @click="loadLibrary(true)">Atualizar</Button>
          <Button variant="secondary" size="sm" @click="settingsOpen = true">Configuracoes</Button>
        </div>
      </header>

      <section
        v-if="featuredItem"
        class="stream-hero relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14"
        :style="heroStyle"
      >
        <div class="max-w-2xl">
          <div class="mb-4 flex flex-wrap gap-2">
            <Badge>{{ featuredItem.mediaType === "tv" ? "Serie" : "Filme" }}</Badge>
            <Badge :variant="metadataMatched(featuredItem) ? 'default' : 'secondary'">
              {{ metadataMatched(featuredItem) ? "TMDb sincronizado" : "Sem sincronizacao TMDb" }}
            </Badge>
            <Badge v-if="metaYear(featuredItem)" variant="secondary">{{ metaYear(featuredItem) }}</Badge>
            <Badge variant="secondary">Nota {{ metaVote(featuredItem) }}</Badge>
          </div>

          <h1 class="max-w-[12ch] text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
            {{ titleFor(featuredItem) }}
          </h1>
          <p class="mt-4 max-w-2xl text-sm leading-7 text-white/72 sm:text-base">
            {{ featuredItem.metadata?.overview || "Selecione um titulo para assistir." }}
          </p>

          <div class="mt-7 flex flex-wrap gap-3">
            <Button size="lg" @click="playerSection?.scrollIntoView({ behavior: 'smooth' })">Assistir</Button>
            <Button variant="secondary" size="lg" @click="detailsOpen = true">Detalhes</Button>
            <Button variant="outline" size="lg" @click="toggleFavorite(featuredItem)">Minha Lista</Button>
          </div>
        </div>
      </section>

      <section class="mt-8 space-y-8">
        <div v-if="loading" class="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Card v-for="index in 5" :key="index" class="surface-card rounded-[1.5rem] p-3">
            <Skeleton class="aspect-[2/3] w-full rounded-[1.2rem]" />
            <Skeleton class="mt-3 h-4 w-2/3" />
          </Card>
        </div>

        <Card v-else-if="error" class="surface-card rounded-[1.5rem] p-5 text-sm text-red-200">
          {{ error }}
        </Card>

        <Card
          v-else-if="!filteredItems.length"
          class="surface-card rounded-[1.75rem] p-8 text-center"
        >
          <p class="section-kicker">Biblioteca</p>
          <h2 class="text-2xl font-semibold text-white">Nenhum video encontrado</h2>
          <p class="mx-auto mt-3 max-w-2xl text-sm leading-7 text-white/60">
            Revise a conexao com o Google Drive, confirme a pasta escolhida e atualize a biblioteca para importar seus filmes e series.
          </p>
          <div class="mt-6 flex flex-wrap justify-center gap-3">
            <Button @click="settingsOpen = true">Abrir configuracoes</Button>
            <Button variant="outline" @click="loadLibrary(true)">Atualizar biblioteca</Button>
          </div>
        </Card>

        <template v-else>
          <section v-if="continueWatchingItems.length">
            <div class="mb-4 flex items-center justify-between gap-3">
              <h2 class="text-2xl font-semibold">Continuar assistindo</h2>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="scrollCarousel('continue', -1)">&lt;</Button>
                <Button variant="outline" size="sm" @click="scrollCarousel('continue', 1)">&gt;</Button>
              </div>
            </div>

            <ScrollArea class="stream-row">
              <div :ref="(el) => setCarouselRef('continue', el)" class="stream-grid">
                <button
                  v-for="item in continueWatchingItems"
                  :key="item.id"
                  class="stream-card"
                  @click="selectItem(item)"
                  @mouseenter="setHeroFromCarousel(item)"
                >
                  <div class="stream-frame">
                    <img v-if="item.metadata?.posterUrl" :src="item.metadata.posterUrl" :alt="titleFor(item)" class="stream-poster" />
                    <div v-else class="stream-poster stream-fallback">{{ titleFor(item).slice(0, 1) }}</div>
                    <div class="stream-overlay">
                      <div class="stream-overlay-top">
                        <span class="stream-chip">{{ metaYear(item) || "HD" }}</span>
                        <button class="stream-icon" @click.stop="toggleFavorite(item)">+</button>
                      </div>
                      <button class="stream-play" @click.stop="selectItem(item)">Assistir</button>
                    </div>
                    <div class="stream-progress-shell">
                      <div class="stream-progress-fill" :style="{ width: `${getPlaybackProgress(item)}%` }"></div>
                    </div>
                  </div>
                  <strong class="mt-3 block truncate text-sm font-semibold">{{ titleFor(item) }}</strong>
                  <p class="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                    {{ shortOverview(item) || "Sem sinopse sincronizada." }}
                  </p>
                  <div class="mt-2 h-1.5 rounded-full bg-white/10">
                    <div class="h-1.5 rounded-full bg-red-500" :style="{ width: `${getPlaybackProgress(item)}%` }"></div>
                  </div>
                </button>
              </div>
            </ScrollArea>
          </section>

          <section v-if="nextEpisodeItems.length">
            <div class="mb-4 flex items-center justify-between gap-3">
              <h2 class="text-2xl font-semibold">Proximo episodio</h2>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="scrollCarousel('next', -1)">&lt;</Button>
                <Button variant="outline" size="sm" @click="scrollCarousel('next', 1)">&gt;</Button>
              </div>
            </div>

            <ScrollArea class="stream-row">
              <div :ref="(el) => setCarouselRef('next', el)" class="stream-grid">
                <button
                  v-for="entry in nextEpisodeItems"
                  :key="entry.key"
                  class="stream-card"
                  @click="selectItem(entry.episode)"
                  @mouseenter="setHeroFromCarousel(entry.episode)"
                >
                  <div class="stream-frame">
                    <img v-if="entry.posterUrl" :src="entry.posterUrl" :alt="entry.title" class="stream-poster" />
                    <div v-else class="stream-poster stream-fallback">{{ entry.title.slice(0, 1) }}</div>
                    <div class="stream-overlay">
                      <div class="stream-overlay-top">
                        <span class="stream-chip">T{{ entry.episode.season || 1 }}E{{ entry.episode.episode || "?" }}</span>
                        <span class="stream-chip subtle">{{ entry.vote }}</span>
                      </div>
                      <button class="stream-play" @click.stop="selectItem(entry.episode)">Assistir</button>
                    </div>
                  </div>
                  <strong class="mt-3 block truncate text-sm font-semibold">{{ entry.title }}</strong>
                  <p class="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                    {{ shortOverview(entry.episode) || "Sem sinopse sincronizada." }}
                  </p>
                </button>
              </div>
            </ScrollArea>
          </section>

          <section>
            <div class="mb-4 flex items-center justify-between gap-3">
              <h2 class="text-2xl font-semibold">Filmes</h2>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="scrollCarousel('movies', -1)">&lt;</Button>
                <Button variant="outline" size="sm" @click="scrollCarousel('movies', 1)">&gt;</Button>
              </div>
            </div>

            <ScrollArea class="stream-row">
              <div :ref="(el) => setCarouselRef('movies', el)" class="stream-grid">
                <button
                  v-for="item in movieItems"
                  :key="item.id"
                  class="stream-card"
                  @click="selectItem(item)"
                  @mouseenter="setHeroFromCarousel(item)"
                >
                  <div class="stream-frame">
                    <img v-if="item.metadata?.posterUrl" :src="item.metadata.posterUrl" :alt="titleFor(item)" class="stream-poster" />
                    <div v-else class="stream-poster stream-fallback">{{ titleFor(item).slice(0, 1) }}</div>
                    <div class="stream-overlay">
                      <div class="stream-overlay-top">
                        <span class="stream-chip">{{ metaYear(item) || "Filme" }}</span>
                        <span class="stream-chip subtle">{{ metaVote(item) }}</span>
                      </div>
                      <div class="stream-overlay-actions">
                        <button class="stream-play" @click.stop="selectItem(item)">Assistir</button>
                        <button class="stream-icon" @click.stop="toggleFavorite(item)">+</button>
                      </div>
                    </div>
                  </div>
                  <strong class="mt-3 block truncate text-sm font-semibold">{{ titleFor(item) }}</strong>
                  <p class="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                    {{ shortOverview(item) || "Sem sinopse sincronizada." }}
                  </p>
                </button>
              </div>
            </ScrollArea>
          </section>

          <section>
            <div class="mb-4 flex items-center justify-between gap-3">
              <h2 class="text-2xl font-semibold">Series</h2>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="scrollCarousel('series', -1)">&lt;</Button>
                <Button variant="outline" size="sm" @click="scrollCarousel('series', 1)">&gt;</Button>
              </div>
            </div>

            <ScrollArea class="stream-row">
              <div :ref="(el) => setCarouselRef('series', el)" class="stream-grid">
                <button
                  v-for="entry in seriesGroups"
                  :key="entry.key"
                  class="stream-card"
                  @click="entry.firstItem && selectItem(entry.firstItem)"
                  @mouseenter="entry.firstItem && setHeroFromCarousel(entry.firstItem)"
                >
                  <div class="stream-frame">
                    <img v-if="entry.posterUrl" :src="entry.posterUrl" :alt="entry.title" class="stream-poster" />
                    <div v-else class="stream-poster stream-fallback">{{ entry.title.slice(0, 1) }}</div>
                    <div class="stream-overlay">
                      <div class="stream-overlay-top">
                        <span class="stream-chip">{{ entry.year || "Serie" }}</span>
                        <span class="stream-chip subtle">{{ entry.vote }}</span>
                      </div>
                      <div class="stream-overlay-actions">
                        <button class="stream-play" @click.stop="entry.firstItem && selectItem(entry.firstItem)">Abrir</button>
                      </div>
                    </div>
                  </div>
                  <strong class="mt-3 block truncate text-sm font-semibold">{{ entry.title }}</strong>
                  <p class="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                    {{ shortOverview(entry.firstItem) || "Sem sinopse sincronizada." }}
                  </p>
                </button>
              </div>
            </ScrollArea>
          </section>

          <section v-if="favoriteItems.length">
            <div class="mb-4 flex items-center justify-between gap-3">
              <h2 class="text-2xl font-semibold">Minha Lista</h2>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="scrollCarousel('favorites', -1)">&lt;</Button>
                <Button variant="outline" size="sm" @click="scrollCarousel('favorites', 1)">&gt;</Button>
              </div>
            </div>

            <ScrollArea class="stream-row">
              <div :ref="(el) => setCarouselRef('favorites', el)" class="stream-grid">
                <button
                  v-for="item in favoriteItems"
                  :key="item.id"
                  class="stream-card"
                  @click="selectItem(item)"
                  @mouseenter="setHeroFromCarousel(item)"
                >
                  <div class="stream-frame">
                    <img v-if="item.metadata?.posterUrl" :src="item.metadata.posterUrl" :alt="titleFor(item)" class="stream-poster" />
                    <div v-else class="stream-poster stream-fallback">{{ titleFor(item).slice(0, 1) }}</div>
                    <div class="stream-overlay">
                      <div class="stream-overlay-top">
                        <span class="stream-chip">{{ metaYear(item) || "Lista" }}</span>
                      </div>
                      <div class="stream-overlay-actions">
                        <button class="stream-play" @click.stop="selectItem(item)">Assistir</button>
                        <button class="stream-icon" @click.stop="toggleFavorite(item)">-</button>
                      </div>
                    </div>
                  </div>
                  <strong class="mt-3 block truncate text-sm font-semibold">{{ titleFor(item) }}</strong>
                  <p class="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                    {{ shortOverview(item) || "Sem sinopse sincronizada." }}
                  </p>
                </button>
              </div>
            </ScrollArea>
          </section>

          <section v-if="featuredItem" ref="playerSection" class="pt-4">
            <VideoPlayer
              :key="featuredItem.id"
              :item="featuredItem"
              :resume-position="libraryState.playback[featuredItem.id]?.position || 0"
            />
          </section>
        </template>
      </section>
    </div>

    <teleport to="body">
      <div
        v-if="detailsOpen"
        class="fixed inset-0 z-[68] flex items-center justify-center bg-black/78 p-4 backdrop-blur-md"
        @click.self="detailsOpen = false"
      >
        <div class="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[rgba(8,8,8,0.99)] shadow-[0_30px_120px_rgba(0,0,0,0.58)]">
          <div
            v-if="featuredItem"
            class="relative border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6"
            :style="
              featuredItem.metadata?.backdropUrl
                ? {
                    backgroundImage: `linear-gradient(90deg, rgba(8,8,8,.98) 0%, rgba(8,8,8,.9) 42%, rgba(8,8,8,.6) 100%), url(${featuredItem.metadata.backdropUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }
                : undefined
            "
          >
            <div class="relative z-10 flex items-start justify-between gap-4">
              <div class="max-w-3xl">
                <p class="section-kicker mb-2">Detalhes</p>
                <h2 class="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                  {{ titleFor(featuredItem) }}
                </h2>
                <div class="mt-3 flex flex-wrap gap-2">
                  <Badge :variant="metadataMatched(featuredItem) ? 'default' : 'secondary'">
                    {{ metadataMatched(featuredItem) ? "Reconhecido no TMDb" : "Sem correspondencia exata" }}
                  </Badge>
                  <Badge v-if="metaYear(featuredItem)" variant="secondary">{{ metaYear(featuredItem) }}</Badge>
                  <Badge variant="secondary">Nota {{ metaVote(featuredItem) }}</Badge>
                  <Badge variant="secondary">{{ featuredItem.mediaType === "tv" ? "Serie" : "Filme" }}</Badge>
                </div>
                <p class="mt-4 max-w-2xl text-sm leading-7 text-white/72 sm:text-base">
                  {{ featuredItem.metadata?.overview || "Sem descricao disponivel." }}
                </p>
              </div>
              <Button variant="ghost" size="sm" @click="detailsOpen = false">Fechar</Button>
            </div>
          </div>

          <div class="max-h-[calc(90vh-220px)] overflow-y-auto px-5 py-5 sm:px-6">
            <div v-if="featuredItem" class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
              <img
                v-if="featuredItem.metadata?.posterUrl"
                :src="featuredItem.metadata.posterUrl"
                :alt="titleFor(featuredItem)"
                class="aspect-[2/3] w-full rounded-[1.4rem] object-cover shadow-[0_22px_60px_rgba(0,0,0,0.35)]"
              />
              <div
                v-else
                class="grid aspect-[2/3] w-full place-items-center rounded-[1.4rem] bg-white/5 text-5xl font-semibold text-white/65"
              >
                {{ titleFor(featuredItem).slice(0, 1) }}
              </div>

              <div class="space-y-5">
                <div class="grid gap-4 sm:grid-cols-3">
                  <div class="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                    <p class="text-xs uppercase tracking-[0.18em] text-white/35">Lancamento</p>
                    <p class="mt-2 text-sm font-medium text-white">
                      {{ featuredItem.metadata?.releaseDate || metaYear(featuredItem) || "Nao informado" }}
                    </p>
                  </div>
                  <div class="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                    <p class="text-xs uppercase tracking-[0.18em] text-white/35">Titulo original</p>
                    <p class="mt-2 text-sm font-medium text-white">
                      {{ featuredItem.metadata?.originalTitle || titleFor(featuredItem) }}
                    </p>
                  </div>
                  <div class="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                    <p class="text-xs uppercase tracking-[0.18em] text-white/35">Arquivo</p>
                    <p class="mt-2 text-sm font-medium text-white">
                      {{ featuredItem.extension ? featuredItem.extension.toUpperCase().replace(".", "") : "Video" }}
                    </p>
                  </div>
                </div>

                <div class="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                  <p class="text-sm font-medium text-white">Sinopse</p>
                  <p class="mt-3 text-sm leading-7 text-white/70">
                    {{ featuredItem.metadata?.overview || "Sem sinopse disponivel." }}
                  </p>
                </div>

                <div class="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                  <p class="text-sm font-medium text-white">Buscar novamente no TMDb</p>
                  <p class="mt-1 text-sm text-white/55">
                    Se o titulo foi reconhecido errado, ajuste a busca manualmente.
                  </p>

                  <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                      v-model="metadataSearchTitle"
                      placeholder="Digite o nome correto do filme ou serie"
                    />
                    <Button :disabled="searchingMetadata" @click="searchMetadataForFeaturedItem">
                      {{ searchingMetadata ? "Buscando..." : "Buscar no TMDb" }}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div
        v-if="settingsOpen"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/78 p-3 backdrop-blur-md"
        @click.self="settingsOpen = false"
      >
        <div class="max-h-[92vh] w-full max-w-[1180px] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[rgba(8,8,8,0.98)] shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
          <div class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
            <div>
              <p class="section-kicker mb-1">Configuracoes</p>
              <h2 class="text-xl font-semibold text-white">Conectar Google Drive</h2>
              <p class="mt-1 text-sm text-white/65">Conecte sua biblioteca primeiro. O TMDb e opcional.</p>
            </div>
            <Button variant="ghost" size="sm" @click="settingsOpen = false">Fechar</Button>
          </div>

          <div class="max-h-[calc(92vh-132px)] overflow-y-auto px-5 py-4 sm:px-6">
            <div class="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
              <div class="space-y-4">
                <Card class="rounded-[1.3rem] p-4">
                  <p class="section-kicker">Resumo</p>
                  <div class="flex items-end justify-between gap-4">
                    <div>
                      <p class="text-3xl font-semibold text-white">{{ driveSetupProgress }}/3</p>
                      <p class="mt-1 text-xs text-white/55">etapas do Google Drive prontas</p>
                    </div>
                    <Badge :variant="googleDriveConfigured ? 'default' : 'secondary'">
                      {{ googleDriveConfigured ? "Drive pronto" : "Configurar Drive" }}
                    </Badge>
                  </div>

                  <div class="mt-4 space-y-2.5">
                    <div
                      v-for="step in googleSetupSteps"
                      :key="step.title"
                      class="rounded-[1rem] border border-white/8 bg-white/[0.03] p-3"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <strong class="text-sm font-semibold text-white">{{ step.title }}</strong>
                        <span class="text-xs font-medium" :class="step.done ? 'text-emerald-300' : 'text-white/45'">
                          {{ step.done ? "OK" : "Falta" }}
                        </span>
                      </div>
                      <p class="mt-2 text-sm leading-6 text-white/60">{{ step.description }}</p>
                    </div>
                  </div>

                  <div class="mt-4 rounded-[1rem] border border-red-500/15 bg-red-500/8 p-3">
                    <p class="text-sm font-medium text-white">Importante sobre o Google Drive</p>
                    <p class="mt-1.5 text-sm leading-6 text-white/60">
                      Para acessar arquivos privados do seu Drive, o `Refresh Token` ainda e obrigatorio. Sem ele, so funcionaria com arquivos publicos.
                    </p>
                  </div>

                  <div class="mt-4 rounded-[1rem] border border-white/8 bg-white/[0.03] p-3">
                    <p class="text-sm font-medium text-white">Fluxo mais simples</p>
                    <p class="mt-1.5 text-sm leading-6 text-white/60">
                      1. Cole `Client ID` e `Client Secret`.
                      2. Clique em `Abrir autorizacao`.
                      3. Cole a URL retornada pelo Google.
                      4. Gere o token.
                      5. Cole a URL da pasta.
                      6. Clique em `Salvar e conectar biblioteca`.
                    </p>
                  </div>
                </Card>
              </div>

              <div class="grid gap-4">
                <Card class="rounded-[1.3rem] p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="section-kicker">Google Drive</p>
                      <h3 class="text-lg font-semibold text-white">Biblioteca de videos</h3>
                    </div>
                    <Badge :variant="googleFolderReady && googleRefreshReady ? 'default' : 'secondary'">
                      {{ googleFolderReady && googleRefreshReady ? "Quase pronto" : "Configurar" }}
                    </Badge>
                  </div>

                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <div class="space-y-2">
                      <label class="text-sm font-medium">{{ fieldLabel("GOOGLE_DRIVE_CLIENT_ID", "Client ID") }}</label>
                      <Input
                        v-model="settingsForm.GOOGLE_DRIVE_CLIENT_ID"
                        placeholder="Cole o Client ID do Google Cloud"
                      />
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm font-medium">{{ fieldLabel("GOOGLE_DRIVE_CLIENT_SECRET", "Client Secret") }}</label>
                      <Input
                        v-model="settingsForm.GOOGLE_DRIVE_CLIENT_SECRET"
                        type="password"
                        placeholder="Cole o Client Secret do app desktop"
                      />
                    </div>
                  </div>

                  <div class="mt-4 rounded-[1rem] border border-white/8 bg-white/[0.03] p-3">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p class="text-sm font-semibold text-white">Gerar refresh token</p>
                        <p class="mt-1 text-sm text-white/58">Clique no botao, faca login e cole o code retornado pelo Google.</p>
                      </div>
                      <Button variant="secondary" :disabled="!googleCredentialsReady" @click="startGoogleOAuthFlow">
                        Abrir autorizacao
                      </Button>
                    </div>

                    <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input v-model="googleAuthCode" placeholder="Cole aqui a URL completa ou apenas o code do Google" />
                      <Button :disabled="generatingRefreshToken || !googleCredentialsReady" @click="exchangeGoogleCode">
                        {{ generatingRefreshToken ? "Gerando..." : "Gerar token" }}
                      </Button>
                    </div>

                    <div class="mt-3 space-y-2">
                      <label class="text-sm font-medium">{{ fieldLabel("GOOGLE_DRIVE_REFRESH_TOKEN", "Refresh Token") }}</label>
                      <Input
                        v-model="settingsForm.GOOGLE_DRIVE_REFRESH_TOKEN"
                        type="password"
                        placeholder="Sera preenchido automaticamente apos gerar"
                      />
                      <p class="text-xs leading-5 text-white/45">
                        Se voce nao conseguir gerar agora, a conexao com o Drive vai continuar pendente.
                      </p>
                    </div>
                  </div>

                  <Card v-if="googleTokenDebug" class="mt-4 rounded-[1.2rem] p-4">
                    <p class="section-kicker">Diagnostico OAuth</p>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p class="text-xs uppercase tracking-[0.18em] text-white/35">Refresh Token</p>
                        <p class="mt-2 text-sm font-medium text-white">
                          {{ googleTokenDebug.hasRefreshToken ? "Recebido" : "Nao retornado pelo Google" }}
                        </p>
                      </div>
                      <div>
                        <p class="text-xs uppercase tracking-[0.18em] text-white/35">Escopo</p>
                        <p class="mt-2 break-all text-sm text-white/70">{{ googleTokenDebug.scope || "Nao informado" }}</p>
                      </div>
                    </div>

                    <div v-if="!googleTokenDebug.hasRefreshToken" class="mt-3 rounded-[1rem] border border-amber-400/20 bg-amber-400/8 p-3">
                      <p class="text-sm font-medium text-white">Como corrigir</p>
                      <p class="mt-2 text-sm leading-6 text-white/65">
                        O Google aceitou a autorizacao, mas nao devolveu `refresh token`. Isso geralmente acontece quando esse app ja foi autorizado antes.
                        Remova o acesso do app na sua conta Google, depois clique em `Abrir autorizacao` novamente e gere um novo token.
                      </p>
                    </div>
                  </Card>

                  <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div class="space-y-2">
                      <label class="text-sm font-medium">{{ fieldLabel("GOOGLE_DRIVE_FOLDER_ID", "Folder ID") }}</label>
                      <Input
                        v-model="settingsForm.GOOGLE_DRIVE_FOLDER_ID"
                        placeholder="Cole a URL da pasta ou o Folder ID"
                      />
                    </div>
                    <div class="flex items-end">
                      <Button variant="outline" class="w-full sm:w-auto" @click="extractFolderIdFromInput">Extrair ID</Button>
                    </div>
                  </div>

                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    <div class="space-y-2">
                      <label class="text-sm font-medium">{{ fieldLabel("GOOGLE_DRIVE_SHARED_DRIVE_ID", "Shared Drive ID") }}</label>
                      <Input
                        v-model="settingsForm.GOOGLE_DRIVE_SHARED_DRIVE_ID"
                        placeholder="Opcional, use apenas em Shared Drive"
                      />
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm font-medium">Importar subpastas</label>
                      <div class="flex gap-2">
                        <Button
                          :variant="settingsForm.GOOGLE_DRIVE_RECURSIVE !== 'false' ? 'default' : 'outline'"
                          class="flex-1"
                          @click="settingsForm.GOOGLE_DRIVE_RECURSIVE = 'true'"
                        >
                          Sim
                        </Button>
                        <Button
                          :variant="settingsForm.GOOGLE_DRIVE_RECURSIVE === 'false' ? 'default' : 'outline'"
                          class="flex-1"
                          @click="settingsForm.GOOGLE_DRIVE_RECURSIVE = 'false'"
                        >
                          Nao
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card class="rounded-[1.3rem] p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="section-kicker">TMDb</p>
                      <h3 class="text-lg font-semibold text-white">Capas e sinopses</h3>
                    </div>
                    <Badge :variant="tmdbConfigured ? 'default' : 'secondary'">
                      {{ tmdbConfigured ? "Ativo" : "Opcional" }}
                    </Badge>
                  </div>

                  <p class="mt-3 text-sm leading-6 text-white/58">
                    Voce pode deixar isso para depois. Sem o TMDb, o app ainda acessa seus videos do Google Drive normalmente.
                  </p>

                  <div class="mt-4 space-y-2">
                    <label class="text-sm font-medium">{{ settingsSections.tmdb[0]?.label || "TMDb API Token" }}</label>
                    <Input
                      v-model="settingsForm.TMDB_API_TOKEN"
                      type="password"
                      placeholder="Opcional por enquanto"
                    />
                  </div>
                </Card>

                <Card class="rounded-[1.3rem] p-4">
                  <p class="section-kicker">Aplicativo</p>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="space-y-2">
                      <label class="text-sm font-medium">{{ settingsSections.app[0]?.label || "Porta local do player" }}</label>
                      <Input v-model="settingsForm.APP_MEDIA_PORT" placeholder="3867" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm font-medium">Transcodificar MKV/AVI com FFmpeg</label>
                      <div class="flex gap-2">
                        <Button
                          :variant="settingsForm.APP_ENABLE_TRANSCODE !== 'false' ? 'default' : 'outline'"
                          class="flex-1"
                          @click="settingsForm.APP_ENABLE_TRANSCODE = 'true'"
                        >
                          Sim
                        </Button>
                        <Button
                          :variant="settingsForm.APP_ENABLE_TRANSCODE === 'false' ? 'default' : 'outline'"
                          class="flex-1"
                          @click="settingsForm.APP_ENABLE_TRANSCODE = 'false'"
                        >
                          Nao
                        </Button>
                      </div>
                    </div>
                    <div class="space-y-2 sm:col-span-2">
                      <label class="text-sm font-medium">Caminho do FFmpeg</label>
                      <Input
                        v-model="settingsForm.FFMPEG_PATH"
                        placeholder="Opcional. Ex.: C:\\ffmpeg\\bin\\ffmpeg.exe"
                      />
                      <p class="text-xs leading-5 text-white/45">
                        Se o `ffmpeg` ja estiver no PATH do Windows, voce pode deixar esse campo vazio.
                      </p>
                    </div>
                  </div>
                </Card>

                <div v-if="testResults" class="grid gap-4 sm:grid-cols-3">
                  <Card class="rounded-[1.2rem] p-4">
                    <p class="text-xs uppercase tracking-[0.18em] text-white/35">TMDb</p>
                    <p class="mt-2 text-sm text-white/70">{{ testResults.tmdb.message }}</p>
                  </Card>
                  <Card class="rounded-[1.2rem] p-4">
                    <p class="text-xs uppercase tracking-[0.18em] text-white/35">Google Drive</p>
                    <p class="mt-2 text-sm text-white/70">{{ testResults.drive.message }}</p>
                  </Card>
                  <Card class="rounded-[1.2rem] p-4">
                    <p class="text-xs uppercase tracking-[0.18em] text-white/35">FFmpeg</p>
                    <p class="mt-2 text-sm text-white/70">{{ testResults.ffmpeg.message }}</p>
                  </Card>
                </div>

                <Card v-if="ffmpegTestDetails" class="rounded-[1.2rem] p-4">
                  <p class="section-kicker">Transcodificacao</p>
                  <div class="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p class="text-xs uppercase tracking-[0.18em] text-white/35">Status</p>
                      <p class="mt-2 text-sm font-medium text-white">
                        {{ ffmpegTestDetails.available ? "FFmpeg pronto" : "FFmpeg indisponivel" }}
                      </p>
                    </div>
                    <div class="sm:col-span-2">
                      <p class="text-xs uppercase tracking-[0.18em] text-white/35">Comando</p>
                      <p class="mt-2 break-all text-sm font-medium text-white">
                        {{ ffmpegTestDetails.command || "Nao definido" }}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card v-if="driveTestDetails" class="rounded-[1.2rem] p-4">
                  <p class="section-kicker">Biblioteca encontrada</p>
                  <div class="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p class="text-xs uppercase tracking-[0.18em] text-white/35">Pasta</p>
                      <p class="mt-2 text-sm font-medium text-white">{{ driveTestDetails.folder?.name || "Sem nome" }}</p>
                    </div>
                    <div>
                      <p class="text-xs uppercase tracking-[0.18em] text-white/35">Videos</p>
                      <p class="mt-2 text-sm font-medium text-white">{{ driveTestDetails.totalVideos }}</p>
                    </div>
                    <div>
                      <p class="text-xs uppercase tracking-[0.18em] text-white/35">Modo</p>
                      <p class="mt-2 text-sm font-medium text-white">
                        {{ driveTestDetails.recursive ? "Recursivo" : "Pasta atual" }}
                      </p>
                    </div>
                  </div>

                  <div v-if="driveTestDetails.sampleVideos?.length" class="mt-4">
                    <p class="text-xs uppercase tracking-[0.18em] text-white/35">Exemplos</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <span
                        v-for="videoName in driveTestDetails.sampleVideos"
                        :key="videoName"
                        class="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75"
                      >
                        {{ videoName }}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          <div class="sticky bottom-0 flex flex-wrap gap-2 border-t border-white/10 bg-[rgba(8,8,8,0.98)] px-5 py-4 sm:px-6">
            <Button variant="secondary" size="sm" :disabled="connectingDrive" @click="connectDriveAndLoad">
              {{ connectingDrive ? "Conectando..." : "Salvar e conectar biblioteca" }}
            </Button>
            <Button size="sm" :disabled="savingSettings" @click="saveSettings">
              {{ savingSettings ? "Salvando..." : "Salvar" }}
            </Button>
            <Button variant="secondary" size="sm" :disabled="testingSettings" @click="testSettingsConnection">
              {{ testingSettings ? "Testando..." : "Testar conexao" }}
            </Button>
            <Button variant="ghost" size="sm" @click="settingsOpen = false">Fechar</Button>
          </div>
        </div>
      </div>
    </teleport>

    <ToastViewport :toasts="toasts" />
  </div>
</template>
