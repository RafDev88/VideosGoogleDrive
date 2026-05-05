<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  resumePosition: {
    type: Number,
    default: 0
  }
});

const videoElement = ref(null);
const externalPlayerMessage = ref("");
let progressTimer = 0;

async function openInExternalPlayer() {
  try {
    const result = await window.mediaApp.openInExternalPlayer({
      url: props.item.playbackUrl
    });
    externalPlayerMessage.value = `Abrindo em ${result.playerName}.`;
  } catch (error) {
    externalPlayerMessage.value = error.message || "Nao foi possivel abrir no player externo.";
  }
}

function persistPlayback(finished = false) {
  const element = videoElement.value;
  if (!element) {
    return;
  }

  window.mediaApp.savePlaybackProgress({
    fileId: props.item.id,
    position: finished ? 0 : Number(element.currentTime || 0),
    duration: Number(element.duration || 0),
    seriesKey: props.item.seriesKey || "",
    season: props.item.season || 1,
    episode: props.item.episode || 0,
    title: props.item.metadata?.title || props.item.parsedTitle || props.item.name,
    finished
  }).catch(() => {});
}

function handleLoadedMetadata() {
  const element = videoElement.value;
  if (!element) {
    return;
  }

  const duration = Number(element.duration || 0);
  const targetPosition = Number(props.resumePosition || 0);

  if (targetPosition > 0 && duration > 0) {
    element.currentTime = Math.min(targetPosition, Math.max(duration - 2, 0));
  }
}

function handleTimeUpdate() {
  const now = Date.now();
  if (now - progressTimer < 3000) {
    return;
  }

  progressTimer = now;
  persistPlayback(false);
}

function handleEnded() {
  persistPlayback(true);
}

onMounted(() => {
  const element = videoElement.value;
  if (!element || !(props.item.playableInApp || props.item.transcodeReady)) {
    return;
  }

  element.addEventListener("loadedmetadata", handleLoadedMetadata);
  element.addEventListener("timeupdate", handleTimeUpdate);
  element.addEventListener("ended", handleEnded);
});

onBeforeUnmount(() => {
  const element = videoElement.value;
  if (!element) {
    return;
  }

  persistPlayback(false);
  element.removeEventListener("loadedmetadata", handleLoadedMetadata);
  element.removeEventListener("timeupdate", handleTimeUpdate);
  element.removeEventListener("ended", handleEnded);
});
</script>

<template>
  <div class="surface-card rounded-[2rem] p-6">
    <div class="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="section-kicker">Player</p>
        <h3 class="text-2xl font-semibold text-white">{{ item.metadata?.title || item.parsedTitle }}</h3>
      </div>
      <span class="text-sm text-slate-400">{{ item.name }}</span>
    </div>

    <div
      v-if="item.metadata"
      class="mb-6 grid gap-4 rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4 lg:grid-cols-[140px_minmax(0,1fr)]"
    >
      <img
        v-if="item.metadata.posterUrl"
        :src="item.metadata.posterUrl"
        :alt="item.metadata.title || item.parsedTitle"
        class="aspect-[2/3] w-full max-w-[140px] rounded-[1rem] object-cover"
      />
      <div
        v-else
        class="grid aspect-[2/3] w-full max-w-[140px] place-items-center rounded-[1rem] bg-white/5 text-3xl font-semibold text-white/70"
      >
        {{ (item.metadata.title || item.parsedTitle || item.name || "?").slice(0, 1) }}
      </div>

      <div class="min-w-0">
        <div class="flex flex-wrap gap-2">
          <span v-if="item.mediaType" class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
            {{ item.mediaType === "tv" ? "Serie" : "Filme" }}
          </span>
          <span
            v-if="item.metadata.releaseDate"
            class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75"
          >
            Lancamento {{ item.metadata.releaseDate.slice(0, 4) }}
          </span>
          <span
            v-if="item.metadata.voteAverage"
            class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75"
          >
            Nota {{ Number(item.metadata.voteAverage).toFixed(1) }}
          </span>
        </div>

        <h4 class="mt-3 text-xl font-semibold text-white">
          {{ item.metadata.title || item.parsedTitle }}
        </h4>
        <p v-if="item.metadata.originalTitle" class="mt-1 text-sm text-white/45">
          Titulo original: {{ item.metadata.originalTitle }}
        </p>
        <p class="mt-3 text-sm leading-7 text-white/70">
          {{ item.metadata.overview || "Sem sinopse encontrada." }}
        </p>
      </div>
    </div>

    <div
      v-if="!(item.playableInApp || item.transcodeReady)"
      class="rounded-[1.5rem] border border-amber-400/15 bg-amber-400/8 p-6 text-white"
    >
      <p class="text-sm font-semibold">Formato nao suportado no player interno</p>
      <p class="mt-2 text-sm leading-6 text-white/70">
        {{ item.playbackIssue || "Esse arquivo nao pode ser reproduzido diretamente no Electron." }}
      </p>
      <p class="mt-3 text-xs uppercase tracking-[0.18em] text-white/35">
        Formato detectado: {{ item.extension || "desconhecido" }}
      </p>
      <div class="mt-4 flex flex-wrap gap-3">
        <Button size="sm" @click="openInExternalPlayer">Abrir no player externo</Button>
      </div>
      <p v-if="externalPlayerMessage" class="mt-3 text-sm text-white/70">
        {{ externalPlayerMessage }}
      </p>
    </div>

    <div v-else class="overflow-hidden rounded-[1.6rem] border border-white/8 bg-black">
      <video
        ref="videoElement"
        :src="item.playbackUrl"
        :type="item.transcodeReady ? 'video/mp4' : (item.mimeType || 'video/mp4')"
        controls
        preload="metadata"
        playsinline
        class="aspect-video w-full bg-black object-contain"
      ></video>
    </div>
  </div>
</template>
