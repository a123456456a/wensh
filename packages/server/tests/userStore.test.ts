import { describe, expect, it, beforeAll } from "vitest";
import { UserStore } from "../src/auth/userStore.js";

describe("UserStore", () => {
  let store: UserStore;

  beforeAll(async () => {
    store = new UserStore(":memory:");
    store.migrate();
    await store.createUser({
      username: "demo",
      password: "demo123",
      roles: ["mes_viewer"],
      data_scope: { factory_ids: ["F01"] },
    });
  });

  it("verifyPassword succeeds for valid credentials", async () => {
    const user = await store.verifyPassword("demo", "demo123");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("demo");
    expect(user!.roles).toContain("mes_viewer");
  });

  it("verifyPassword fails for wrong password", async () => {
    const user = await store.verifyPassword("demo", "wrong");
    expect(user).toBeNull();
  });
});
