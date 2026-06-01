<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type {
  AuthUser,
  BusinessDomain,
  ChatMessage,
  HealthResponse,
  HistoryItem,
  QueryTokenUsage,
  RemoteProvider,
  TokenUsage,
} from "@wensh/shared";
import { emptyQueryTokenUsage } from "@wensh/shared";
import { fetchMe, logout } from "../api/auth";
import { getHealth } from "../api/query";
import { postQueryStream } from "../api/queryStream";
import { DOMAIN_OPTIONS, DOMAIN_SAMPLE_QUESTIONS } from "../config/domains";
import ChatInput from "../components/ChatInput.vue";
import ModelBadge from "../components/ModelBadge.vue";
import SqlViewer from "../components/SqlViewer.vue";
import ResultTable from "../components/ResultTable.vue";
import ResultChart from "../components/ResultChart.vue";
import ErrorAlert from "../components/ErrorAlert.vue";
import TokenStats from "../components/TokenStats.vue";
import StatusPill from "../components/StatusPill.vue";
import StreamProgress from "../components/StreamProgress.vue";
import {
  loadSavedRemoteProvider,
  saveRemoteProvider,
} from "../utils/remoteProviderStorage";

const router = useRouter();
const selectedDomain = ref<BusinessDomain>("demo");
const currentUser = ref<AuthUser | null>(null);

const input = ref("");
const loading = ref(false);
const interpretEnabled = ref(true);
const messages = ref<ChatMessage[]>([]);
const health = ref<HealthResponse | null>(null);
const selectedRemoteProvider = ref<RemoteProvider>("qwen");
const sessionTokens = ref<QueryTokenUsage>(emptyQueryTokenUsage());
const samplePopoverVisible = ref(false);

/** 当前域的示例问题 */
const sampleQuestions = computed(
  () => DOMAIN_SAMPLE_QUESTIONS[selectedDomain.value],
);

/** 当前选中提供商的展示信息 */
const selectedProviderInfo = computed(() => {
  const providers = health.value?.remote_model.providers ?? [];
  return (
    providers.find((item) => item.provider === selectedRemoteProvider.value) ??
    providers[0] ??
    null
  );
});

/**
 * 累加 Token 到会话统计
 * @param usage - 查询 Token 汇总
 */
function accumulateSessionTokens(usage: QueryTokenUsage): void {
  sessionTokens.value.local.input_tokens += usage.local.input_tokens;
  sessionTokens.value.local.output_tokens += usage.local.output_tokens;
  sessionTokens.value.local.total_tokens += usage.local.total_tokens;
  sessionTokens.value.remote.input_tokens += usage.remote.input_tokens;
  sessionTokens.value.remote.output_tokens += usage.remote.output_tokens;
  sessionTokens.value.remote.total_tokens += usage.remote.total_tokens;
}

/**
 * 获取单条消息的总 Token（本地 + 云端）
 * @param usage - 查询 Token 汇总
 */
function messageTotalTokens(usage: QueryTokenUsage): TokenUsage {
  return {
    input_tokens: usage.local.input_tokens + usage.remote.input_tokens,
    output_tokens: usage.local.output_tokens + usage.remote.output_tokens,
    total_tokens: usage.local.total_tokens + usage.remote.total_tokens,
  };
}

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
 * 根据 health 与 localStorage 初始化远端提供商选择
 */
function initRemoteProviderSelection(data: HealthResponse): void {
  const saved = loadSavedRemoteProvider(data.remote_model.default_provider);
  const savedOption = data.remote_model.providers.find(
    (item) => item.provider === saved,
  );

  if (savedOption?.available) {
    selectedRemoteProvider.value = saved;
    return;
  }

  const defaultOption = data.remote_model.providers.find(
    (item) => item.provider === data.remote_model.default_provider,
  );
  if (defaultOption?.available) {
    selectedRemoteProvider.value = data.remote_model.default_provider;
    return;
  }

  const firstAvailable = data.remote_model.providers.find((item) => item.available);
  selectedRemoteProvider.value =
    firstAvailable?.provider ?? data.remote_model.default_provider;
}

