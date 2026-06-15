/**
 * 本地启动 Mock 域 Data API，用于问数联调（无需真实 MySQL）
 *
 * 用法：
 *   pnpm mock:domain
 *   pnpm mock:domain -- --port 18080 --domain mro
 */
import { startMockDomainApiServer } from "../tests/fixtures/mockDomainApiServer.js";

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

const port = Number(readArg("--port") ?? "18080");
const domain = (readArg("--domain") ?? "mes") as "mes" | "mro";
const token = readArg("--token") ?? "test-token";

const mock = await startMockDomainApiServer({
  domain,
  port,
  token,
});

console.log("");
console.log("Mock 域 Data API 已启动");
console.log("──────────────────────────────────────");
console.log(`  域标识:   ${domain}`);
console.log(`  基址:     ${mock.baseUrl}`);
console.log(`  Token:    ${token}`);
console.log("");
console.log("问数 .env 配置示例：");
if (domain === "mes") {
  console.log(`  MES_DATA_API_URL=${mock.baseUrl}`);
  console.log(`  MES_DATA_API_TOKEN=${token}`);
} else {
  console.log(`  MRO_DATA_API_URL=${mock.baseUrl}`);
  console.log(`  MRO_DATA_API_TOKEN=${token}`);
}
console.log("");
console.log("健康检查：");
console.log(`  curl -H "Authorization: Bearer ${token}" ${mock.baseUrl}/api/v1/health`);
console.log("");
console.log("按 Ctrl+C 停止");

process.on("SIGINT", () => {
  void mock.close().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void mock.close().then(() => process.exit(0));
});
