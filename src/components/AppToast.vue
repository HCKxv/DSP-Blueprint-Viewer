<script setup lang="ts">
import { message, transitionEnabled, visible } from '../stores/toast'

</script>

<template>
  <div
    id="toast"
    :class="{ show: visible }"
    :style="{ transition: transitionEnabled ? '' : 'none' }"
  >{{ message }}</div>
</template>

<style scoped>
#toast {
  position: fixed;
  white-space: pre-line;
  z-index: 9999;
  pointer-events: none;
  opacity: 0;
  top: 14px;
  left: 50%;
  transform: translate(-50%, -20px);
  transition: transform 0.45s ease, opacity 0.45s ease;
  background: color-mix(in srgb, var(--line) 80%, transparent);
  border-left: 3px solid var(--warn);
  border-radius: var(--radius-xs);
  padding: 8px 18px;
  text-align: center;
  color: var(--fg-secondary);
  font-size: 15px;
}

#toast.show {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
