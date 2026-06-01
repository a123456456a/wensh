import type { RemoteProvider, RemoteProviderOption } from "@wensh/shared";

/** 占位 API Key，视为未配置 */
const PLACEHOLDER_API_KEY = "sk-xxxxxxxxxxxxxxxx";

/** 远端提供商预设 */
interface RemoteProviderPreset {
  label: string;
  baseURL: string;
  defaultModel: string;
  apiKeyEnv: string;
  modelNameEnv: string;
}

/** 内置 OpenAI 兼容远端提供商配置 */
const REMOTE_PROVIDER_PRESETS: Record<RemoteProvider, RemoteProviderPreset> = {
  qwen: {
    label: "Qwen (DashScope)",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-max",
    apiKeyEnv: "QWEN_API_KEY",
    modelNameEnv: "QWEN_MODEL_NAME",
  },
  deepseek: {
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-pro",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelNameEnv: "DEEPSEEK_MODEL_NAME",
  },
  openai: {
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    apiKeyEnv: "OPENAI_API_KEY",
    modelNameEnv: "OPENAI_MODEL_NAME",
  },
  custom: {
    label: "Custom",
    baseURL: "",
    defaultModel: "",
    apiKeyEnv: "CUSTOM_API_KEY",
    modelNameEnv: "CUSTOM_MODEL_NAME",
  },
};

/** 解析后的远端模型连接配置 */
export interface RemoteModelConfig {
  provider: RemoteProvider;
  label: string;
  baseURL: string;
  apiKey: string;
  modelName: string;
}

/**
 * 读取 .env 默认远端提供商（非法值回退为 qwen）
 */
export function getRemoteProvider(): RemoteProvider {
  const raw = (process.env.REMOTE_PROVIDER ?? "qwen").trim().toLowerCase();
  if (raw in REMOTE_PROVIDER_PRESETS) {
    return raw as RemoteProvider;
  }
  return "qwen";
}

/**
 * 解析远端模型连接参数
 * @param providerOverride - 指定提供商；不传则使用 REMOTE_PROVIDER 默认值
 */
export function resolveRemoteModelConfig(
  providerOverride?: RemoteProvider,
): RemoteModelConfig {
  const provider = providerOverride ?? getRemoteProvider();
  const preset = REMOTE_PROVIDER_PRESETS[provider];

  const baseURLOverride = process.env.REMOTE_BASE_URL?.trim();
  const baseURL =
    baseURLOverride ||
    (provider === "custom"
      ? (process.env.CUSTOM_BASE_URL ?? "").trim()
      : preset.baseURL);

  const apiKey = (process.env[preset.apiKeyEnv] ?? "").trim();
  const modelName =
    (process.env[preset.modelNameEnv] ?? "").trim() || preset.defaultModel;

  return {
    provider,
    label: preset.label,
    baseURL,
    apiKey,
    modelName,
  };
}

/**
 * 判断指定远端提供商是否已在 .env 中配置
 * @param provider - 远端提供商标识
 */
export function isProviderConfigured(provider: RemoteProvider): boolean {
  const config = resolveRemoteModelConfig(provider);

  if (!config.baseURL) {
    return false;
  }

  return (
    config.apiKey.length > 0 && config.apiKey !== PLACEHOLDER_API_KEY
  );
}

/**
 * 探测 .env 默认远端 API 是否已配置
 */
export function isRemoteConfigured(): boolean {
  return isProviderConfigured(getRemoteProvider());
}

/**
 * 列出支持的远端提供商标识（供 health / 文档使用）
 */
export function listRemoteProviders(): RemoteProvider[] {
  return Object.keys(REMOTE_PROVIDER_PRESETS) as RemoteProvider[];
}

/**
 * 列出所有内置远端提供商及其配置状态（供前端下拉切换）
 */
export function listRemoteProviderOptions(): RemoteProviderOption[] {
  return listRemoteProviders().map((provider) => {
    const config = resolveRemoteModelConfig(provider);
    return {
      provider,
      label: config.label,
      model_name: config.modelName,
      available: isProviderConfigured(provider),
    };
  });
}
