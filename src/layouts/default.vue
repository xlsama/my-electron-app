<script setup lang="ts">
import { motion } from "motion-v";
</script>

<template>
  <div class="h-dvh flex flex-col">
    <AppHeader />
    <section class="flex min-h-0 flex-1">
      <AppSidebar />
      <motion.div
        :key="$route.fullPath"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        class="min-w-0 flex-1 p-5 bg-muted overflow-y-auto"
      >
        <RouterView />
      </motion.div>
    </section>
  </div>
</template>
