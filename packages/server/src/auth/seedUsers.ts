import { getUserStore } from "./userStore.js";

/**
 * 初始化默认演示账号 demo / demo123（仅当用户不存在时）
 */
export async function seedDefaultUsers(): Promise<void> {
  const store = getUserStore();
  if (store.hasUser("demo")) return;

  await store.createUser({
    username: "demo",
    password: "demo123",
    roles: ["mes_viewer", "mro_viewer"],
    data_scope: { factory_ids: ["F01"] },
  });
}
