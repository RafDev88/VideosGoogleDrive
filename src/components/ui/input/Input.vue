<script setup>
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps({
  modelValue: {
    type: String,
    default: ""
  },
  class: {
    type: String,
    default: ""
  },
  placeholder: {
    type: String,
    default: ""
  },
  type: {
    type: String,
    default: "text"
  }
});

const emit = defineEmits(["update:modelValue"]);

const classes = computed(() =>
  cn(
    "flex h-12 w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none ring-0 transition",
    "placeholder:text-slate-400 focus:border-amber-400/40 focus:bg-white/8",
    props.class
  )
);
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :class="classes"
    @input="emit('update:modelValue', $event.target.value)"
  />
</template>
