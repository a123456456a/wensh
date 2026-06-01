import * as echarts from "echarts";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
const props = defineProps();
const chartRef = ref(null);
let chartInstance = null;
/** 推断实际使用的图表类型 */
const effectiveHint = computed(() => {
    if (props.chartHint === "table")
        return null;
    if (props.chartHint)
        return props.chartHint;
    return inferFallbackHint(props.columns, props.rows);
});
/**
 * interpret=false 或无 hint 时的 fallback 规则
 */
function inferFallbackHint(columns, rows) {
    if (columns.length <= 1 || rows.length === 0)
        return null;
    const firstCol = columns[0];
    const firstValues = rows.map((r) => String(r[firstCol] ?? ""));
    const looksLikeDate = firstValues.some((v) => /^\d{4}-\d{2}/.test(v));
    const numericCols = columns.slice(1).filter((col) => rows.some((r) => typeof r[col] === "number"));
    if (looksLikeDate && numericCols.length > 0)
        return "line";
    if (columns.length === 2 && numericCols.length === 1)
        return "bar";
    if (numericCols.length > 0)
        return "bar";
    return null;
}
/**
 * 渲染 ECharts 图表
 */
function renderChart() {
    if (!chartRef.value || !effectiveHint.value)
        return;
    if (!chartInstance) {
        chartInstance = echarts.init(chartRef.value);
    }
    const xCol = props.columns[0];
    const xData = props.rows.map((r) => String(r[xCol] ?? ""));
    const numericCols = props.columns.slice(1).filter((col) => props.rows.some((r) => typeof r[col] === "number"));
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
function handleResize() {
    chartInstance?.resize();
}
watch(() => [props.columns, props.rows, props.chartHint], () => renderChart(), { deep: true });
onMounted(() => {
    renderChart();
    window.addEventListener("resize", handleResize);
});
onUnmounted(() => {
    window.removeEventListener("resize", handleResize);
    chartInstance?.dispose();
    chartInstance = null;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
if (__VLS_ctx.effectiveHint) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ref: "chartRef",
        ...{ class: "mt-3 h-72 w-full rounded border border-gray-200 bg-white" },
    });
    /** @type {typeof __VLS_ctx.chartRef} */ ;
}
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['h-72']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-gray-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            chartRef: chartRef,
            effectiveHint: effectiveHint,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
