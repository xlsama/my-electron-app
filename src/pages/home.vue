<script setup lang="ts">
import { useToast } from "@nuxt/ui/runtime/composables/useToast.js";
import { ref } from "vue";

const value = ref("");
const toast = useToast();
</script>

<template>
  <div class="space-y-4">
    <UInput placeholder="Type something..." v-model="value" />
    <p>You typed: {{ value }}</p>
    <UButton @click="toast.add({ title: value })">确认</UButton>
  </div>
</template>
