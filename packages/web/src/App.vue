<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { AxiosError } from "axios";
import type { ChatMessage, HealthResponse, HistoryItem } from "@wensh/shared";
import { getHealth, postQuery, type QueryErrorResponse } from "./api/query";
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
const messages = ref<ChatMessage[]>([]);
const health = ref<HealthResponse | null>(null);

/**
 * 从已成功消息构建 history（最多 2 轮）
 */
function buildHistory(): HistoryItem[] {
  return messages.value
    .filter((m) => m.response?.sql)
    .slice(-2)
    .map((m) => ({
      question: m.question,
      sql: m.response!.sql,
    }));
}

/**
 * 加载健康状态
 */
async function loadHealth(): Promise<void> {
  try {
    health.value = await getHealth();
  } catch {
    health.value = null;
  }
}

/**
 * 发送查询
 */
async function handleSubmit(): Promise<void> {
  const question = input.value.trim();
  if (!question || loading.value) return;

  const msg: ChatMessage = {
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
  } catch (err) {
    const axiosErr = err as AxiosError<QueryErrorResponse>;
    msg.error = axiosErr.response?.data ?? { error: "请求失败" };
    msg.loading = false;
  } finally {
    loading.value = false;
  }
}

/**
 * 新对话：清空历史
 */
function newConversation(): void {
  messages.value = [];
  input.value = "";
}

/**
 * 填入示例问题
 */
function fillSample(q: string): void {
  input.value = q;
}

onMounted(() => {
  loadHealth();
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="bg-white border-b px-6 py-4 shadow-sm">
      <div class="max-w-5xl mx-auto flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-800">问数 WenShu</h1>
          <p class="text-sm text-gray-500">MES 自然语言查数 Demo</p>
        </div>
        <div v-if="health" class="flex gap-3 text-xs">
          <el-tag :type="health.local_model.available ? 'success' : 'info'" size="small">
            本地模型 {{ health.local_model.available ? "在线" : "离线" }}
          </el-tag>
          <el-tag :type="health.remote_model.available ? 'success' : 'danger'" size="small">
            远端 {{ health.remote_model.model_name }}
          </el-tag>
          <el-tag :type="health.database.available ? 'success' : 'danger'" size="small">
            数据库 {{ health.database.available ? "就绪" : "异常" }}
          </el-tag>
        </div>
      </div>
    </header>

    <main class="flex-1 max-w-5xl mx-auto w-full px-6 py-4 overflow-y-auto">
      <div class="mb-4 flex justify-end">
        <el-button size="small" @click="newConversation">新对话</el-button>
      </div>

      <div v-if="messages.length === 0" class="text-center text-gray-400 py-16">
        输入问题开始查询，或点击下方示例问题
      </div>

      <div v-for="msg in messages" :key="msg.id" class="mb-6">
        <div class="flex justify-end mb-2">
          <div class="bg-blue-500 text-white rounded-lg px-4 py-2 max-w-[80%]">
            {{ msg.question }}
          </div>
        </div>

        <div v-if="msg.loading" class="text-gray-400 text-sm pl-2">
          正在查询...
        </div>

        <div v-else-if="msg.error" class="pl-2">
          <ErrorAlert :error="msg.error.error" :sql="msg.error.sql" />
        </div>

        <div v-else-if="msg.response" class="bg-white rounded-lg shadow p-4">
          <ModelBadge
            :model-used="msg.response.model_used"
            :model-name="msg.response.model_name"
            :fallback-reason="msg.response.fallback_reason"
          />
          <SqlViewer :sql="msg.response.sql" />
          <ResultChart
            :columns="msg.response.columns"
            :rows="msg.response.rows"
            :chart-hint="msg.response.chart_hint"
          />
          <ResultTable
            :columns="msg.response.columns"
            :rows="msg.response.rows"
          />
          <p
            v-if="msg.response.interpretation"
            class="mt-3 text-sm text-gray-700 border-l-4 border-blue-400 pl-3"
          >
            {{ msg.response.interpretation }}
          </p>
          <p class="mt-2 text-xs text-gray-400">
            {{ msg.response.row_count }} 行 · {{ msg.response.elapsed_ms }}ms
          </p>
        </div>
      </div>
    </main>

    <footer class="bg-white border-t px-6 py-4">
      <div class="max-w-5xl mx-auto space-y-3">
        <div class="flex flex-wrap gap-2">
          <el-button
            v-for="q in SAMPLE_QUESTIONS"
            :key="q"
            size="small"
            round
            @click="fillSample(q)"
          >
            {{ q }}
          </el-button>
        </div>
        <ChatInput v-model="input" :loading="loading" @submit="handleSubmit" />
      </div>
    </footer>
  </div>
</template>
