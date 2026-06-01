<script setup lang="ts">
import type {
  FallbackReason,
  ModelType,
  RouteSource,
  TokenUsage,
} from "@wensh/shared";

defineProps<{
  modelUsed: ModelType;
  modelName: string;
  fallbackReason?: FallbackReason | null;
  routeSource?: RouteSource | null;
  routeReason?: string | null;
  tokenUsage?: TokenUsage;
}>();

/**
 * 格式化 Token 数量
 * @param value - Token 数
 */
function formatTokens(value: number): string {
  return value.toLocaleString();
}

/**
 * 路由来源中文标签
 * @param source - 路由决策来源
 */
function routeSourceLabel(source: RouteSource): string {
  switch (source) {
    case "rule":
      return "规则路由";
    case "llm":
      return "LLM 路由";
    case "rule_fallback":
      return "规则兜底";
    default:
      return source;
  }
}
</script>

<template>
  <div class="model-badge">
    <span
      class="model-badge__type"
      :class="modelUsed === 'local' ? 'model-badge__type--local' : 'model-badge__type--remote'"
    >
      {{ modelUsed === "local" ? "本地" : "云端" }}
    </span>
    <span class="model-badge__name">{{ modelName }}</span>
    <span
      v-if="routeSource"
      class="model-badge__route"
      :class="`model-badge__route--${routeSource}`"
      :title="routeReason ?? undefined"
    >
      {{ routeSourceLabel(routeSource) }}
      <template v-if="routeReason"> · {{ routeReason }}</template>
    </span>
    <span v-if="fallbackReason === 'local_unavailable'" class="model-badge__fallback">
      本地不可用，已切换云端
    </span>
    <span v-if="fallbackReason === 'no_model_available'" class="model-badge__fallback">
      暂无可用模型
    </span>
    <span v-if="tokenUsage && tokenUsage.total_tokens > 0" class="model-badge__tokens">
      {{ formatTokens(tokenUsage.total_tokens) }} tokens
    </span>
  </div>
</template>

<style scoped>
.model-badge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.model-badge__type {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.model-badge__type--local {
  background: color-mix(in srgb, var(--accent-local) 12%, transparent);
  color: var(--accent-local);
}

.model-badge__type--remote {
  background: color-mix(in srgb, var(--accent-remote) 12%, transparent);
  color: var(--accent-remote);
}

.model-badge__name {
  font-size: 13px;
  color: var(--text-secondary);
}

.model-badge__route {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--text-muted) 10%, transparent);
}

.model-badge__route--llm {
  color: var(--accent-remote);
  background: color-mix(in srgb, var(--accent-remote) 8%, transparent);
}

.model-badge__route--rule_fallback {
  color: var(--accent-warning);
  background: color-mix(in srgb, var(--accent-warning) 10%, transparent);
}

.model-badge__fallback {
  font-size: 12px;
  color: var(--accent-warning);
}

.model-badge__tokens {
  margin-left: auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
</style>
