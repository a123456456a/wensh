import type {
  QueryErrorResponse,
  QueryRequest,
  StreamEvent,
} from "@wensh/shared";

/**
 * 解析 SSE 缓冲区中的 data 行
 * @param buffer - 累积的 SSE 文本
 * @returns 已解析事件与剩余缓冲区
 */
function parseSseBuffer(buffer: string): {
  events: StreamEvent[];
  rest: string;
} {
  const events: StreamEvent[] = [];
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    try {
      events.push(JSON.parse(line.slice(6)) as StreamEvent);
    } catch {
      // 忽略不完整 JSON
    }
  }

  return { events, rest };
}

/**
 * 流式提交自然语言查询（SSE）
 * @param body - 查询请求体
 * @param onEvent - 每收到一条 SSE 事件时回调
 */
export async function postQueryStream(
  body: QueryRequest,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const response = await fetch("/api/query/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let error: QueryErrorResponse = { error: "请求失败" };
    try {
      error = (await response.json()) as QueryErrorResponse;
    } catch {
      // 使用默认错误
    }
    onEvent({ type: "error", error });
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onEvent({ type: "error", error: { error: "服务器未返回流式响应" } });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;

    for (const event of parsed.events) {
      onEvent(event);
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseBuffer(`${buffer}\n`);
    for (const event of parsed.events) {
      onEvent(event);
    }
  }
}
