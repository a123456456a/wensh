<script setup lang="ts">
import hljs from "highlight.js/lib/core";
import sql from "highlight.js/lib/languages/sql";
import "highlight.js/styles/github.css";
import { computed } from "vue";

hljs.registerLanguage("sql", sql);

const props = defineProps<{
  sql: string;
}>();

const highlighted = computed(() => {
  return hljs.highlight(props.sql, { language: "sql" }).value;
});
</script>

<template>
  <el-collapse class="mt-2">
    <el-collapse-item title="查看 SQL" name="sql">
      <pre class="rounded bg-gray-900 p-3 text-sm text-green-300 overflow-x-auto"><code v-html="highlighted" /></pre>
    </el-collapse-item>
  </el-collapse>
</template>
