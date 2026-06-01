/**
 * 去除 Qwen thinking 标签内容
 * @param text - LLM 原始输出
 */
export function stripThinkingTags(text: string): string {
  return text
    .replace(/[\s\S]*?<\/think>/gi, "")
    .replace(/[\s\S]*?<\/redacted_thinking>/gi, "")
    .trim();
}

/**
 * 从 LLM 输出中提取 SQL 语句
 * @param raw - LLM 原始输出
 * @returns 提取到的 SQL，失败返回 null
 */
export function extractSql(raw: string): string | null {
  const text = stripThinkingTags(raw);

  const fencedMatch = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const sql = fencedMatch[1].trim();
    if (sql.length > 0) {
      return sql;
    }
  }

  const selectMatch = text.match(/(SELECT[\s\S]+)/i);
  if (selectMatch?.[1]) {
    let sql = selectMatch[1].trim();
    const semicolonIdx = sql.indexOf(";");
    if (semicolonIdx > -1) {
      sql = sql.slice(0, semicolonIdx + 1);
    }
    return sql;
  }

  return null;
}

/**
 * 从解读文本中提取 chart_hint
 * @param text - 语言化解读文本
 */
export function extractChartHint(
  text: string,
): "bar" | "line" | "table" | null {
  const match = text.match(/\[chart:(bar|line|table)\]/i);
  if (match?.[1]) {
    return match[1].toLowerCase() as "bar" | "line" | "table";
  }
  return null;
}

/**
 * 去除解读文本中的 chart 标记
 */
export function stripChartTag(text: string): string {
  return text.replace(/\[chart:(bar|line|table)\]/gi, "").trim();
}
