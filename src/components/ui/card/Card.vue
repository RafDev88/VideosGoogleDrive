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
  cn(
    "border border-white/10 bg-[rgba(10,17,31,0.78)] backdrop-blur-[14px] shadow-[0_24px_80px_rgba(0,0,0,0.35)]",
    props.class
  )
);
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
