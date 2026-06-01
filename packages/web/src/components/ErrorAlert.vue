<script setup lang="ts">
defineProps<{
  error: string;
  sql?: string;
}>();
</script>

<template>
  <el-alert :title="error" type="error" show-icon class="mt-2" />
  <p v-if="sql" class="mt-2 text-xs text-gray-500 break-all">SQL: {{ sql }}</p>
</template>
