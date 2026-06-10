<script setup lang="ts">
import type { TokenUsage } from "@wensh/shared";

defineProps<{
  local: TokenUsage;
  remote: TokenUsage;
}>();

const RADIUS = 21;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Token 视觉满圆阈值（50k token = 圆满） */
const MAX_TOKENS = 50000;

/**
 * 计算圆环 stroke-dashoffset，表示填充进度
 * @param tokens - 当前 token 总量
 */
function dashOffset(tokens: number): number {
  return CIRCUMFERENCE * (1 - Math.min(tokens / MAX_TOKENS, 1));
}

/**
 * 格式化 Token 显示数值
 * @param value - Token 数
 */
function formatTokens(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
</script>

<template>
  <div class="token-rings">
    <div class="token-ring">
      <svg width="54" height="54" viewBox="0 0 54 54" :aria-label="`本地 Token: ${local.total_tokens}`">
        <circle cx="27" cy="27" :r="RADIUS" fill="none" stroke="var(--border)" stroke-width="5" />
        <circle
          cx="27" cy="27" :r="RADIUS"
          fill="none"
          stroke="var(--accent-local)"
          stroke-width="5"
          stroke-linecap="round"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="dashOffset(local.total_tokens)"
          transform="rotate(-90 27 27)"
          class="ring-arc"
        />
        <text x="27" y="31" text-anchor="middle" class="ring-num">
          {{ formatTokens(local.total_tokens) }}
        </text>
      </svg>
      <span class="ring-label">本地</span>
    </div>

    <div class="token-ring">
      <svg width="54" height="54" viewBox="0 0 54 54" :aria-label="`云端 Token: ${remote.total_tokens}`">
        <circle cx="27" cy="27" :r="RADIUS" fill="none" stroke="var(--border)" stroke-width="5" />
        <circle
          cx="27" cy="27" :r="RADIUS"
          fill="none"
          stroke="var(--accent-remote)"
          stroke-width="5"
          stroke-linecap="round"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="dashOffset(remote.total_tokens)"
          transform="rotate(-90 27 27)"
          class="ring-arc"
        />
        <text x="27" y="31" text-anchor="middle" class="ring-num">
          {{ formatTokens(remote.total_tokens) }}
        </text>
      </svg>
      <span class="ring-label">云端</span>
    </div>
  </div>
</template>

<style scoped>
.token-rings {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.token-ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.ring-arc {
  transition: stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.ring-num {
  font-size: 10px;
  font-weight: 700;
  fill: var(--text-primary);
  font-family: inherit;
}

.ring-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}
</style>
