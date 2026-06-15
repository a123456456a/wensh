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
import StreamingText from "../components/StreamingText.vue";
import RouteRulesPanel from "../components/RouteRulesPanel.vue";
import DomainStatusList from "../components/DomainStatusList.vue";
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
const selectedRemoteProvider = ref<RemoteProvider>("deepseek");
const sessionTokens = ref<QueryTokenUsage>(emptyQueryTokenUsage());
const samplePopoverVisible = ref(false);

/** 当前域的示例问题 */
const sampleQuestions = computed(
  () => DOMAIN_SAMPLE_QUESTIONS[selectedDomain.value],
);

/** 当前域的健康信息 */
const selectedDomainHealth = computed(() =>
  health.value?.domains.find((d) => d.domain === selectedDomain.value),
);

/** 路由模式中文标签 */
const routerModeLabel = computed(() => {
  const mode = health.value?.router.mode;
  switch (mode) {
    case "rule":
      return "规则";
    case "llm":
      return "LLM";
    case "hybrid":
      return "混合";
    default:
      return "";
  }
});

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
 * 判断是否为 SQL / 解读分模型模式
 * @param response - 查询成功响应
 */
function isSplitModelMode(response: NonNullable<ChatMessage["response"]>): boolean {
  return (
    Boolean(response.interpret_model_used) &&
    response.interpret_model_used !== response.model_used
  );
}

/**
 * 模型类型中文标签
 * @param type - local 或 remote
 */
function modelTypeLabel(type: "local" | "remote"): string {
  return type === "local" ? "本地" : "云端";
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
 * 判断是否为闲聊模式消息（含流式进行中）
 * @param msg - 会话消息
 */
function isChatMessage(msg: ChatMessage): boolean {
  if (msg.response?.response_mode === "chat") {
    return true;
  }
  return Boolean(msg.loading && msg.streamInterpretation && !msg.streamSql);
}

/**
 * 获取消息展示用全文（优先已完成响应）
 * @param msg - 会话消息
 */
function messageDisplayText(msg: ChatMessage): string {
  return msg.response?.interpretation ?? msg.streamInterpretation ?? "";
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
  const msgIndex = messages.value.length - 1;
  input.value = "";
  loading.value = true;

  /**
   * 通过 reactive 数组索引更新，确保流式增量触发视图刷新
   */
  const patchMessage = (patch: Partial<ChatMessage>): void => {
    const current = messages.value[msgIndex];
    if (!current) return;
    messages.value[msgIndex] = { ...current, ...patch };
  };

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
        const current = messages.value[msgIndex];
        if (!current) return;

        switch (event.type) {
          case "phase":
            patchMessage({ streamPhase: event.message });
            break;
          case "sql_delta":
            patchMessage({
              streamSql: (current.streamSql ?? "") + event.delta,
            });
            break;
          case "sql":
            patchMessage({ streamSql: event.sql });
            break;
          case "data":
            patchMessage({
              streamColumns: event.columns,
              streamRows: event.rows,
            });
            break;
          case "interpret_delta":
            patchMessage({
              streamInterpretation:
                (current.streamInterpretation ?? "") + event.delta,
            });
            break;
          case "done":
            patchMessage({
              response: event.result,
              loading: false,
              streamPhase: undefined,
            });
            accumulateSessionTokens(event.result.token_usage);
            break;
          case "error":
            patchMessage({
              error: event.error,
              loading: false,
              streamPhase: undefined,
            });
            break;
        }
      },
    );

    const finalMsg = messages.value[msgIndex];
    if (finalMsg?.loading) {
      patchMessage({ loading: false });
      if (!finalMsg.response && !finalMsg.error) {
        patchMessage({ error: { error: "流式连接意外中断" } });
      }
    }
  } catch {
    patchMessage({
      error: { error: "网络请求失败" },
      loading: false,
      streamPhase: undefined,
    });
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
    <aside class="sidebar">
      <div class="sidebar__brand">
        <h1 class="sidebar__title">问数</h1>
        <span class="sidebar__subtitle">WenShu · MES 自然语言查数</span>
      </div>

      <template v-if="health">
        <section class="sidebar__section">
          <h2 class="sidebar__section-title">数据源</h2>
          <el-select
            v-model="selectedDomain"
            size="small"
            class="sidebar__select"
            placeholder="业务域"
          >
            <el-option
              v-for="item in DOMAIN_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <DomainStatusList
            :domains="health.domains"
            :selected="selectedDomain"
          />
          <p
            v-if="selectedDomainHealth && !selectedDomainHealth.api_available"
            class="sidebar__warning"
          >
            当前域 API 未连通，查询可能失败
          </p>
        </section>

        <section class="sidebar__section">
          <h2 class="sidebar__section-title">云端模型</h2>
          <el-select
            :model-value="selectedRemoteProvider"
            size="small"
            class="sidebar__select"
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
          <p v-if="selectedProviderInfo" class="sidebar__model-hint">
            {{ selectedProviderInfo.model_name }}
          </p>
        </section>

        <section class="sidebar__section">
          <h2 class="sidebar__section-title">系统状态</h2>
          <div class="sidebar__status">
            <StatusPill
              label="本地模型"
              :online="health.local_model.available"
            />
            <StatusPill
              label="数据库"
              :online="health.database.available"
            />
          </div>
        </section>

        <section v-if="health.router" class="sidebar__section">
          <RouteRulesPanel :router="health.router" />
        </section>
      </template>

      <div class="sidebar__tokens">
        <p class="sidebar__tokens-label">Token 用量</p>
        <TokenStats
          :local="sessionTokens.local"
          :remote="sessionTokens.remote"
        />
      </div>

      <div class="sidebar__spacer" />

      <div v-if="health?.auth?.enabled && currentUser" class="sidebar__user">
        <span class="sidebar__username">{{ currentUser.username }}</span>
        <button type="button" class="btn-ghost btn-ghost--sm" @click="handleLogout">
          退出
        </button>
      </div>
    </aside>

    <div class="content">
    <main class="main">
      <div class="main__toolbar">
        <button type="button" class="btn-ghost" @click="newConversation">
          新对话
        </button>
      </div>

      <div v-if="messages.length === 0" class="empty">
        <div class="empty__icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="6" y="10" width="36" height="28" rx="6" stroke="currentColor" stroke-width="2" opacity="0.3" />
            <path d="M14 22h20M14 28h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5" />
          </svg>
        </div>
        <p class="empty__title">开始提问</p>
        <p class="empty__hint">
          用自然语言查询制造数据，系统自动在本地/云端模型间路由
          <span v-if="routerModeLabel" class="empty__mode">· {{ routerModeLabel }}模式</span>
        </p>
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
            v-if="msg.loading && msg.streamPhase && !msg.streamInterpretation && !msg.streamSql"
            :message="msg.streamPhase"
          />

          <div v-if="msg.error" class="message__card">
            <ErrorAlert :error="msg.error.error" :sql="msg.error.sql" />
          </div>

          <div v-if="isChatMessage(msg)" class="message__card message__card--chat">
            <div class="chat-reply">
              <StreamingText
                :text="messageDisplayText(msg)"
                :active="!!msg.loading"
              />
            </div>
          </div>

          <div v-else-if="msg.response" class="message__card">
            <ModelBadge
              :model-used="msg.response.model_used"
              :model-name="msg.response.model_name"
              :interpret-model-used="msg.response.interpret_model_used"
              :interpret-model-name="msg.response.interpret_model_name"
              :fallback-reason="msg.response.fallback_reason"
              :route-source="msg.response.route_source"
              :route-reason="msg.response.route_reason"
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
              <StreamingText
                :text="messageDisplayText(msg)"
                :active="!!msg.loading"
              />
            </div>
            <div class="message__meta">
              <span>{{ msg.response.row_count }} 行</span>
              <span class="meta-dot">·</span>
              <span>{{ msg.response.elapsed_ms }}ms</span>
              <template v-if="isSplitModelMode(msg.response)">
                <span class="meta-dot">·</span>
                <span>
                  SQL {{ modelTypeLabel(msg.response.model_used) }}
                  / 解读 {{ modelTypeLabel(msg.response.interpret_model_used!) }}
                </span>
              </template>
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
            <div v-if="msg.streamInterpretation" class="interpretation">
              <StreamingText
                :text="msg.streamInterpretation"
                :active="!!msg.loading"
              />
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
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: row;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  background: linear-gradient(180deg, var(--surface) 0%, color-mix(in srgb, var(--bg) 40%, var(--surface)) 100%);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
  gap: 12px;
}

