<script setup>
import { provide, ref, watch } from "vue";

const props = defineProps({
  defaultValue: {
    type: String,
    default: ""
  },
  modelValue: {
    type: String,
    default: undefined
  }
});

const emit = defineEmits(["update:modelValue"]);
const internalValue = ref(props.modelValue ?? props.defaultValue);

watch(
  () => props.modelValue,
  (value) => {
    if (value !== undefined) {
      internalValue.value = value;
    }
  }
);

function setValue(value) {
  internalValue.value = value;
  emit("update:modelValue", value);
}

provide("tabs-value", internalValue);
provide("tabs-set-value", setValue);
</script>

<template>
  <div>
    <slot />
  </div>
</template>
