import { createRouter, createWebHistory } from "vue-router";
import { fetchMe } from "../api/auth";
import { getHealth } from "../api/query";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/",
      name: "home",
      component: () => import("../views/HomeView.vue"),
    },
  ],
});

let authEnabledCache: boolean | null = null;

/**
 * 读取服务端是否启用登录
 */
async function isAuthRequired(): Promise<boolean> {
  if (authEnabledCache !== null) return authEnabledCache;
  try {
    const health = await getHealth();
    authEnabledCache = health.auth?.enabled ?? false;
  } catch {
    authEnabledCache = false;
  }
  return authEnabledCache;
}

router.beforeEach(async (to, _from, next) => {
  const required = await isAuthRequired();

  if (to.name === "login") {
    if (!required) {
      next({ name: "home" });
      return;
    }
    const me = await fetchMe();
    if (me?.user) {
      next({ name: "home" });
      return;
    }
    next();
    return;
  }

  if (to.meta.public) {
    next();
    return;
  }

  if (!required) {
    next();
    return;
  }

  const me = await fetchMe();
  if (!me?.user) {
    next({ name: "login", query: { redirect: to.fullPath } });
    return;
  }
  next();
});

export default router;
