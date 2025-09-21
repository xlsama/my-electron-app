import { createApp } from "vue";
import App from "./App.vue";
import ui from "@nuxt/ui/vue-plugin";
import { createRouter, createWebHistory } from "vue-router";
import "./assets/main.css";
import DefaultLayout from "./layouts/default.vue";

const app = createApp(App);

const router = createRouter({
  routes: [
    {
      path: "/",
      component: DefaultLayout,
      children: [
        {
          path: "",
          component: () => import("./pages/home.vue"),
        },
        {
          path: "about",
          component: () => import("./pages/about.vue"),
        },
      ],
    },
  ],
  history: createWebHistory(),
});

app.use(router);
app.use(ui);

app.mount("#app");
