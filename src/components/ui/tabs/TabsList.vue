<script setup>
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps({
  class: {
    type: String,
    default: ""
  }
});

const classes = computed(() =>
  cn("inline-flex h-11 items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1", props.class)
);
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
