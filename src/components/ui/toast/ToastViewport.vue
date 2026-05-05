<script setup>
defineProps({
  toasts: {
    type: Array,
    default: () => []
  }
});
</script>

<template>
  <teleport to="body">
    <div class="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-3">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="surface-card rounded-2xl border px-4 py-3 shadow-xl"
        :class="toast.variant === 'error' ? 'border-rose-400/20 text-rose-100' : 'border-emerald-400/20 text-white'"
      >
        <strong class="block text-sm font-semibold">{{ toast.title }}</strong>
        <p class="mt-1 text-sm text-slate-300">{{ toast.description }}</p>
      </div>
    </div>
  </teleport>
</template>
