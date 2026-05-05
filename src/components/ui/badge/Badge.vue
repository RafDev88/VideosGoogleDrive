<script setup>
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps({
  variant: {
    type: String,
    default: "default"
  },
  class: {
    type: String,
    default: ""
  }
});

const classes = computed(() =>
  cn(
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.12em]",
    props.variant === "default" && "border-amber-400/20 bg-amber-500/14 text-amber-100",
    props.variant === "secondary" && "border-white/10 bg-white/6 text-slate-300",
    props.variant === "success" && "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    props.class
  )
);
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
