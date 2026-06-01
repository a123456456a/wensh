import { Router, type Response } from "express";
import type { QueryErrorResponse, RemoteProvider, StreamEvent } from "@wensh/shared";
import { z } from "zod";
import { runQueryChain, runQueryChainStream, QueryChainError } from "../chains/buildChain.js";

const remoteProviderSchema = z.enum([
  "qwen",
  "deepseek",
  "openai",
  "custom",
]) satisfies z.ZodType<RemoteProvider>;

const historyItemSchema = z.object({
  question: z.string().min(1).max(500),
  sql: z.string().min(1),
});

const queryBodySchema = z.object({
  question: z.string().min(1).max(500),
  interpret: z.boolean().optional(),
  history: z.array(historyItemSchema).max(2).optional(),
  remote_provider: remoteProviderSchema.optional(),
});

/** POST /api/query 路由 */
export const queryRouter = Router();

queryRouter.post("/", async (req, res, next) => {
  const parsed = queryBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "请求参数无效";
    res.status(400).json({ error: message } satisfies QueryErrorResponse);
    return;
  }

  try {
    const result = await runQueryChain(parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 写入 SSE 事件
 * @param res - Express 响应
 * @param event - 流式事件
 */
function writeSseEvent(res: Response, event: StreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** POST /api/query/stream SSE 流式查询 */
queryRouter.post("/stream", async (req, res) => {
  const parsed = queryBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "请求参数无效";
    res.status(400).json({ error: message } satisfies QueryErrorResponse);
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  await runQueryChainStream(parsed.data, (event) => {
    writeSseEvent(res, event);
  });

  res.end();
});

/**
 * 将 QueryChainError 转为计划规定的错误响应
 */
export function toQueryErrorResponse(err: unknown): QueryErrorResponse {
  if (err instanceof QueryChainError) {
    return {
      error: err.message,
      sql: err.context.sql,
      model_used: err.context.model_used,
      model_name: err.context.model_name,
    };
  }
  const message = err instanceof Error ? err.message : "查询失败";
  return { error: message };
}
