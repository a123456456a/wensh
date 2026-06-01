<script setup lang="ts">
import type { ChartHint } from "@wensh/shared";
import * as echarts from "echarts";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  columns: string[];
  rows: Record<string, unknown>[];
  chartHint?: ChartHint;
}>();

const chartRef = ref<HTMLDivElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

/** 推断实际使用的图表类型 */
const effectiveHint = computed((): ChartHint | null => {
  if (props.chartHint === "table") return null;
  if (props.chartHint) return props.chartHint;
  return inferFallbackHint(props.columns, props.rows);
});

/**
 * interpret=false 或无 hint 时的 fallback 规则
 */
function inferFallbackHint(
  columns: string[],
  rows: Record<string, unknown>[],
): ChartHint | null {
  if (columns.length <= 1 || rows.length === 0) return null;
  const firstCol = columns[0];
  const firstValues = rows.map((r) => String(r[firstCol] ?? ""));
  const looksLikeDate = firstValues.some((v) => /^\d{4}-\d{2}/.test(v));
  const numericCols = columns.slice(1).filter((col) =>
    rows.some((r) => typeof r[col] === "number"),
  );
  if (looksLikeDate && numericCols.length > 0) return "line";
  if (columns.length === 2 && numericCols.length === 1) return "bar";
  if (numericCols.length > 0) return "bar";
  return null;
}

/**
 * 渲染 ECharts 图表
 */
function renderChart(): void {
  if (!chartRef.value || !effectiveHint.value) return;

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }

  const xCol = props.columns[0];
  const xData = props.rows.map((r) => String(r[xCol] ?? ""));
  const numericCols = props.columns.slice(1).filter((col) =>
    props.rows.some((r) => typeof r[col] === "number"),
  );

  const series = numericCols.map((col) => ({
    name: col,
    type: effectiveHint.value === "line" ? "line" : "bar",
    data: props.rows.map((r) => Number(r[col] ?? 0)),
  }));

  chartInstance.setOption({
    tooltip: { trigger: "axis" },
    legend: numericCols.length > 1 ? { data: numericCols } : undefined,
    xAxis: { type: "category", data: xData },
    yAxis: { type: "value" },
    series,
  });
}

function handleResize(): void {
  chartInstance?.resize();
}

watch(
  () => [props.columns, props.rows, props.chartHint],
  () => renderChart(),
  { deep: true },
);

onMounted(() => {
  renderChart();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  chartInstance?.dispose();
  chartInstance = null;
});
</script>

<template>
  <div
    v-if="effectiveHint"
    ref="chartRef"
    class="result-chart"
  />
</template>

<style scoped>
.result-chart {
  margin-top: 16px;
  height: 280px;
  width: 100%;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
}
</style>
