/** 禁止出现在 SQL 中的危险关键字 */
const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "REPLACE",
  "TRUNCATE",
  "ATTACH",
  "DETACH",
  "PRAGMA",
];

/**
 * 校验 SQL 是否安全（仅允许 SELECT）
 * @param sql - 待执行的 SQL
 * @returns 校验通过返回 true
 */
export function isSqlSafe(sql: string): boolean {
  const trimmed = sql.trim();
  if (!/^SELECT\b/i.test(trimmed)) {
    return false;
  }

  const upper = trimmed.toUpperCase();
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`, "i");
    if (pattern.test(upper)) {
      return false;
    }
  }

  if (hasMultipleStatements(trimmed)) {
    return false;
  }

  return true;
}

/**
 * 检测是否存在多条 SQL 语句
 */
function hasMultipleStatements(sql: string): boolean {
  const withoutStrings = sql.replace(/'[^']*'/g, "");
  const parts = withoutStrings.split(";").filter((p) => p.trim().length > 0);
  return parts.length > 1;
}

/**
 * 校验 SQL，不通过则抛出错误
 * @param sql - 待执行的 SQL
 */
export function assertSqlSafe(sql: string): void {
  if (!isSqlSafe(sql)) {
    throw new Error("SQL 安全校验失败：仅允许单条 SELECT 语句");
  }
}
