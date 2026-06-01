<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<template>
  <div class="stream-progress">
    <span class="stream-pulse" />
    <span class="stream-text">{{ message }}</span>
  </div>
</template>

<style scoped>
.stream-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.stream-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-primary);
  animation: pulse 1.4s ease-in-out infinite;
}

.stream-text {
  letter-spacing: 0.01em;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
