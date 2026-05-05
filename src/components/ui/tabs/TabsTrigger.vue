<script setup>
import { computed, inject } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps({
  value: {
    type: String,
    required: true
  },
  class: {
    type: String,
    default: ""
  }
});

const tabsValue = inject("tabs-value");
const setValue = inject("tabs-set-value");

const isActive = computed(() => tabsValue?.value === props.value);
const classes = computed(() =>
  cn(
    "inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-medium transition-all",
    isActive.value
      ? "bg-white text-slate-950 shadow-sm"
      : "text-slate-300 hover:bg-white/6 hover:text-white",
    props.class
  )
);
</script>

<template>
  <button :class="classes" type="button" @click="setValue(props.value)">
    <slot />
  </button>
</template>
