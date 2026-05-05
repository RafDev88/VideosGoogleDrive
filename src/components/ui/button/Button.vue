<script setup>
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps({
  variant: {
    type: String,
    default: "default"
  },
  size: {
    type: String,
    default: "default"
  },
  class: {
    type: String,
    default: ""
  },
  type: {
    type: String,
    default: "button"
  }
});

const classes = computed(() =>
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:ring-2 focus-visible:ring-red-400/35",
    props.variant === "default" && "border border-transparent bg-[linear-gradient(135deg,#b70f1d,#e11d2e)] text-white shadow-[0_18px_44px_rgba(225,29,46,0.24)]",
    props.variant === "outline" && "border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/8",
    props.variant === "ghost" && "border border-transparent bg-transparent text-slate-200 hover:bg-white/6 hover:text-white",
    props.variant === "secondary" && "border border-white/8 bg-white/6 text-white hover:bg-white/8",
    props.size === "default" && "h-11 px-5 py-2.5",
    props.size === "sm" && "h-9 rounded-xl px-3.5",
    props.size === "lg" && "h-12 rounded-2xl px-6 text-base",
    props.class
  )
);
</script>

<template>
  <button :type="type" :class="classes">
    <slot />
  </button>
</template>
