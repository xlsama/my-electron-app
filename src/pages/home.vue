<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useToast } from "@nuxt/ui/runtime/composables/useToast.js";
import { useTemplateRef } from "vue";
import z from "zod";
import { stringify } from "yaml";
import type { ConfigExportResult } from "../types/config-exporter";
import { AnimatePresence, motion } from "motion-v";
import { codeToHtml } from "shiki";

// ---------- Numeric Helpers (Plan A) ----------
// 语义：requiredNumber —— 必填；optionalNumber —— 可空（空字符串 => undefined）
//       requiredRange —— 两端必填；optionalRange —— 两端可同时空或同时填
const preprocessEmptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const optionalNumber = (
  cfg: { min?: number; max?: number; integer?: boolean; label?: string } = {}
) => {
  const { min, max, integer, label } = cfg;
  let base = integer ? z.coerce.number() : z.coerce.number();
  base = base.refine((v) => Number.isFinite(v), {
    message: `${label || "数值"}需为有效数字`,
  });
  if (min !== undefined) {
    base = base.refine((v) => v >= min, {
      message: `${label || "数值"}不能小于 ${min}`,
    });
  }
  if (max !== undefined) {
    base = base.refine((v) => v <= max, {
      message: `${label || "数值"}不能大于 ${max}`,
    });
  }
  if (integer) {
    base = base.refine((v) => Number.isInteger(v), {
      message: `${label || "数值"}必须为整数`,
    });
  }
  return z.preprocess(preprocessEmptyToUndefined, base.optional());
};

const requiredNumber = (
  label: string,
  cfg: { min?: number; max?: number; integer?: boolean } = {}
) => {
  const { min, max, integer } = cfg;
  let base = integer ? z.coerce.number() : z.coerce.number();
  base = base.refine((v) => v !== undefined && Number.isFinite(v), {
    message: `${label}不能为空`,
  });
  if (integer) {
    base = base.refine((v) => Number.isInteger(v), {
      message: `${label}必须为整数`,
    });
  }
  if (min !== undefined) {
    base = base.refine((v) => v >= min, { message: `${label}不能小于 ${min}` });
  }
  if (max !== undefined) {
    base = base.refine((v) => v <= max, { message: `${label}不能大于 ${max}` });
  }
  return z.preprocess(preprocessEmptyToUndefined, base);
};

const requiredRange = (label: string, cfg: { min?: number } = {}) => {
  const { min = 0 } = cfg;
  return z
    .object({
      start: requiredNumber(`${label}最小值`, { min }),
      end: requiredNumber(`${label}最大值`, { min }),
    })
    .refine((v) => v.start <= v.end, {
      message: `${label}最小值不能大于最大值`,
    });
};

const optionalRange = (label: string, cfg: { min?: number } = {}) => {
  const { min = 0 } = cfg;
  return z
    .object({
      start: optionalNumber({ min, label: `${label}最小值` }),
      end: optionalNumber({ min, label: `${label}最大值` }),
    })
    .superRefine((v, ctx) => {
      if (v.start === undefined && v.end === undefined) return; // both empty OK
      if (v.start === undefined || v.end === undefined) {
        ctx.addIssue({
          code: "custom",
          message: `${label}需要同时填写最小值与最大值`,
        });
        return;
      }
      if (v.start > v.end) {
        ctx.addIssue({
          code: "custom",
          message: `${label}最小值不能大于最大值`,
        });
      }
    });
};

