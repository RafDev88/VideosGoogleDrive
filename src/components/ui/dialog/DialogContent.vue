<script setup>
import { computed, inject } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps({
  class: {
    type: String,
    default: ""
  }
});

const open = inject("dialog-open");
const setOpen = inject("dialog-set-open");

const classes = computed(() =>
  cn(
    "relative z-10 w-full max-w-3xl rounded-[2rem] border border-white/10 bg-[rgba(8,14,26,0.96)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl",
    props.class
  )
);
</script>

<template>
  <teleport to="body">
    <div
      v-if="open?.value"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      @click.self="setOpen(false)"
    >
      <div :class="classes">
        <slot />
      </div>
    </div>
  </teleport>
</template>
