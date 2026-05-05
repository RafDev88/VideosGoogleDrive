<script setup>
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps({
  class: {
    type: String,
    default: ""
  }
});

const classes = computed(() => cn("text-xl font-semibold tracking-tight text-white", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
