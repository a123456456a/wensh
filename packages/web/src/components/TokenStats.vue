<script setup lang="ts">
import type { TokenUsage } from "@wensh/shared";

defineProps<{
  local: TokenUsage;
  remote: TokenUsage;
}>();

/**
 * 格式化 Token 数量
 * @param value - Token 数
 */
function formatTokens(value: number): string {
  if (value >= 10000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(value);
}
</script>

<template>
  <div class="token-stats">
    <div class="token-item">
      <span class="token-dot token-dot--local" />
      <span class="token-label">本地</span>
      <span class="token-value">{{ formatTokens(local.total_tokens) }}</span>
    </div>
    <div class="token-divider" />
    <div class="token-item">
      <span class="token-dot token-dot--remote" />
      <span class="token-label">云端</span>
      <span class="token-value">{{ formatTokens(remote.total_tokens) }}</span>
    </div>
  </div>
</template>

<style scoped>
.token-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: var(--surface-muted);
  border-radius: 999px;
  font-size: 12px;
}

.token-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.token-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.token-dot--local {
  background: var(--accent-local);
}

.token-dot--remote {
  background: var(--accent-remote);
}

.token-label {
  color: var(--text-muted);
}

.token-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text-primary);
}

.token-divider {
  width: 1px;
  height: 14px;
  background: var(--border);
}
</style>
