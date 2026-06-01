import { onMounted, ref } from "vue";
import { getHealth, postQuery } from "./api/query";
import ChatInput from "./components/ChatInput.vue";
import ModelBadge from "./components/ModelBadge.vue";
import SqlViewer from "./components/SqlViewer.vue";
import ResultTable from "./components/ResultTable.vue";
import ResultChart from "./components/ResultChart.vue";
import ErrorAlert from "./components/ErrorAlert.vue";
const SAMPLE_QUESTIONS = [
    "上个月哪条产线良率最低？",
    "今年A线的工单完成率按月统计",
    "统计各班次的平均OEE",
    "查询所有状态为running的工单数量",
    "近30天停机时间最长的产线是哪条？",
];
const input = ref("");
const loading = ref(false);
const messages = ref([]);
const health = ref(null);
/**
 * 从已成功消息构建 history（最多 2 轮）
 */
function buildHistory() {
    return messages.value
        .filter((m) => m.response?.sql)
        .slice(-2)
        .map((m) => ({
        question: m.question,
        sql: m.response.sql,
    }));
}
/**
 * 加载健康状态
 */
async function loadHealth() {
    try {
        health.value = await getHealth();
    }
    catch {
        health.value = null;
    }
}
/**
 * 发送查询
 */
async function handleSubmit() {
    const question = input.value.trim();
    if (!question || loading.value)
        return;
    const msg = {
        id: crypto.randomUUID(),
        question,
        loading: true,
    };
    messages.value.push(msg);
    input.value = "";
    loading.value = true;
    try {
        const response = await postQuery({
            question,
            interpret: true,
            history: buildHistory(),
        });
        msg.response = response;
        msg.loading = false;
    }
    catch (err) {
        const axiosErr = err;
        msg.error = axiosErr.response?.data ?? { error: "请求失败" };
        msg.loading = false;
    }
    finally {
        loading.value = false;
    }
}
/**
 * 新对话：清空历史
 */
function newConversation() {
    messages.value = [];
    input.value = "";
}
/**
 * 填入示例问题
 */
