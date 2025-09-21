import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    vue(),
    ui({
      colorMode: false,
    }),
    tailwindcss(),
  ],
});
