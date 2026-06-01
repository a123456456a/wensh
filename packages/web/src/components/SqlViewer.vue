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
  <el-collapse class="sql-viewer">
    <el-collapse-item title="查看 SQL" name="sql">
      <pre class="sql-viewer__code"><code v-html="highlighted" /></pre>
    </el-collapse-item>
  </el-collapse>
</template>

<style scoped>
.sql-viewer {
  margin-top: 4px;
}

.sql-viewer__code {
  margin: 0;
  padding: 14px 16px;
  border-radius: var(--radius);
  background: #0f172a;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
}
</style>
