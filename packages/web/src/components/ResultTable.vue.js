const __VLS_props = defineProps();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    data: (__VLS_ctx.rows),
    stripe: true,
    border: true,
    ...{ class: "mt-3 w-full" },
    maxHeight: "360",
}));
const __VLS_2 = __VLS_1({
    data: (__VLS_ctx.rows),
    stripe: true,
    border: true,
    ...{ class: "mt-3 w-full" },
    maxHeight: "360",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
for (const [col] of __VLS_getVForSourceType((__VLS_ctx.columns))) {
    const __VLS_5 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
        key: (col),
        prop: (col),
        label: (col),
        minWidth: "120",
    }));
    const __VLS_7 = __VLS_6({
        key: (col),
        prop: (col),
        label: (col),
        minWidth: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {};
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
