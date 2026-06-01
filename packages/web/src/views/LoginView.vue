<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { login } from "../api/auth";

const router = useRouter();
const username = ref("demo");
const password = ref("demo123");
const loading = ref(false);

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
    await router.replace("/");
  } catch {
    ElMessage.error("用户名或密码错误");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 class="mb-2 text-2xl font-semibold text-slate-900">问数登录</h1>
      <p class="mb-6 text-sm text-slate-500">自建账号登录（演示：demo / demo123）</p>

      <el-form label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="用户名">
          <el-input v-model="username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="password"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-button
          type="primary"
          class="w-full"
          :loading="loading"
          native-type="submit"
        >
          登录
        </el-button>
      </el-form>
    </div>
  </div>
</template>
