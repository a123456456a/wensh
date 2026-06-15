<script setup lang="ts">
import type { DomainHealthItem } from "@wensh/shared";
import StatusPill from "./StatusPill.vue";

defineProps<{
  domains: DomainHealthItem[];
  selected: string;
}>();
</script>

<template>
  <ul class="domain-list">
    <li
      v-for="item in domains"
      :key="item.domain"
      class="domain-list__item"
      :class="{ 'domain-list__item--active': item.domain === selected }"
    >
      <StatusPill :label="item.label" :online="item.api_available" />
    </li>
  </ul>
</template>

<style scoped>
.domain-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.domain-list__item {
  opacity: 0.85;
  transition: opacity 0.15s;
}

.domain-list__item--active {
  opacity: 1;
}

.domain-list__item--active :deep(.status-pill) {
  font-weight: 600;
}
</style>
