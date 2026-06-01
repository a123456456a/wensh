import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** SQLite 数据库文件路径 */
export const DB_PATH = path.resolve(__dirname, "../../data/mes.db");

let dbInstance: DatabaseSync | null = null;

/**
 * 获取 SQLite 数据库单例连接（只读）
 * @returns node:sqlite 数据库实例
 */
export function getDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH, { readOnly: true, timeout: 10000 });
    dbInstance.exec("PRAGMA foreign_keys = ON");
    dbInstance.exec("PRAGMA query_only = ON");
  }
  return dbInstance;
}

/**
 * 获取可写数据库连接（seed 脚本使用）
 * @returns 可写 SQLite 连接
 */
export function getWritableDb(): DatabaseSync {
  const db = new DatabaseSync(DB_PATH, { timeout: 10000 });
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

/**
 * 关闭数据库连接（测试清理用）
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * 检查数据库文件是否可用
 */
export function isDatabaseAvailable(): boolean {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}