const schema = z.object({
  log: z.object({
    disabled: z.boolean(),
    level: z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]),
    type: z.enum(["console", "file"]),
  }),
  lottery: z.object({
    conditions: z.object({
      countdownRange: requiredRange("全局倒计时范围（秒）", { min: 0 }),
      maxViewers: requiredNumber("最大观众数", { min: 0, integer: true }),
      minProbability: requiredNumber("最低中奖概率 (%)", {
        min: 0,
        max: 100,
        integer: true,
      }),
    }),
    fanClub: z.boolean(),
    switchThreshold: optionalNumber({
      min: 0,
      label: "策略切换阈值",
      integer: true,
    }),
    postStay: requiredRange("停留时间范围（秒）", { min: 0 }),
  }),
  bitBrowser: z.object({
    groups: z.array(
      z.object({
        id: z.string().min(1, "分组 ID 不能为空"),
        threads: requiredNumber("线程数", { min: 1, integer: true }),
        inherit: z.boolean(),
        lottery: z.object({
          conditions: z.object({
            countdownRange: optionalRange("倒计时范围（秒）", { min: 0 }),
            maxViewers: optionalNumber({
              min: 0,
              label: "最大观众数",
              integer: true,
            }),
            minProbability: optionalNumber({
              min: 0,
              max: 100,
              label: "最低中奖概率 (%)",
              integer: true,
            }),
          }),
          fanClub: z.enum(["inherit", "true", "false"]),
          switchThreshold: optionalNumber({
            min: 0,
            label: "策略切换阈值",
            integer: true,
          }),
          postStay: optionalRange("停留时间范围（秒）", { min: 0 }),
        }),
      })
    ),
  }),
  redis: z.object({
    url: z
      .string()
      .min(1, "Redis 连接地址不能为空")
      .regex(/^redis:\/\//, "Redis 地址需以 redis:// 开头"),
  }),
});

type PageSchema = z.infer<typeof schema>;
type LotteryForm = PageSchema["lottery"];
type LotteryConditionsForm = LotteryForm["conditions"];
type RangeField = LotteryForm["postStay"];
type GroupForm = PageSchema["bitBrowser"]["groups"][number];
type GroupLotteryForm = GroupForm["lottery"];
type FanClubSelect = GroupLotteryForm["fanClub"];

const makeRange = (
  start: any = undefined,
  end: any = undefined
): RangeField => ({ start, end });

const createEmptyConditions = (): LotteryConditionsForm => ({
  countdownRange: makeRange(),
  maxViewers: undefined as any,
  minProbability: undefined as any,
});

const createEmptyGroup = (): GroupForm => ({
  id: "",
  threads: 1,
  inherit: true,
  lottery: {
    conditions: createEmptyConditions(),
    fanClub: "inherit",
    switchThreshold: undefined as any,
    postStay: makeRange(),
  },
});

const toast = useToast();

const showPreview = ref(true);
const isExporting = ref(false);
const exportDefaultFileName = "lottery-config.yaml";
const isRunningCommand = ref(false);
const lastCommandResult = ref<null | {
  code: number | null;
  signal?: string | null;
  stdout: string;
  stderr: string;
  error?: string;
}>(null);

const logLevelOptions = [
  { label: "DEBUG", value: "DEBUG" },
  { label: "INFO", value: "INFO" },
  { label: "WARNING", value: "WARNING" },
  { label: "ERROR", value: "ERROR" },
];

const logTypeOptions = [
  { label: "console", value: "console" },
  { label: "file", value: "file" },
];

const groupFanClubOptions = [
  { label: "继承全局设置", value: "inherit" },
  { label: "仅此分组参与粉丝团福袋", value: "true" },
  { label: "仅此分组排除粉丝团福袋", value: "false" },
];

const state = reactive<PageSchema>({
  log: {
    disabled: false,
    level: "INFO",
    type: "console",
  },
  lottery: {
    conditions: {
      countdownRange: makeRange(30, 180),
      maxViewers: 5000,
      minProbability: 80,
    },
    fanClub: false,
    switchThreshold: undefined,
    postStay: makeRange(5, 10),
  },
  bitBrowser: {
    groups: [
      {
        id: "4028808b99196613019922a4e27064c2",
        threads: 2,
        inherit: true,
        lottery: {
          conditions: createEmptyConditions(),
          fanClub: "inherit",
          switchThreshold: undefined,
          postStay: makeRange(),
        },
      },
      {
        id: "b123...",
        threads: 2,
        inherit: true,
        lottery: {
          conditions: createEmptyConditions(),
          fanClub: "inherit",
          switchThreshold: 800,
          postStay: makeRange(),
        },
      },
    ],
  },
  redis: {
    url: "redis://127.0.0.1:6379/0",
  },
});

const toOptionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const toOptionalRange = (range: any): [number, number] | undefined => {
  const start = toOptionalNumber(range?.start);
  const end = toOptionalNumber(range?.end);
  if (start === undefined && end === undefined) return undefined;
  if (start === undefined || end === undefined) return undefined;
  return [start, end];
};

const buildGlobalLottery = () => {
  const conditions: Record<string, unknown> = {};
  const countdownRange = toOptionalRange(
    state.lottery.conditions.countdownRange
  );
  if (countdownRange) {
    conditions.countdown_range = countdownRange;
  }

  const maxViewers = toOptionalNumber(state.lottery.conditions.maxViewers);
  if (maxViewers !== undefined) {
    conditions.max_viewers = maxViewers;
  }

  const minProbability = toOptionalNumber(
    state.lottery.conditions.minProbability
  );
  if (minProbability !== undefined) {
    conditions.min_probability = minProbability;
  }

  const postStay = toOptionalRange(state.lottery.postStay);

  const lottery: Record<string, unknown> = {};
  if (Object.keys(conditions).length > 0) {
    lottery.conditions = conditions;
  }

  lottery.fan_club = state.lottery.fanClub;

  const switchThreshold = toOptionalNumber(state.lottery.switchThreshold);
  if (switchThreshold !== undefined) {
    lottery.switch_threshold = switchThreshold;
  }

  if (postStay) {
    lottery.post_stay = postStay;
  }

  return lottery;
};

const buildGroupLottery = (
  lottery: GroupLotteryForm
): Record<string, unknown> | undefined => {
  const overrides: Record<string, unknown> = {};
  const conditions: Record<string, unknown> = {};

  const countdownRange = toOptionalRange(lottery.conditions.countdownRange);
  if (countdownRange) {
    conditions.countdown_range = countdownRange;
  }

  const maxViewers = toOptionalNumber(lottery.conditions.maxViewers);
  if (maxViewers !== undefined) {
    conditions.max_viewers = maxViewers;
  }

  const minProbability = toOptionalNumber(lottery.conditions.minProbability);
  if (minProbability !== undefined) {
    conditions.min_probability = minProbability;
  }

  if (Object.keys(conditions).length > 0) {
    overrides.conditions = conditions;
  }

  if (lottery.fanClub !== "inherit") {
    overrides.fan_club = lottery.fanClub === "true";
  }

  const switchThreshold = toOptionalNumber(lottery.switchThreshold);
  if (switchThreshold !== undefined) {
    overrides.switch_threshold = switchThreshold;
  }

  const postStay = toOptionalRange(lottery.postStay);
  if (postStay) {
    overrides.post_stay = postStay;
  }

  if (Object.keys(overrides).length === 0) {
    return undefined;
  }

  return overrides;
};

const sanitizedConfig = computed(() => {
  const config: Record<string, unknown> = {};

  config.log = {
    disabled: state.log.disabled,
    level: state.log.level,
    type: state.log.type,
  };

  config.lottery = buildGlobalLottery();

  if (state.bitBrowser.groups.length > 0) {
    const groups = state.bitBrowser.groups.map((group) => {
      const threads = toOptionalNumber(group.threads);
      // 线程数最小值在 schema 中已强约束 (min=1)，这里不再做兜底回退逻辑，避免二次判断。
      // 如果用户当前输入无效，表单校验会阻止导出；预览阶段仅在有效时写入。
      const payload: Record<string, unknown> = {
        id: group.id,
        inherit: group.inherit,
      };
      if (threads !== undefined) {
        payload.threads = Math.trunc(threads);
      }

      const lotteryOverrides = buildGroupLottery(group.lottery);
      if (lotteryOverrides) {
        payload.lottery = lotteryOverrides;
      }

      return payload;
    });

    config.bit_browser = { groups };
  }

  config.redis = { url: state.redis.url };

  return config;
});

