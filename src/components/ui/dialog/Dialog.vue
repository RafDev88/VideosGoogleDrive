<script setup>
import { provide, ref, watch } from "vue";

const props = defineProps({
  open: {
    type: Boolean,
    default: undefined
  },
  defaultOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["update:open"]);
const internalOpen = ref(props.open ?? props.defaultOpen);

watch(
  () => props.open,
  (value) => {
    if (value !== undefined) {
      internalOpen.value = value;
    }
  }
);

function setOpen(value) {
  internalOpen.value = value;
  emit("update:open", value);
}

provide("dialog-open", internalOpen);
provide("dialog-set-open", setOpen);
</script>

<template>
  <slot />
</template>
