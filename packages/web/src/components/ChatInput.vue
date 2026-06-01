<script setup lang="ts">
defineProps<{
  modelValue: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  submit: [];
  "update:modelValue": [value: string];
}>();

/**
 * 处理发送
 */
function handleSubmit(): void {
  emit("submit");
}
</script>

<template>
  <div class="flex gap-2">
    <el-input
      :model-value="modelValue"
      placeholder="输入你的问题，例如：上个月哪条产线良率最低？"
      :disabled="loading"
      @update:model-value="emit('update:modelValue', $event)"
      @keyup.enter="handleSubmit"
    />
    <el-button type="primary" :loading="loading" @click="handleSubmit">
      发送
    </el-button>
  </div>
</template>
