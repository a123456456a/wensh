import type { RemoteProvider } from "@wensh/shared";

/** localStorage 键名 */
const STORAGE_KEY = "wensh-remote-provider";

const REMOTE_PROVIDERS: RemoteProvider[] = [
  "qwen",
  "deepseek",
  "openai",
  "custom",
];

/**
 * 判断字符串是否为合法的远端提供商标识
 */
export function isRemoteProvider(value: string): value is RemoteProvider {
  return REMOTE_PROVIDERS.includes(value as RemoteProvider);
}

/**
 * 从 localStorage 读取已保存的远端提供商
 * @param fallback - 无有效缓存时的默认值
 */
export function loadSavedRemoteProvider(fallback: RemoteProvider): RemoteProvider {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isRemoteProvider(saved)) {
      return saved;
    }
  } catch {
    // 隐私模式或禁用 storage 时忽略
  }
  return fallback;
}

/**
 * 将远端提供商选择持久化到 localStorage
 * @param provider - 远端提供商标识
 */
export function saveRemoteProvider(provider: RemoteProvider): void {
  try {
    localStorage.setItem(STORAGE_KEY, provider);
  } catch {
    // 忽略写入失败
  }
}
