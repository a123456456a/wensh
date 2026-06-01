<script setup lang="ts">
defineProps<{
  label: string;
  online: boolean;
}>();
</script>

<template>
  <div class="status-pill" :class="{ 'status-pill--online': online }">
    <span class="status-dot" />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface-muted);
  transition: color 0.2s, background 0.2s;
}

.status-pill--online {
  color: var(--text-secondary);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-faint);
  transition: background 0.2s;
}

.status-pill--online .status-dot {
  background: var(--accent-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-success) 20%, transparent);
}
</style>
