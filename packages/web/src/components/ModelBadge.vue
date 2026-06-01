<script setup lang="ts">
import type { ModelType, FallbackReason } from "@wensh/shared";

defineProps<{
  modelUsed: ModelType;
  modelName: string;
  fallbackReason?: FallbackReason | null;
}>();
</script>

<template>
  <el-tag
    :type="modelUsed === 'local' ? 'success' : 'primary'"
    effect="light"
    class="text-xs"
  >
    <span v-if="modelUsed === 'local'">本地 · {{ modelName }}</span>
    <span v-else-if="fallbackReason === 'local_unavailable'">
      ⚠ 远端 · {{ modelName }}（本地不可用）
    </span>
    <span v-else>远端 · {{ modelName }}</span>
  </el-tag>
</template>
