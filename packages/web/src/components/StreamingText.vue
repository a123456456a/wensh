<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    /** 流式累积的目标全文 */
    text: string;
    /** 是否仍在接收流（显示光标） */
    active?: boolean;
    /** 打字机揭示速度（字符/秒） */
    charsPerSecond?: number;
  }>(),
  {
    active: false,
    charsPerSecond: 52,
  },
);

const displayed = ref("");

let rafId: number | null = null;
let lastTimestamp = 0;
/** 已揭示到的目标文本长度 */
let revealedLength = 0;

/**
 * 取消进行中的动画帧
 */
function cancelTick(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/**
 * 按 charsPerSecond 逐字追平 props.text
 * @param timestamp - rAF 时间戳
 */
function tick(timestamp: number): void {
  const target = props.text;
  if (revealedLength >= target.length) {
    displayed.value = target;
    cancelTick();
    return;
  }

  if (lastTimestamp === 0) {
    lastTimestamp = timestamp;
  }

  const elapsed = timestamp - lastTimestamp;
  const step = Math.max(1, Math.floor((elapsed / 1000) * props.charsPerSecond));
  lastTimestamp = timestamp;

  revealedLength = Math.min(target.length, revealedLength + step);
  displayed.value = target.slice(0, revealedLength);

  if (revealedLength < target.length) {
    rafId = requestAnimationFrame(tick);
  } else {
    cancelTick();
  }
}

/**
 * 启动或恢复打字机动画
 */
function startTyping(): void {
  if (rafId !== null) {
    return;
  }
  lastTimestamp = 0;
  rafId = requestAnimationFrame(tick);
}

watch(
  () => props.text,
  (target) => {
    if (target.length < revealedLength) {
      revealedLength = target.length;
      displayed.value = target;
      cancelTick();
      return;
    }
    if (target.length > revealedLength) {
      startTyping();
    }
  },
  { immediate: true },
);

watch(
  () => props.active,
  (active) => {
    if (!active && props.text.length > revealedLength) {
      startTyping();
    }
  },
);

/** 是否显示闪烁光标 */
const showCursor = computed(
  () => props.active || displayed.value.length < props.text.length,
);

onUnmounted(() => {
  cancelTick();
});
</script>

<template>
  <span class="streaming-text">
    {{ displayed }}<span v-if="showCursor" class="streaming-text__cursor">|</span>
  </span>
</template>

<style scoped>
.streaming-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.streaming-text__cursor {
  display: inline-block;
  animation: blink 1s step-end infinite;
  color: var(--accent-primary);
  font-weight: 300;
  margin-left: 1px;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
