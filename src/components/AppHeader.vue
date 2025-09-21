<script setup lang="ts">
import { motion } from "motion-v";
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<template>
  <header
    class="h-12 bg-inverted text-inverted px-4 flex items-center shrink-0 gap-2"
  >
    <motion.button :while-press="{ scale: 0.95 }" @click="router.push('/')">
      <UIcon name="i-lucide:home" class="size-5" />
    </motion.button>

    <motion.button :while-press="{ scale: 0.95 }">
      <UButton class="text-white" variant="link" to="/about">About</UButton>
    </motion.button>
  </header>
</template>