const yamlPreview = computed(() =>
  stringify(sanitizedConfig.value, { indent: 2 })
);

// Plan B: rely purely on UForm's internal validation instead of manual schema.safeParse
// Form exposes an errors ref we can consume for UI state.
interface FormErrorLike {
  name?: string;
  message: string;
  id?: string;
}

// hasErrors / previewErrors now derive from the UForm instance
const normalizeErrors = (): FormErrorLike[] => {
  const raw: any = form.value?.errors;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as FormErrorLike[];
  if (Array.isArray(raw.value)) return raw.value as FormErrorLike[];
  return [];
};
const hasErrors = computed(() => normalizeErrors().length > 0);
const previewErrors = computed(() =>
  normalizeErrors()
    .map((e) => e.message)
    .slice(0, 5)
);

// Form instance ref (if we later want to call form?.validate())
// Strongly typed form instance ref using useTemplateRef
// UForm exposes a validate method; we can type minimally for future usage
interface UFormExpose {
  validate: (opts?: any) => Promise<any> | any;
  state: any;
  errors?: FormErrorLike[] | { value: FormErrorLike[] };
}
const form = useTemplateRef<UFormExpose>("form");

// Removed legacy validationMessages manual aggregation; UForm distributes errors automatically via name paths.

const handleCopyYaml = async () => {
  try {
    await navigator.clipboard.writeText(yamlPreview.value);
    toast.add({ title: "已复制 YAML 配置" });
  } catch (error) {
    toast.add({
      title: "复制失败",
      description: String(error),
      color: "error",
    });
  }
};

const handleExport = async () => {
  if (isExporting.value) return;

  // Trigger validation through UForm. If validation throws (non-silent), catch and abort.
  try {
    await form.value?.validate?.({});
  } catch {
    // Errors already populated/displayed by UForm
  }

  const errorsArr = (form.value?.errors as any)?.value || form.value?.errors;
  if (errorsArr && errorsArr.length) {
    toast.add({
      title: "导出失败",
      description: "请先修复校验错误后再导出。",
      color: "error",
    });
    return;
  }

  if (!window.configExporter) {
    toast.add({
      title: "导出失败",
      description: "当前环境不支持文件导出。",
      color: "error",
    });
    return;
  }

  isExporting.value = true;
  try {
    const result: ConfigExportResult = await window.configExporter.exportYaml({
      content: yamlPreview.value,
      defaultPath: exportDefaultFileName,
    });

    if (result.error) {
      toast.add({
        title: "导出失败",
        description: result.error,
        color: "error",
      });
      return;
    }
    if (result.canceled) return;

    toast.add({
      title: "导出成功",
      description: result.filePath,
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "导出失败",
      description: String(error),
      color: "error",
    });
  } finally {
    isExporting.value = false;
  }
};

const handleRunCommand = async () => {
  if (isRunningCommand.value) return;
  try {
    // 先执行一次表单校验，避免在无效配置下运行。
    try {
      await form.value?.validate?.({});
    } catch {}
    const errorsArr = (form.value?.errors as any)?.value || form.value?.errors;
    if (errorsArr && errorsArr.length) {
      toast.add({
        title: "无法执行命令",
        description: "请先修复校验错误。",
        color: "error",
      });
      return;
    }
    if (!window.commandRunner) {
      toast.add({
        title: "运行失败",
        description: "当前环境不支持命令执行。",
        color: "error",
      });
      return;
    }
    isRunningCommand.value = true;
    lastCommandResult.value = null;
    // 固定执行 date 命令
    const cmd = "date";
    const result = await window.commandRunner.run({
      command: cmd,
      args: [],
      timeoutMs: 5000,
    });
    lastCommandResult.value = result;
    if (result.error) {
      toast.add({
        title: "命令执行失败",
        description: result.error,
        color: "error",
      });
    } else {
      const shortOut =
        (result.stdout || result.stderr || "(无输出)")
          .split(/\n/)
          .filter(Boolean)[0]
          ?.slice(0, 120) || "(无输出)";
      toast.add({
        title: "命令执行完成",
        description: `${cmd} => ${shortOut}`,
        color: "success",
      });
    }
  } catch (error) {
    toast.add({
      title: "运行失败",
      description: String(error),
      color: "error",
    });
  } finally {
    isRunningCommand.value = false;
  }
};