/**
 * 退出登录
 */
async function handleLogout(): Promise<void> {
  await logout();
  currentUser.value = null;
  await router.push("/login");
}

/**
 * 加载健康状态
 */
async function loadHealth(): Promise<void> {
  try {
    const data = await getHealth();
    health.value = data;
    initRemoteProviderSelection(data);
  } catch {
    health.value = null;
  }
}

/**
 * 加载当前用户（认证启用时）
 */
async function loadCurrentUser(): Promise<void> {
  const me = await fetchMe();
  currentUser.value = me?.user ?? null;
}

/**
 * 切换远端提供商并持久化
 */
function handleRemoteProviderChange(provider: RemoteProvider): void {
  selectedRemoteProvider.value = provider;
  saveRemoteProvider(provider);
}

/**
 * 流式发送查询
 */
async function handleSubmit(): Promise<void> {
  const question = input.value.trim();
  if (!question || loading.value) return;

  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    question,
    loading: true,
    streamPhase: "正在连接...",
    streamSql: "",
    streamInterpretation: "",
  };
  messages.value.push(msg);
  input.value = "";
  loading.value = true;

  try {
    await postQueryStream(
      {
        question,
        domain: selectedDomain.value,
        interpret: interpretEnabled.value,
        history: buildHistory(),
        remote_provider: selectedRemoteProvider.value,
      },
      (event) => {
        switch (event.type) {
          case "phase":
            msg.streamPhase = event.message;
            break;
          case "sql_delta":
            msg.streamSql = (msg.streamSql ?? "") + event.delta;
            break;
          case "sql":
            msg.streamSql = event.sql;
            break;
          case "data":
            msg.streamColumns = event.columns;
            msg.streamRows = event.rows;
            break;
          case "interpret_delta":
            msg.streamInterpretation =
              (msg.streamInterpretation ?? "") + event.delta;
            break;
          case "done":
            msg.response = event.result;
            msg.loading = false;
            msg.streamPhase = undefined;
            accumulateSessionTokens(event.result.token_usage);
            break;
          case "error":
            msg.error = event.error;
            msg.loading = false;
            msg.streamPhase = undefined;
            break;
        }
      },
    );

    if (msg.loading) {
      msg.loading = false;
      if (!msg.response && !msg.error) {
        msg.error = { error: "流式连接意外中断" };
      }
    }
  } catch {
    msg.error = { error: "网络请求失败" };
    msg.loading = false;
    msg.streamPhase = undefined;
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
  sessionTokens.value = emptyQueryTokenUsage();
}

/**
 * 填入示例问题
 */
function fillSample(q: string): void {
  input.value = q;
  samplePopoverVisible.value = false;
}

