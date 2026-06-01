import type { Server } from "node:http";
import express from "express";
import {
  normalizeHeaders,
  verifyWenshSignature,
} from "./verifyWenshSignature.js";

/** Mock 域 API 启动选项 */
export interface MockDomainApiOptions {
  /** 域标识，默认 mes */
  domain?: "mes" | "mro";
  /** 展示名称 */
  label?: string;
  /** Bearer Token，默认 test-token */
  token?: string;
  /** 监听端口，0 表示随机端口 */
  port?: number;
  /** 启用 X-Wensh-* 签名校验时的共享密钥 */
  signingSecret?: string;
}

/** 已启动的 Mock 域 API 实例 */
export interface MockDomainApiServer {
  server: Server;
  port: number;
  /** 不含尾部斜杠的基址，如 http://127.0.0.1:54321 */
  baseUrl: string;
  /** 关闭 HTTP 服务 */
  close: () => Promise<void>;
}

const MOCK_SCHEMA = {
  dialect: "mysql" as const,
  prompt_schema:
    "CREATE TABLE work_order (id INT PRIMARY KEY, status VARCHAR(32), line_code VARCHAR(16));",
  metrics_prompt: "- 工单完成率 = 已完成工单数 / 总工单数",
  tables_meta: [
    {
      name: "work_order",
      label: "生产工单",
      tier: "large" as const,
      keywords: ["工单", "在制", "订单"],
    },
  ],
};

/**
 * 启动最小域 Data API Mock（Express）
 * 实现 GET /health、GET /schema、POST /query/execute，供集成测试与联调使用
 * @param options - 域标识、Token 与端口配置
 */
export async function startMockDomainApiServer(
  options: MockDomainApiOptions = {},
): Promise<MockDomainApiServer> {
  const domain = options.domain ?? "mes";
  const label =
    options.label ?? (domain === "mes" ? "制造执行" : "设备维护");
  const token = options.token ?? "test-token";
  const signingSecret = options.signingSecret;

  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) {
      res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
    if (signingSecret) {
      const headers = normalizeHeaders(req.headers);
      if (!verifyWenshSignature(headers, signingSecret)) {
        res.status(401).json({
          error: "Invalid user signature",
          code: "UNAUTHORIZED",
        });
        return;
      }
    }
    next();
  });

  app.get("/api/v1/health", (_req, res) => {
    res.json({
      domain,
      label,
      database: { available: true, dialect: "mysql", version: "8.0.36" },
    });
  });

  app.get("/api/v1/schema", (_req, res) => {
    res.json(MOCK_SCHEMA);
  });

  app.post("/api/v1/query/execute", (req, res) => {
    const sql = String(req.body?.sql ?? "")
      .trim()
      .toUpperCase();

    if (!sql.startsWith("SELECT")) {
      res.status(400).json({
        error: "仅允许 SELECT 语句",
        code: "SQL_VALIDATION_ERROR",
      });
      return;
    }

    res.json({
      columns: ["result"],
      rows: [{ result: 1 }],
      row_count: 1,
      exec_ms: 1,
    });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(options.port ?? 0, "127.0.0.1", () => {
      const addr = server.address();
      const port =
        typeof addr === "object" && addr !== null ? addr.port : 0;
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on("error", reject);
  });
}