const addGroup = () => {
  state.bitBrowser.groups.push(createEmptyGroup());
};

const removeGroup = (index: number) => {
  state.bitBrowser.groups.splice(index, 1);
};

const cloneGroup = (group: GroupForm): GroupForm => ({
  id: "",
  threads: group.threads,
  inherit: group.inherit,
  lottery: {
    conditions: {
      countdownRange: makeRange(
        group.lottery.conditions.countdownRange.start,
        group.lottery.conditions.countdownRange.end
      ),
      maxViewers: group.lottery.conditions.maxViewers,
      minProbability: group.lottery.conditions.minProbability,
    },
    fanClub: group.lottery.fanClub,
    switchThreshold: group.lottery.switchThreshold,
    postStay: makeRange(
      group.lottery.postStay.start,
      group.lottery.postStay.end
    ),
  },
});

const duplicateGroup = (index: number) => {
  const original = state.bitBrowser.groups[index];
  state.bitBrowser.groups.splice(index + 1, 0, cloneGroup(original));
};

// YAML 语法高亮逻辑（Shiki）
// 使用递增序列号代替 onCleanup + flag，确保仅最后一次异步结果生效。
const highlightedYamlHtml = ref("");
let highlightRequestSeq = 0; // 单调递增的高亮请求序号

const SHIKI_YAML_OPTIONS = Object.freeze({
  lang: "yaml",
  theme: "catppuccin-latte",
});

watch(
  yamlPreview,
  async (code) => {
    const seq = ++highlightRequestSeq;
    try {
      // 立即给出一个轻量的占位（可选）——如果不需要占位可移除下面一行。
      // highlightedYamlHtml.value = '<pre class="opacity-50">渲染中...</pre>';
      const out = await codeToHtml(code, SHIKI_YAML_OPTIONS as any);
      if (seq === highlightRequestSeq) {
        highlightedYamlHtml.value = out;
      }
    } catch (e) {
      if (seq === highlightRequestSeq) {
        highlightedYamlHtml.value = `<pre class="text-red-500">高亮失败：${String(e)}</pre>`;
      }
    }
  },
  { immediate: true }
);
</script>

