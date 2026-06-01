<script setup lang="ts">
defineProps<{
  columns: string[];
  rows: Record<string, unknown>[];
}>();
</script>

<template>
  <el-table :data="rows" stripe class="result-table" max-height="360">
    <el-table-column
      v-for="col in columns"
      :key="col"
      :prop="col"
      :label="col"
      min-width="120"
    />
  </el-table>
</template>

<style scoped>
.result-table {
  margin-top: 16px;
  width: 100%;
}
</style>
