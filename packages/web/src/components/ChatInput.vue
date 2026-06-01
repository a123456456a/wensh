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
  <div class="chat-input">
    <el-input
      :model-value="modelValue"
      placeholder="用自然语言提问，例如：上个月哪条产线良率最低？"
      :disabled="loading"
      size="large"
      class="chat-input__field"
      @update:model-value="emit('update:modelValue', $event)"
      @keyup.enter="handleSubmit"
    />
    <button
      type="button"
      class="chat-input__send"
      :disabled="loading || !modelValue.trim()"
      @click="handleSubmit"
    >
      <span v-if="loading" class="chat-input__spinner" />
      <span v-else>发送</span>
    </button>
  </div>
</template>

<style scoped>
.chat-input {
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.chat-input__field {
  flex: 1;
}

.chat-input__field :deep(.el-input__wrapper) {
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
  padding: 4px 16px;
}

.chat-input__send {
  flex-shrink: 0;
  min-width: 80px;
  padding: 0 20px;
  border: none;
  border-radius: var(--radius);
  background: var(--accent-primary);
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s;
}

.chat-input__send:hover:not(:disabled) {
  opacity: 0.92;
}

.chat-input__send:active:not(:disabled) {
  transform: scale(0.98);
}

.chat-input__send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-input__spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgb(255 255 255 / 30%);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
