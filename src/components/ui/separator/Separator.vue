<script setup>
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps({
  class: {
    type: String,
    default: ""
  }
});

const classes = computed(() => cn("h-px w-full bg-white/10", props.class));
</script>

<template>
  <div :class="classes" />
</template>