onMounted(() => {
  void loadHealth();
  void loadCurrentUser();
});
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="header__inner">
        <div class="header__brand">
          <h1 class="header__title">问数</h1>
          <span class="header__subtitle">WenShu · MES 自然语言查数</span>
        </div>

        <div v-if="health" class="header__status">
          <el-select
            v-model="selectedDomain"
            size="small"
            class="header__select"
            placeholder="业务域"
          >
            <el-option
              v-for="item in DOMAIN_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <StatusPill
            v-for="item in health.domains"
            :key="item.domain"
            :label="item.label"
            :online="item.api_available"
          />
          <StatusPill
            label="本地模型"
            :online="health.local_model.available"
          />
          <div class="header__provider">
            <el-select
              :model-value="selectedRemoteProvider"
              size="small"
              class="header__select"
              placeholder="云端模型"
              @update:model-value="handleRemoteProviderChange"
            >
              <el-option
                v-for="item in health.remote_model.providers"
                :key="item.provider"
                :label="item.label"
                :value="item.provider"
                :disabled="!item.available"
              />
            </el-select>
            <StatusPill
              v-if="selectedProviderInfo"
              :label="selectedProviderInfo.model_name"
              :online="selectedProviderInfo.available"
            />
          </div>
          <StatusPill
            label="数据库"
            :online="health.database.available"
          />
          <TokenStats
            :local="sessionTokens.local"
            :remote="sessionTokens.remote"
          />
          <span v-if="currentUser" class="header__user">{{ currentUser.username }}</span>
          <button
            v-if="health.auth?.enabled"
            type="button"
            class="btn-ghost"
            @click="handleLogout"
          >
            退出
          </button>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="main__toolbar">
        <button type="button" class="btn-ghost" @click="newConversation">
          新对话
        </button>
      </div>

      <div v-if="messages.length === 0" class="empty">
        <div class="empty__icon">💬</div>
        <p class="empty__title">开始提问</p>
        <p class="empty__hint">用自然语言查询 MES 数据，支持流式输出与 Token 统计</p>
        <div class="empty__samples">
          <button
            v-for="q in sampleQuestions"
            :key="q"
            type="button"
            class="sample-chip"
            @click="fillSample(q)"
          >
            {{ q }}
          </button>
        </div>
      </div>

      <div v-for="msg in messages" :key="msg.id" class="message">
        <div class="message__user">
          <div class="message__bubble message__bubble--user">
            {{ msg.question }}
          </div>
        </div>

        <div class="message__assistant">
          <StreamProgress
            v-if="msg.loading && msg.streamPhase"
            :message="msg.streamPhase"
          />

          <div v-if="msg.error" class="message__card">
            <ErrorAlert :error="msg.error.error" :sql="msg.error.sql" />
          </div>

          <div v-if="msg.response" class="message__card">
            <ModelBadge
              :model-used="msg.response.model_used"
              :model-name="msg.response.model_name"
              :fallback-reason="msg.response.fallback_reason"
              :token-usage="messageTotalTokens(msg.response.token_usage)"
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
            <div
              v-if="msg.response.interpretation || msg.streamInterpretation"
              class="interpretation"
            >
              {{ msg.response.interpretation || msg.streamInterpretation }}
            </div>
            <div class="message__meta">
              <span>{{ msg.response.row_count }} 行</span>
              <span class="meta-dot">·</span>
              <span>{{ msg.response.elapsed_ms }}ms</span>
              <span class="meta-dot">·</span>
              <span>
                本地 {{ msg.response.token_usage.local.total_tokens.toLocaleString() }}
                / 云端 {{ msg.response.token_usage.remote.total_tokens.toLocaleString() }} tokens
              </span>
            </div>
          </div>

          <div
            v-else-if="msg.loading && (msg.streamSql || msg.streamColumns)"
            class="message__card message__card--streaming"
          >
            <div v-if="msg.streamSql" class="stream-preview stream-preview--inline">
              <span class="stream-preview__label">{{ msg.streamColumns ? "SQL" : "SQL 生成中" }}</span>
              <pre class="stream-preview__code">{{ msg.streamSql }}<span v-if="!msg.streamColumns" class="cursor">|</span></pre>
            </div>
            <ResultChart
              v-if="msg.streamColumns && msg.streamRows"
              :columns="msg.streamColumns"
              :rows="msg.streamRows"
            />
            <ResultTable
              v-if="msg.streamColumns && msg.streamRows"
              :columns="msg.streamColumns"
              :rows="msg.streamRows"
            />
          </div>

          <div
            v-else-if="msg.loading && msg.streamInterpretation"
            class="message__card message__card--streaming"
          >
            <div class="interpretation">
              {{ msg.streamInterpretation }}<span class="cursor">|</span>
            </div>
          </div>
        </div>
      </div>
    </main>

    <footer class="footer">
      <div class="footer__inner">
        <div class="footer__bar">
          <el-popover
            v-if="messages.length > 0"
            v-model:visible="samplePopoverVisible"
            placement="top-start"
            :width="320"
            trigger="click"
            popper-class="sample-popover"
          >
            <template #reference>
              <button type="button" class="btn-sample" aria-label="示例问题">
                示例
              </button>
            </template>
            <ul class="sample-list">
              <li v-for="q in sampleQuestions" :key="q">
                <button type="button" class="sample-list__item" @click="fillSample(q)">
                  {{ q }}
                </button>
              </li>
            </ul>
          </el-popover>
          <ChatInput
            v-model="input"
            :loading="loading"
            class="footer__input"
            @submit="handleSubmit"
          />
          <el-switch
            v-model="interpretEnabled"
            active-text="AI 解读"
            inactive-text="仅数据"
            size="small"
            class="footer__switch"
          />
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgb(255 255 255 / 85%);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}

