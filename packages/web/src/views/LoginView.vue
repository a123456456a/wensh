<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { fetchMe, login } from "../api/auth";
import { getHealth } from "../api/query";

const router = useRouter();
const route = useRoute();
const username = ref("demo");
const password = ref("demo123");
const loading = ref(false);
const authEnabled = ref(true);

/**
 * 登录成功后的跳转路径
 */
function resolveRedirectPath(): string {
  const redirect = route.query.redirect;
  if (typeof redirect === "string" && redirect.startsWith("/") && redirect !== "/login") {
    return redirect;
  }
  return "/";
}

/**
 * 提交登录表单
 */
async function handleLogin(): Promise<void> {
  loading.value = true;
  try {
    await login({
      username: username.value.trim(),
      password: password.value,
    });
    await router.replace(resolveRedirectPath());
  } catch {
    ElMessage.error("用户名或密码错误");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    const health = await getHealth();
    authEnabled.value = health.auth?.enabled ?? false;
  } catch {
    authEnabled.value = false;
  }

  if (!authEnabled.value) {
    ElMessage.warning("当前未启用登录，将直接进入问数页");
    await router.replace("/");
    return;
  }

  const me = await fetchMe();
  if (me?.user) {
    await router.replace(resolveRedirectPath());
  }
});
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-card__title">问数登录</h1>
      <p class="login-card__hint">演示账号：demo / demo123</p>

      <el-form label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="用户名">
          <el-input v-model="username" autocomplete="username" size="large" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="password"
            type="password"
            show-password
            autocomplete="current-password"
            size="large"
          />
        </el-form-item>
        <el-button
          type="primary"
          class="login-card__submit"
          :loading="loading"
          native-type="submit"
        >
          登录
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg);
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 32px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
}

.login-card__title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.login-card__hint {
  margin: 0 0 24px;
  font-size: 13px;
  color: var(--text-muted);
}

.login-card__submit {
  width: 100%;
  margin-top: 8px;
}
</style>
