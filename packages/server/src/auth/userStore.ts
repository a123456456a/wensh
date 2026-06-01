import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { AuthUser } from "@wensh/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 问数平台 auth.db 路径（与 mes.db 无关） */
export const AUTH_DB_PATH = path.resolve(__dirname, "../../data/auth.db");

let storeInstance: UserStore | null = null;

/** 问数平台用户存储（与 mes.db 业务数据无关） */
export class UserStore {
  private db: DatabaseSync;

  /**
   * @param dbPath - SQLite 文件路径；`:memory:` 用于测试
   */
  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
  }

  /** 创建用户与权限相关表 */
  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        external_id TEXT
      );
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (user_id, role)
      );
      CREATE TABLE IF NOT EXISTS user_data_scope (
        user_id TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        PRIMARY KEY (user_id, scope_type, scope_id)
      );
    `);
  }

  /**
   * 创建用户
   * @param input - 用户名、密码、角色与数据范围
   */
  async createUser(input: {
    username: string;
    password: string;
    roles: string[];
    data_scope: AuthUser["data_scope"];
  }): Promise<void> {
    const id = randomUUID();
    const hash = await bcrypt.hash(input.password, 10);
    this.db
      .prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
      .run(id, input.username, hash);
    for (const role of input.roles) {
      this.db
        .prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)")
        .run(id, role);
    }
    this.insertScope(id, input.data_scope);
  }

  private insertScope(userId: string, scope: AuthUser["data_scope"]): void {
    const entries: Array<[string, string]> = [];
    for (const fid of scope.factory_ids ?? []) entries.push(["factory", fid]);
    for (const wid of scope.workshop_ids ?? []) entries.push(["workshop", wid]);
    for (const lid of scope.line_ids ?? []) entries.push(["line", lid]);
    for (const [type, sid] of entries) {
      this.db
        .prepare(
          "INSERT INTO user_data_scope (user_id, scope_type, scope_id) VALUES (?, ?, ?)",
        )
        .run(userId, type, sid);
    }
  }

  /**
   * 校验用户名密码
   * @param username - 用户名
   * @param password - 明文密码
   */
  async verifyPassword(
    username: string,
    password: string,
  ): Promise<AuthUser | null> {
    const row = this.db
      .prepare(
        "SELECT id, username FROM users WHERE username = ? AND status = 'active'",
      )
      .get(username) as { id: string; username: string } | undefined;
    if (!row) return null;

    const cred = this.db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(row.id) as { password_hash: string };
    const ok = await bcrypt.compare(password, cred.password_hash);
    if (!ok) return null;

    return this.loadAuthUser(row.id);
  }

  /**
   * 按 user_id 加载完整 AuthUser
   * @param userId - 用户 ID
   */
  loadAuthUser(userId: string): AuthUser {
    const user = this.db
      .prepare("SELECT id, username FROM users WHERE id = ?")
      .get(userId) as { id: string; username: string };

    const roles = this.db
      .prepare("SELECT role FROM user_roles WHERE user_id = ?")
      .all(userId) as Array<{ role: string }>;

    const scopes = this.db
      .prepare(
        "SELECT scope_type, scope_id FROM user_data_scope WHERE user_id = ?",
      )
      .all(userId) as Array<{ scope_type: string; scope_id: string }>;

    const data_scope: AuthUser["data_scope"] = {};
    for (const s of scopes) {
      if (s.scope_type === "factory") {
        data_scope.factory_ids = [...(data_scope.factory_ids ?? []), s.scope_id];
      }
      if (s.scope_type === "workshop") {
        data_scope.workshop_ids = [
          ...(data_scope.workshop_ids ?? []),
          s.scope_id,
        ];
      }
      if (s.scope_type === "line") {
        data_scope.line_ids = [...(data_scope.line_ids ?? []), s.scope_id];
      }
    }

    return {
      user_id: user.id,
      username: user.username,
      roles: roles.map((r) => r.role),
      data_scope,
    };
  }

  /** 检查用户名是否已存在 */
  hasUser(username: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM users WHERE username = ?")
      .get(username);
    return row !== undefined;
  }
}

/**
 * 获取 UserStore 单例（文件 auth.db）
 */
export function getUserStore(): UserStore {
  if (!storeInstance) {
    storeInstance = new UserStore(AUTH_DB_PATH);
    storeInstance.migrate();
  }
  return storeInstance;
}

/** 测试用：重置单例 */
export function resetUserStoreForTests(): void {
  storeInstance = null;
}