.sidebar__brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.sidebar__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.sidebar__subtitle {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.sidebar__select {
  width: 100%;
}

.sidebar__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar__section-title {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.sidebar__model-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  padding-left: 2px;
}

.sidebar__warning {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--accent-warning);
  padding: 6px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-warning) 8%, transparent);
}

.sidebar__status {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sidebar__tokens {
  padding-top: 2px;
}

.sidebar__tokens-label {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
}

.sidebar__spacer {
  flex: 1;
}

.sidebar__user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.sidebar__username {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
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

.btn-ghost--sm {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-ghost:hover {
  background: var(--surface-muted);
}

.empty {
  text-align: center;
  padding: 80px 24px;
}

.empty__icon {
  margin-bottom: 16px;
  color: var(--accent-primary);
  opacity: 0.7;
}

.empty__mode {
  color: var(--accent-primary);
  font-weight: 500;
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

.message__card--chat {
  padding: 4px 0;
}

.chat-reply {
  padding: 14px 18px;
  background: var(--surface-muted);
  border-radius: var(--radius);
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-secondary);
  white-space: pre-line;
  border-left: 3px solid var(--accent-warning);
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

@media (max-width: 768px) {
  .sidebar {
    width: 160px;
    padding: 16px 12px;
  }

  .sidebar__title {
    font-size: 17px;
  }
}

@media (max-width: 640px) {
  .app {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    height: auto;
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px 16px;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }

  .sidebar__brand {
    width: 100%;
    padding-bottom: 0;
    border-bottom: none;
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }

  .sidebar__subtitle {
    font-size: 11px;
  }

  .sidebar__spacer {
    display: none;
  }

  .sidebar__tokens {
    flex: 1;
  }

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
