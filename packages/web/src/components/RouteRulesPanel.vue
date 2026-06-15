<script setup lang="ts">
import type { RouterConfig } from "@wensh/shared";
import { computed } from "vue";

const props = defineProps<{
  router: RouterConfig;
}>();

/** 路由模式中文标签 */
const modeLabel = computed(() => {
  switch (props.router.mode) {
    case "rule":
      return "仅规则";
    case "llm":
      return "仅 LLM";
    case "hybrid":
      return "混合（推荐）";
    default:
      return props.router.mode;
  }
});

/** 混合模式简要说明 */
const modeHint = computed(() => {
  switch (props.router.mode) {
    case "rule":
      return "按表关键词与规模自动选择，无 Router LLM 开销";
    case "llm":
      return "全部由 Router LLM 判断 local / remote";
    case "hybrid":
      return "单表高置信或复杂查询走规则，其余走 LLM，失败则规则兜底";
    default:
      return "";
  }
});
</script>

<template>
  <div class="route-panel">
    <div class="route-panel__header">
      <span class="route-panel__title">模型路由</span>
      <span class="route-panel__mode">{{ modeLabel }}</span>
    </div>

    <p class="route-panel__hint">{{ modeHint }}</p>

    <ul class="route-panel__rules">
      <li>
        <span class="rule-tag rule-tag--local">本地</span>
        单表小表、简单明细查询
      </li>
      <li>
        <span class="rule-tag rule-tag--remote">云端</span>
        大表、多表、对比/聚合/趋势等复杂查询
      </li>
      <li>
        <span class="rule-tag rule-tag--fallback">降级</span>
        本地 vLLM 不可达时自动切换云端
      </li>
    </ul>

    <dl class="route-panel__meta">
      <div class="route-panel__row">
        <dt>本地模型</dt>
        <dd>{{ router.local_model_name }}</dd>
      </div>
      <div v-if="router.split_model_interpret" class="route-panel__row">
        <dt>分阶段</dt>
        <dd>SQL 走路由 / 解读走云端</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.route-panel {
  padding: 12px;
  border-radius: var(--radius);
  background: var(--surface-muted);
  border: 1px solid var(--border);
}

.route-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.route-panel__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.route-panel__mode {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  color: var(--accent-primary);
}

.route-panel__hint {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}

.route-panel__rules {
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.route-panel__rules li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.rule-tag {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
}

.rule-tag--local {
  background: color-mix(in srgb, var(--accent-local) 12%, transparent);
  color: var(--accent-local);
}

.rule-tag--remote {
  background: color-mix(in srgb, var(--accent-remote) 12%, transparent);
  color: var(--accent-remote);
}

.rule-tag--fallback {
  background: color-mix(in srgb, var(--accent-warning) 12%, transparent);
  color: var(--accent-warning);
}

.route-panel__meta {
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.route-panel__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  line-height: 1.5;
}

.route-panel__row dt {
  color: var(--text-muted);
  font-weight: 500;
}

.route-panel__row dd {
  margin: 0;
  color: var(--text-secondary);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
