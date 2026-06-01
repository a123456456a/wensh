import type { BusinessDomain } from "@wensh/shared";
import { HttpDomainAdapter } from "./httpDomainAdapter.js";
import { SqliteDemoAdapter } from "./sqliteDemoAdapter.js";
import type { DomainDataAdapter } from "./types.js";

const demoAdapter = new SqliteDemoAdapter();

/**
 * 从环境变量解析 HTTP 域 Adapter
 * @param domain - 业务域标识
 * @param label - 展示名称
 * @param urlEnv - 基址环境变量名
 */
function createHttpAdapter(
  domain: BusinessDomain,
  label: string,
  urlEnv: string,
): DomainDataAdapter | null {
  const baseUrl = process.env[urlEnv]?.trim();
  if (!baseUrl) return null;
  const tokenEnv =
    domain === "mes" ? "MES_DATA_API_TOKEN" : "MRO_DATA_API_TOKEN";
  const token =
    process.env[tokenEnv]?.trim() ??
    process.env.DOMAIN_API_TOKEN?.trim() ??
    "";
  const timeoutMs = Number(process.env.DOMAIN_API_TIMEOUT_MS ?? "30000");
  return new HttpDomainAdapter({ domain, label, baseUrl, token, timeoutMs });
}

/**
 * 获取指定域 Adapter；未配置 HTTP 域时 mes/mro 不可用
 * @param domain - 业务域标识
 * @throws 当 mes/mro 未配置 API 基址时
 */
export function getDomainAdapter(domain: BusinessDomain): DomainDataAdapter {
  if (domain === "demo") return demoAdapter;

  if (domain === "mes") {
    const adapter = createHttpAdapter(
      "mes",
      process.env.MES_DOMAIN_LABEL ?? "制造执行",
      "MES_DATA_API_URL",
    );
    if (!adapter) {
      throw new Error("MES 域 API 未配置，请设置 MES_DATA_API_URL");
    }
    return adapter;
  }

  if (domain === "mro") {
    const adapter = createHttpAdapter(
      "mro",
      process.env.MRO_DOMAIN_LABEL ?? "设备维护",
      "MRO_DATA_API_URL",
    );
    if (!adapter) {
      throw new Error("MRO 域 API 未配置，请设置 MRO_DATA_API_URL");
    }
    return adapter;
  }

  throw new Error(`未知业务域: ${domain}`);
}

/** 域健康检查条目（含 Adapter 实例） */
export interface DomainHealthEntry {
  domain: BusinessDomain;
  label: string;
  adapter: DomainDataAdapter | null;
  apiBaseUrl: string;
}

/**
 * 列出所有域及其 Adapter（health 用）
 * @returns demo/mes/mro 三域的配置与 Adapter 实例
 */
export async function listDomainHealth(): Promise<DomainHealthEntry[]> {
  const items: Array<{
    domain: BusinessDomain;
    label: string;
    envKey: string;
  }> = [
    { domain: "demo", label: "本地演示", envKey: "" },
    {
      domain: "mes",
      label: process.env.MES_DOMAIN_LABEL ?? "制造执行",
      envKey: "MES_DATA_API_URL",
    },
    {
      domain: "mro",
      label: process.env.MRO_DOMAIN_LABEL ?? "设备维护",
      envKey: "MRO_DATA_API_URL",
    },
  ];

  return items.map((item) => {
    if (item.domain === "demo") {
      return {
        domain: item.domain,
        label: item.label,
        adapter: demoAdapter,
        apiBaseUrl: "sqlite://local",
      };
    }
    const baseUrl = process.env[item.envKey]?.trim() ?? "";
    const adapter = baseUrl
      ? createHttpAdapter(item.domain, item.label, item.envKey)
      : null;
    return {
      domain: item.domain,
      label: item.label,
      adapter,
      apiBaseUrl: baseUrl,
    };
  });
}