<template>
  <!-- Wrap entire configurable area in UForm to leverage Nuxt UI schema validation -->
  <UForm
    ref="form"
    :state="state"
    :schema="schema"
    class="flex flex-col gap-6 lg:flex-row lg:items-start"
  >
    <div class="flex flex-1 flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-1">
          <h1 class="text-2xl font-semibold">抽奖配置面板</h1>
          <p class="text-sm text-gray-500">
            按照模块填写参数，生成 YAML 配置文件。
          </p>
        </div>
        <UTooltip
          :text="showPreview ? '隐藏 YAML 预览' : '展开 YAML 预览'"
          placement="bottom"
        >
          <UButton
            type="button"
            variant="ghost"
            color="neutral"
            :icon="
              showPreview ? 'i-lucide-sidebar-close' : 'i-lucide-sidebar-open'
            "
            @click="showPreview = !showPreview"
          />
        </UTooltip>
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-medium">日志配置</h2>
          </div>
        </template>

        <div class="grid gap-4 md:grid-cols-2">
          <UFormField label="是否禁用日志" name="log.disabled">
            <USwitch v-model="state.log.disabled" />
          </UFormField>

          <UFormField label="日志级别" name="log.level">
            <USelect v-model="state.log.level" :items="logLevelOptions" />
          </UFormField>

          <UFormField label="输出方式" name="log.type">
            <USelect v-model="state.log.type" :items="logTypeOptions" />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-medium">全局抽奖配置</h2>
          </div>
        </template>

        <div class="space-y-6">
          <section class="space-y-3">
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField
                label="倒计时范围（秒）"
                class="md:col-span-2"
                name="lottery.conditions.countdownRange"
                :error-pattern="
                  /(lottery\.conditions\.countdownRange)\.(start|end)/
                "
              >
                <div class="flex items-center gap-2">
                  <UInput
                    v-model="state.lottery.conditions.countdownRange.start"
                    type="number"
                    placeholder="最小秒数"
                    min="0"
                    aria-label="倒计时最小值"
                  />
                  <span class="text-sm text-gray-400">至</span>
                  <UInput
                    v-model="state.lottery.conditions.countdownRange.end"
                    type="number"
                    placeholder="最大秒数"
                    min="0"
                    aria-label="倒计时最大值"
                  />
                </div>
              </UFormField>

              <UFormField
                label="最大观众数"
                name="lottery.conditions.maxViewers"
              >
                <UInput
                  v-model="state.lottery.conditions.maxViewers"
                  type="number"
                  placeholder="例如 5000"
                  min="0"
                />
              </UFormField>

              <UFormField
                label="最低中奖概率 (%)"
                name="lottery.conditions.minProbability"
              >
                <UInput
                  v-model="state.lottery.conditions.minProbability"
                  type="number"
                  placeholder="0 - 100"
                  min="0"
                  max="100"
                />
              </UFormField>
            </div>
          </section>

          <section class="space-y-3">
            <div>
              <h3 class="text-sm font-medium text-gray-700">策略控制</h3>
              <p class="text-xs text-gray-500">
                YAML 节点：lottery.switch_threshold, lottery.fan_club
              </p>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <UFormField
                label="策略切换阈值 (次)"
                name="lottery.switchThreshold"
              >
                <UInput
                  v-model="state.lottery.switchThreshold"
                  type="number"
                  placeholder="留空表示不限次数"
                  min="0"
                />
              </UFormField>

              <UFormField label="粉丝团福袋参与" name="lottery.fanClub">
                <USwitch v-model="state.lottery.fanClub" />
              </UFormField>
            </div>
          </section>

          <section class="space-y-3">
            <div>
              <h3 class="text-sm font-medium text-gray-700">停留策略</h3>
              <p class="text-xs text-gray-500">YAML 节点：lottery.post_stay</p>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <UFormField
                label="抢袋后停留时间 (秒)"
                class="md:col-span-2"
                name="lottery.postStay"
                :error-pattern="/(lottery\.postStay)\.(start|end)/"
              >
                <div class="flex items-center gap-2">
                  <UInput
                    v-model="state.lottery.postStay.start"
                    type="number"
                    placeholder="最短停留"
                    min="0"
                    aria-label="停留时间最短"
                  />
                  <span class="text-sm text-gray-400">至</span>
                  <UInput
                    v-model="state.lottery.postStay.end"
                    type="number"
                    placeholder="最长停留"
                    min="0"
                    aria-label="停留时间最长"
                  />
                </div>
              </UFormField>
            </div>
          </section>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-medium">分组配置</h2>
          </div>
        </template>

        <div class="space-y-4">
          <div
            v-if="state.bitBrowser.groups.length === 0"
            class="text-sm text-gray-500"
          >
            暂无分组，请点击下方按钮新增。
          </div>

          <div
            v-for="(group, index) in state.bitBrowser.groups"
            :key="`${group.id || 'new'}-${index}`"
            class="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="flex flex-col">
                <span class="text-sm font-medium">分组 {{ index + 1 }}</span>
                <span class="text-xs text-gray-500">唯一 ID 与并发线程</span>
              </div>
              <div class="flex gap-2">
                <UTooltip text="复制分组" placement="top">
                  <UButton
                    type="button"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-document-duplicate"
                    @click="duplicateGroup(index)"
                  />
                </UTooltip>
                <UTooltip text="删除分组" placement="top">
                  <UButton
                    type="button"
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-heroicons-trash"
                    @click="removeGroup(index)"
                  />
                </UTooltip>
              </div>
            </div>

            <section class="space-y-3">
              <div>
                <h3 class="text-sm font-medium text-gray-700">基础信息</h3>
                <p class="text-xs text-gray-500">
                  YAML 节点：bit_browser.groups[].(id | threads | inherit)
                </p>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                <UFormField
                  :label="'分组 ID'"
                  :name="`bitBrowser.groups.${index}.id`"
                >
                  <UInput v-model="group.id" placeholder="例如 4028808b..." />
                </UFormField>

                <UFormField
                  label="线程数"
                  :name="`bitBrowser.groups.${index}.threads`"
                >
                  <UInput
                    v-model="group.threads"
                    type="number"
                    min="1"
                    placeholder="正整数"
                  />
                </UFormField>

                <UFormField
                  label="继承全局抽奖配置"
                  :name="`bitBrowser.groups.${index}.inherit`"
                >
                  <USwitch v-model="group.inherit" />
                </UFormField>
              </div>
            </section>

            <section class="space-y-3">
              <UDivider label="分组抽奖配置覆盖（可选）" />

              <div>
                <h3 class="text-sm font-medium text-gray-700">抽奖字段覆盖</h3>
                <p class="text-xs text-gray-500">
                  仅填写需要覆盖的字段，留空表示沿用全局 lottery 设置。
                </p>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                <UFormField
                  label="倒计时范围（秒）"
                  class="md:col-span-2"
                  :name="`bitBrowser.groups.${index}.lottery.conditions.countdownRange`"
                  :error-pattern="
                    new RegExp(
                      `(bitBrowser\\.groups\\.${index}\\.lottery\\.conditions\\.countdownRange)\\.(start|end)`
                    )
                  "
                >
                  <div class="flex items-center gap-2">
                    <UInput
                      v-model="group.lottery.conditions.countdownRange.start"
                      type="number"
                      placeholder="最小秒数"
                      min="0"
                      aria-label="分组倒计时最小值"
                    />
                    <span class="text-sm text-gray-400">至</span>
                    <UInput
                      v-model="group.lottery.conditions.countdownRange.end"
                      type="number"
                      placeholder="最大秒数"
                      min="0"
                      aria-label="分组倒计时最大值"
                    />
                  </div>
                </UFormField>

                <UFormField
                  label="最大观众数"
                  :name="`bitBrowser.groups.${index}.lottery.conditions.maxViewers`"
                >
                  <UInput
                    v-model="group.lottery.conditions.maxViewers"
                    type="number"
                    placeholder="留空表示继承"
                    min="0"
                  />
                </UFormField>

                <UFormField
                  label="最低中奖概率 (%)"
                  :name="`bitBrowser.groups.${index}.lottery.conditions.minProbability`"
                >
                  <UInput
                    v-model="group.lottery.conditions.minProbability"
                    type="number"
                    placeholder="留空表示继承"
                    min="0"
                    max="100"
                  />
                </UFormField>

                <UFormField
                  label="策略切换阈值 (次)"
                  :name="`bitBrowser.groups.${index}.lottery.switchThreshold`"
                >
                  <UInput
                    v-model="group.lottery.switchThreshold"
                    type="number"
                    placeholder="留空表示继承"
                    min="0"
                  />
                </UFormField>

                <UFormField
                  label="粉丝团福袋参与"
                  :name="`bitBrowser.groups.${index}.lottery.fanClub`"
                >
                  <USelect
                    v-model="group.lottery.fanClub"
                    :items="groupFanClubOptions"
                  />
                </UFormField>

                <UFormField
                  label="抢袋后停留时间 (秒)"
                  class="md:col-span-2"
                  :name="`bitBrowser.groups.${index}.lottery.postStay`"
                  :error-pattern="
                    new RegExp(
                      `(bitBrowser\\.groups\\.${index}\\.lottery\\.postStay)\\.(start|end)`
                    )
                  "
                >
                  <div class="flex items-center gap-2">
                    <UInput
                      v-model="group.lottery.postStay.start"
                      type="number"
                      placeholder="最短停留"
                      min="0"
                      aria-label="分组停留时间最短"
                    />
                    <span class="text-sm text-gray-400">至</span>
                    <UInput
                      v-model="group.lottery.postStay.end"
                      type="number"
                      placeholder="最长停留"
                      min="0"
                      aria-label="分组停留时间最长"
                    />
                  </div>
                </UFormField>
              </div>
            </section>
          </div>

          <div class="flex justify-end">
            <UButton
              type="button"
              icon="i-heroicons-plus-circle"
              variant="ghost"
              @click="addGroup"
              >新增分组</UButton
            >
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-medium">Redis 配置</h2>
          </div>
        </template>

        <UFormField label="Redis 连接地址" name="redis.url">
          <UInput
            v-model="state.redis.url"
            placeholder="redis://127.0.0.1:6379/0"
          />
        </UFormField>
      </UCard>
    </div>

    <AnimatePresence :initial="false">
      <motion.div
        v-if="showPreview"
        class="flex flex-col gap-3 flex-1 sticky top-0"
        :initial="{ opacity: 0, x: 50 }"
        :animate="{ opacity: 1, x: 0 }"
      >
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-base font-medium">YAML 预览</h2>
            </div>
          </template>

          <div class="space-y-3">
            <div class="flex gap-3">
              <UButton
                type="button"
                icon="i-heroicons-document-duplicate"
                :disabled="hasErrors"
                @click="handleCopyYaml"
              >
                复制 YAML
              </UButton>
              <UButton
                type="button"
                icon="i-heroicons-arrow-down-tray"
                color="primary"
                :disabled="hasErrors || isExporting"
                :loading="isExporting"
                @click="handleExport"
              >
                导出文件
              </UButton>
              <UButton
                type="button"
                icon="i-lucide-terminal"
                color="neutral"
                :disabled="hasErrors || isRunningCommand"
                :loading="isRunningCommand"
                @click="handleRunCommand"
              >
                运行命令
              </UButton>
            </div>
            <UAlert
              v-if="hasErrors"
              color="error"
              icon="i-lucide-alert-triangle"
              title="存在未通过校验的字段"
              :description="previewErrors.join('\n')"
              class="whitespace-pre-line"
            />
            <div
              v-if="lastCommandResult"
              class="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 space-y-1"
            >
              <div class="font-medium">最近一次命令输出</div>
              <div>
                exit: {{ lastCommandResult.code }}
                {{
                  lastCommandResult.signal
                    ? "(" + lastCommandResult.signal + ")"
                    : ""
                }}
              </div>
              <div v-if="lastCommandResult.error" class="text-red-600">
                error: {{ lastCommandResult.error }}
              </div>
              <pre
                v-if="lastCommandResult.stdout"
                class="overflow-x-auto whitespace-pre-wrap"
                >{{ lastCommandResult.stdout }}</pre
              >
              <pre
                v-else-if="lastCommandResult.stderr"
                class="overflow-x-auto whitespace-pre-wrap"
                >{{ lastCommandResult.stderr }}</pre
              >
              <div v-else class="italic text-gray-400">(无输出)</div>
            </div>
            <!-- Highlighted YAML (Shiki) -->
            <div
              v-html="highlightedYamlHtml"
              class="rounded border border-default text-sm overflow-x-auto"
            />
          </div>
        </UCard>
      </motion.div>
    </AnimatePresence>
  </UForm>
</template>

<style scoped>
/* 仅作用于高亮预览容器内的 Shiki 代码块（不依赖字符串替换，避免未来结构变化失效） */
.border.border-default :deep(pre.shiki) {
  padding: 1rem; /* 与 Tailwind p-4 等价 */
  margin: 0;
  background: transparent; /* 保持外层卡片背景一致 */
}
/* 若主题里已有内边距，可通过下面的选择器覆盖去重（示例演示，可按需删除） */
.border.border-default :deep(pre.shiki code) {
  line-height: 1.5;
  font-size: 0.875rem; /* text-sm */
}
</style>