.header__inner {
  max-width: 880px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.header__brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.header__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.header__subtitle {
  font-size: 12px;
  color: var(--text-muted);
}

.header__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.header__provider {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header__select {
  width: 130px;
}

.main {
  flex: 1;
  max-width: 880px;
  margin: 0 auto;
  width: 100%;
  padding: 24px 24px 120px;
  overflow-y: auto;
}

.main__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.btn-ghost {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-ghost:hover {
  background: var(--surface-muted);
}

.empty {
  text-align: center;
  padding: 80px 24px;
}

.empty__icon {
  font-size: 40px;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty__title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.empty__hint {
  margin: 0 0 28px;
  font-size: 14px;
  color: var(--text-muted);
}

.empty__samples {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 560px;
  margin: 0 auto;
}

.message {
  margin-bottom: 32px;
}

.message__user {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.message__bubble {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  font-size: 14px;
  line-height: 1.6;
}

.message__bubble--user {
  background: var(--user-bubble);
  color: white;
  border-bottom-right-radius: 4px;
}

.message__assistant {
  padding-left: 4px;
}

.message__card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.message__card--streaming {
  border-style: dashed;
}

.message__meta {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.meta-dot {
  opacity: 0.5;
}

.interpretation {
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--surface-muted);
  border-radius: var(--radius);
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
  border-left: 3px solid var(--accent-primary);
}

.stream-preview {
  margin: 8px 0 12px;
  padding: 12px 16px;
  background: var(--surface-muted);
  border-radius: var(--radius);
}

.stream-preview__label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.stream-preview__code {
  margin: 0;
  font-size: 12px;
  font-family: "Cascadia Code", "Fira Code", monospace;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

.cursor {
  display: inline-block;
  animation: blink 1s step-end infinite;
  color: var(--accent-primary);
  font-weight: 300;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.footer {
  position: sticky;
  bottom: 0;
  z-index: 10;
  background: rgb(255 255 255 / 92%);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
  padding: 12px 24px 16px;
}

.footer__inner {
  max-width: 880px;
  margin: 0 auto;
}

.footer__bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer__input {
  flex: 1;
  min-width: 0;
}

.footer__switch {
  flex-shrink: 0;
}

.btn-sample {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.btn-sample:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 4%, white);
}

.sample-list {
  margin: 0;
  padding: 4px 0;
  list-style: none;
}

.sample-list__item {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.sample-list__item:hover {
  background: var(--surface-muted);
  color: var(--text-primary);
}

.sample-chip {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sample-chip:hover {
  border-color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 4%, white);
}

@media (max-width: 640px) {
  .footer__bar {
    flex-wrap: wrap;
  }

  .footer__switch {
    width: 100%;
    justify-content: flex-end;
  }

  .footer__switch :deep(.el-switch__label) {
    font-size: 12px;
  }
}
</style>

<style>
.sample-popover.el-popover.el-popper {
  padding: 6px !important;
  border-radius: var(--radius) !important;
  border: 1px solid var(--border) !important;
  box-shadow: var(--shadow-md) !important;
}
</style>
