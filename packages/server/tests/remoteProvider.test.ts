import { describe, expect, it, beforeEach } from "vitest";
import {
  getRemoteProvider,
  isProviderConfigured,
  isRemoteConfigured,
  listRemoteProviderOptions,
  listRemoteProviders,
  resolveRemoteModelConfig,
} from "../src/chains/remoteProvider.js";

describe("remoteProvider", () => {
  beforeEach(() => {
    delete process.env.REMOTE_PROVIDER;
    delete process.env.REMOTE_BASE_URL;
    delete process.env.QWEN_API_KEY;
    delete process.env.QWEN_MODEL_NAME;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_MODEL_NAME;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL_NAME;
    delete process.env.CUSTOM_BASE_URL;
    delete process.env.CUSTOM_API_KEY;
    delete process.env.CUSTOM_MODEL_NAME;
  });

  it("defaults to deepseek provider", () => {
    expect(getRemoteProvider()).toBe("deepseek");
    const config = resolveRemoteModelConfig();
    expect(config.provider).toBe("deepseek");
    expect(config.baseURL).toBe("https://api.deepseek.com");
    expect(config.modelName).toBe("deepseek-v4-pro");
  });

  it("resolves deepseek provider config", () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    process.env.DEEPSEEK_MODEL_NAME = "deepseek-reasoner";

    const config = resolveRemoteModelConfig("deepseek");
    expect(config.provider).toBe("deepseek");
    expect(config.baseURL).toBe("https://api.deepseek.com");
    expect(config.apiKey).toBe("sk-test");
    expect(config.modelName).toBe("deepseek-reasoner");
  });

  it("resolves openai provider config", () => {
    process.env.REMOTE_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";

    const config = resolveRemoteModelConfig();
    expect(config.provider).toBe("openai");
    expect(config.baseURL).toBe("https://api.openai.com/v1");
    expect(config.modelName).toBe("gpt-4o-mini");
  });

  it("resolves custom provider with CUSTOM_BASE_URL", () => {
    process.env.REMOTE_PROVIDER = "custom";
    process.env.CUSTOM_BASE_URL = "https://proxy.example.com/v1";
    process.env.CUSTOM_API_KEY = "sk-test";
    process.env.CUSTOM_MODEL_NAME = "my-model";

    const config = resolveRemoteModelConfig();
    expect(config.provider).toBe("custom");
    expect(config.baseURL).toBe("https://proxy.example.com/v1");
    expect(config.modelName).toBe("my-model");
  });

  it("REMOTE_BASE_URL overrides preset base URL", () => {
    process.env.REMOTE_PROVIDER = "deepseek";
    process.env.REMOTE_BASE_URL = "https://gateway.example.com/v1";
    process.env.DEEPSEEK_API_KEY = "sk-test";

    const config = resolveRemoteModelConfig();
    expect(config.baseURL).toBe("https://gateway.example.com/v1");
  });

  it("falls back to deepseek for unknown provider", () => {
    process.env.REMOTE_PROVIDER = "unknown-vendor";
    expect(getRemoteProvider()).toBe("deepseek");
  });

  it("isRemoteConfigured rejects placeholder and missing keys", () => {
    process.env.DEEPSEEK_API_KEY = "sk-xxxxxxxxxxxxxxxx";
    expect(isRemoteConfigured()).toBe(false);

    process.env.DEEPSEEK_API_KEY = "sk-real-key";
    expect(isRemoteConfigured()).toBe(true);
  });

  it("isRemoteConfigured requires base URL for custom provider", () => {
    process.env.REMOTE_PROVIDER = "custom";
    process.env.CUSTOM_API_KEY = "sk-real-key";
    expect(isRemoteConfigured()).toBe(false);

    process.env.CUSTOM_BASE_URL = "https://proxy.example.com/v1";
    expect(isRemoteConfigured()).toBe(true);
  });

  it("provider override ignores REMOTE_PROVIDER env", () => {
    process.env.REMOTE_PROVIDER = "qwen";
    process.env.DEEPSEEK_API_KEY = "sk-test";

    const config = resolveRemoteModelConfig("deepseek");
    expect(config.provider).toBe("deepseek");
  });

  it("isProviderConfigured checks each provider independently", () => {
    process.env.QWEN_API_KEY = "sk-qwen";
    process.env.DEEPSEEK_API_KEY = "";

    expect(isProviderConfigured("qwen")).toBe(true);
    expect(isProviderConfigured("deepseek")).toBe(false);
  });

  it("listRemoteProviderOptions includes availability", () => {
    process.env.QWEN_API_KEY = "sk-qwen";
    const options = listRemoteProviderOptions();
    expect(options).toHaveLength(4);
    expect(options.find((item) => item.provider === "qwen")?.available).toBe(true);
  });

  it("lists all supported providers", () => {
    expect(listRemoteProviders()).toEqual([
      "qwen",
      "deepseek",
      "openai",
      "custom",
    ]);
  });
});