function fillSample(q) {
    input.value = q;
}
onMounted(() => {
    loadHealth();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "min-h-screen flex flex-col" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "bg-white border-b px-6 py-4 shadow-sm" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "max-w-5xl mx-auto flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-xl font-bold text-gray-800" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-sm text-gray-500" },
});
if (__VLS_ctx.health) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex gap-3 text-xs" },
    });
    const __VLS_0 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        type: (__VLS_ctx.health.local_model.available ? 'success' : 'info'),
        size: "small",
    }));
    const __VLS_2 = __VLS_1({
        type: (__VLS_ctx.health.local_model.available ? 'success' : 'info'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    (__VLS_ctx.health.local_model.available ? "在线" : "离线");
    var __VLS_3;
    const __VLS_4 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        type: (__VLS_ctx.health.remote_model.available ? 'success' : 'danger'),
        size: "small",
    }));
    const __VLS_6 = __VLS_5({
        type: (__VLS_ctx.health.remote_model.available ? 'success' : 'danger'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    (__VLS_ctx.health.remote_model.model_name);
    var __VLS_7;
    const __VLS_8 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        type: (__VLS_ctx.health.database.available ? 'success' : 'danger'),
        size: "small",
    }));
    const __VLS_10 = __VLS_9({
        type: (__VLS_ctx.health.database.available ? 'success' : 'danger'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    (__VLS_ctx.health.database.available ? "就绪" : "异常");
    var __VLS_11;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "flex-1 max-w-5xl mx-auto w-full px-6 py-4 overflow-y-auto" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mb-4 flex justify-end" },
});
const __VLS_12 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_14 = __VLS_13({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onClick: (__VLS_ctx.newConversation)
};
__VLS_15.slots.default;
var __VLS_15;
if (__VLS_ctx.messages.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-center text-gray-400 py-16" },
    });
}
for (const [msg] of __VLS_getVForSourceType((__VLS_ctx.messages))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (msg.id),
        ...{ class: "mb-6" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-end mb-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "bg-blue-500 text-white rounded-lg px-4 py-2 max-w-[80%]" },
    });
    (msg.question);
    if (msg.loading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-gray-400 text-sm pl-2" },
        });
    }
    else if (msg.error) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "pl-2" },
        });
        /** @type {[typeof ErrorAlert, ]} */ ;
        // @ts-ignore
        const __VLS_20 = __VLS_asFunctionalComponent(ErrorAlert, new ErrorAlert({
            error: (msg.error.error),
            sql: (msg.error.sql),
        }));
        const __VLS_21 = __VLS_20({
            error: (msg.error.error),
            sql: (msg.error.sql),
        }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    }
    else if (msg.response) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "bg-white rounded-lg shadow p-4" },
        });
        /** @type {[typeof ModelBadge, ]} */ ;
        // @ts-ignore
        const __VLS_23 = __VLS_asFunctionalComponent(ModelBadge, new ModelBadge({
            modelUsed: (msg.response.model_used),
            modelName: (msg.response.model_name),
            fallbackReason: (msg.response.fallback_reason),
        }));
        const __VLS_24 = __VLS_23({
            modelUsed: (msg.response.model_used),
            modelName: (msg.response.model_name),
            fallbackReason: (msg.response.fallback_reason),
        }, ...__VLS_functionalComponentArgsRest(__VLS_23));
        /** @type {[typeof SqlViewer, ]} */ ;
        // @ts-ignore
        const __VLS_26 = __VLS_asFunctionalComponent(SqlViewer, new SqlViewer({
            sql: (msg.response.sql),
        }));
        const __VLS_27 = __VLS_26({
            sql: (msg.response.sql),
        }, ...__VLS_functionalComponentArgsRest(__VLS_26));
        /** @type {[typeof ResultChart, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(ResultChart, new ResultChart({
            columns: (msg.response.columns),
            rows: (msg.response.rows),
            chartHint: (msg.response.chart_hint),
        }));
        const __VLS_30 = __VLS_29({
            columns: (msg.response.columns),
            rows: (msg.response.rows),
            chartHint: (msg.response.chart_hint),
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        /** @type {[typeof ResultTable, ]} */ ;
        // @ts-ignore
        const __VLS_32 = __VLS_asFunctionalComponent(ResultTable, new ResultTable({
            columns: (msg.response.columns),
            rows: (msg.response.rows),
        }));
        const __VLS_33 = __VLS_32({
            columns: (msg.response.columns),
            rows: (msg.response.rows),
        }, ...__VLS_functionalComponentArgsRest(__VLS_32));
        if (msg.response.interpretation) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "mt-3 text-sm text-gray-700 border-l-4 border-blue-400 pl-3" },
            });
            (msg.response.interpretation);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "mt-2 text-xs text-gray-400" },
        });
        (msg.response.row_count);
        (msg.response.elapsed_ms);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
    ...{ class: "bg-white border-t px-6 py-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "max-w-5xl mx-auto space-y-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-wrap gap-2" },
});
for (const [q] of __VLS_getVForSourceType((__VLS_ctx.SAMPLE_QUESTIONS))) {
    const __VLS_35 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
        ...{ 'onClick': {} },
        key: (q),
        size: "small",
        round: true,
    }));
    const __VLS_37 = __VLS_36({
        ...{ 'onClick': {} },
        key: (q),
        size: "small",
        round: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    let __VLS_39;
    let __VLS_40;
    let __VLS_41;
    const __VLS_42 = {
        onClick: (...[$event]) => {
            __VLS_ctx.fillSample(q);
        }
    };
    __VLS_38.slots.default;
    (q);
    var __VLS_38;
}
/** @type {[typeof ChatInput, ]} */ ;
// @ts-ignore
const __VLS_43 = __VLS_asFunctionalComponent(ChatInput, new ChatInput({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.input),
    loading: (__VLS_ctx.loading),
}));
const __VLS_44 = __VLS_43({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.input),
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_43));
let __VLS_46;
let __VLS_47;
let __VLS_48;
const __VLS_49 = {
    onSubmit: (__VLS_ctx.handleSubmit)
};
var __VLS_45;
/** @type {__VLS_StyleScopedClasses['min-h-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-5xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-800']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-5xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
/** @type {__VLS_StyleScopedClasses['py-16']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-blue-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-white']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-[80%]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['pl-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pl-2']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-700']} */ ;
/** @type {__VLS_StyleScopedClasses['border-l-4']} */ ;
/** @type {__VLS_StyleScopedClasses['border-blue-400']} */ ;
/** @type {__VLS_StyleScopedClasses['pl-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-5xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ChatInput: ChatInput,
            ModelBadge: ModelBadge,
            SqlViewer: SqlViewer,
            ResultTable: ResultTable,
            ResultChart: ResultChart,
            ErrorAlert: ErrorAlert,
            SAMPLE_QUESTIONS: SAMPLE_QUESTIONS,
            input: input,
            loading: loading,
            messages: messages,
            health: health,
            handleSubmit: handleSubmit,
            newConversation: newConversation,
            fillSample: fillSample,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
