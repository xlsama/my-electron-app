<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useToast } from "@nuxt/ui/runtime/composables/useToast.js";
import z from "zod";
import { stringify } from "yaml";
import type { ConfigExportResult } from "../types/config-exporter";
import { AnimatePresence, motion } from "motion-v";

interface NumericInspectionValid {
  status: "valid";
  value: number;
}

interface NumericInspectionInvalid {
  status: "invalid";
}

interface NumericInspectionEmpty {
  status: "empty";
}

type NumericInspection =
  | NumericInspectionValid
  | NumericInspectionInvalid
  | NumericInspectionEmpty;

const numericField = z.union([z.number(), z.string()]);
type NumericField = z.infer<typeof numericField>;

const inspectNumeric = (value: NumericField): NumericInspection => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { status: "invalid" };
    }

    return { status: "valid", value };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { status: "empty" };
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return { status: "invalid" };
  }

  return { status: "valid", value: numeric };
};

interface NumericFieldOptions {
  label: string;
  min?: number;
  max?: number;
  integer?: boolean;
  required: boolean;
}

const createNumericField = ({
  label,
  min,
  max,
  integer,
  required,
}: NumericFieldOptions) =>
  numericField.superRefine((value, ctx) => {
    const inspection = inspectNumeric(value);

    if (inspection.status === "empty") {
      if (required) {
        ctx.addIssue({
          code: "custom",
          message: `${label}不能为空`,
        });
      }
      return;
    }

    if (inspection.status === "invalid") {
      ctx.addIssue({
        code: "custom",
        message: `${label}需要为有效数字`,
      });
      return;
    }

    const numeric = inspection.value;

    if (min !== undefined && numeric < min) {
      ctx.addIssue({
        code: "custom",
        message: `${label}不能小于 ${min}`,
      });
    }

    if (max !== undefined && numeric > max) {
      ctx.addIssue({
        code: "custom",
        message: `${label}不能大于 ${max}`,
      });
    }

    if (integer && !Number.isInteger(numeric)) {
      ctx.addIssue({
        code: "custom",
        message: `${label}必须为整数`,
      });
    }
  });

const createRangeField = (label: string, required: boolean) =>
  z
    .object({
      start: createNumericField({ label: `${label}最小值`, min: 0, required }),
      end: createNumericField({ label: `${label}最大值`, min: 0, required }),
    })
    .superRefine((value, ctx) => {
      const startInspection = inspectNumeric(value.start);
      const endInspection = inspectNumeric(value.end);

      const hasStartInput = startInspection.status !== "empty";
      const hasEndInput = endInspection.status !== "empty";

      if (!required && !hasStartInput && !hasEndInput) {
        return;
      }

      if (hasStartInput !== hasEndInput) {
        ctx.addIssue({
          code: "custom",
          message: `${label}需要同时填写最小值与最大值`,
        });
        return;
      }

      if (
        startInspection.status !== "valid" ||
        endInspection.status !== "valid"
      ) {
        return;
      }

      if (startInspection.value > endInspection.value) {
        ctx.addIssue({
          code: "custom",
          message: `${label}最小值不能大于最大值`,
        });
      }
    });

const schema = z.object({
  log: z.object({
    disabled: z.boolean(),
    level: z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]),
    type: z.enum(["console", "file"]),
  }),
  lottery: z.object({
    conditions: z.object({
      countdownRange: createRangeField("全局倒计时范围（秒）", true),
      maxViewers: createNumericField({
        label: "最大观众数",
        min: 0,
        required: true,
      }),
      minProbability: createNumericField({
        label: "最低中奖概率 (%)",
        min: 0,
        max: 100,
        required: true,
      }),
    }),
    fanClub: z.boolean(),
    switchThreshold: createNumericField({
      label: "策略切换阈值",
      min: 0,
      required: false,
    }),
    postStay: createRangeField("停留时间范围（秒）", true),
  }),
  bitBrowser: z.object({
    groups: z.array(
      z.object({
        id: z.string().min(1, "分组 ID 不能为空"),
        threads: createNumericField({
          label: "线程数",
          min: 1,
          integer: true,
          required: true,
        }),
        inherit: z.boolean(),
        lottery: z.object({
          conditions: z.object({
            countdownRange: createRangeField("倒计时范围（秒）", false),
            maxViewers: createNumericField({
              label: "最大观众数",
              min: 0,
              required: false,
            }),
            minProbability: createNumericField({
              label: "最低中奖概率 (%)",
              min: 0,
              max: 100,
              required: false,
            }),
          }),
          fanClub: z.enum(["inherit", "true", "false"]),
          switchThreshold: createNumericField({
            label: "策略切换阈值",
            min: 0,
            required: false,
          }),
          postStay: createRangeField("停留时间范围（秒）", false),
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
  start: RangeField["start"] = "",
  end: RangeField["end"] = ""
): RangeField => ({
  start,
  end,
});

const createEmptyConditions = (): LotteryConditionsForm => ({
  countdownRange: makeRange(),
  maxViewers: "",
  minProbability: "",
});

const createEmptyGroup = (): GroupForm => ({
  id: "",
  threads: "",
  inherit: true,
  lottery: {
    conditions: createEmptyConditions(),
    fanClub: "inherit",
    switchThreshold: "",
    postStay: makeRange(),
  },
});

const toast = useToast();

const showPreview = ref(true);
const isExporting = ref(false);
const exportDefaultFileName = "lottery-config.yaml";

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
    switchThreshold: "",
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
          switchThreshold: "",
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

const toOptionalNumber = (value: NumericField): number | undefined => {
  const inspection = inspectNumeric(value);
  if (inspection.status !== "valid") {
    return undefined;
  }

  return inspection.value;
};

const toOptionalRange = (range: RangeField): [number, number] | undefined => {
  const start = toOptionalNumber(range.start);
  const end = toOptionalNumber(range.end);

  if (start === undefined && end === undefined) {
    return undefined;
  }

  if (start === undefined || end === undefined) {
    return undefined;
  }

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
      const payload: Record<string, unknown> = {
        id: group.id,
        threads: threads && threads > 0 ? Math.trunc(threads) : 1,
        inherit: group.inherit,
      };

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

const validationMessages = computed(() => {
  const result = schema.safeParse(state);
  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => {
    if (
      issue.path[0] === "bitBrowser" &&
      issue.path[1] === "groups" &&
      typeof issue.path[2] === "number"
    ) {
      const groupIndex = Number(issue.path[2]) + 1;
      return `分组 ${groupIndex}: ${issue.message}`;
    }

    return issue.message;
  });
});

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
  if (validationMessages.value.length > 0) {
    toast.add({
      title: "导出失败",
      description: "请先修复校验错误后再导出。",
      color: "error",
    });
    return;
  }

  if (isExporting.value) {
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

    if (result.canceled) {
      return;
    }

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
</script>

<template>
  <main class="flex flex-col gap-6 lg:flex-row lg:items-start">
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
            variant="ghost"
            color="neutral"
            :icon="
              showPreview ? 'i-lucide-sidebar-close' : 'i-lucide-sidebar-open'
            "
            @click="showPreview = !showPreview"
          />
        </UTooltip>
      </div>

      <UAlert
        v-if="validationMessages.length > 0"
        title="请先修正以下问题"
        color="error"
        variant="subtle"
      >
        <ul class="list-disc space-y-1 pl-5 text-sm">
          <li v-for="message in validationMessages" :key="message">
            {{ message }}
          </li>
        </ul>
      </UAlert>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-medium">日志配置</h2>
          </div>
        </template>

        <div class="grid gap-4 md:grid-cols-2">
          <UFormField label="是否禁用日志">
            <USwitch v-model="state.log.disabled" />
          </UFormField>

          <UFormField label="日志级别">
            <USelect v-model="state.log.level" :items="logLevelOptions" />
          </UFormField>

          <UFormField label="输出方式">
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
            <div>
              <h3 class="text-sm font-medium text-gray-700">基础过滤条件</h3>
              <p class="text-xs text-gray-500">YAML 节点：lottery.conditions</p>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="倒计时范围（秒）" class="md:col-span-2">
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

              <UFormField label="最大观众数">
                <UInput
                  v-model="state.lottery.conditions.maxViewers"
                  type="number"
                  placeholder="例如 5000"
                  min="0"
                />
              </UFormField>

              <UFormField label="最低中奖概率 (%)">
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
              <UFormField label="策略切换阈值 (次)">
                <UInput
                  v-model="state.lottery.switchThreshold"
                  type="number"
                  placeholder="留空表示不限次数"
                  min="0"
                />
              </UFormField>

              <UFormField label="粉丝团福袋参与">
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
              <UFormField label="抢袋后停留时间 (秒)" class="md:col-span-2">
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
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-document-duplicate"
                    @click="duplicateGroup(index)"
                  />
                </UTooltip>
                <UTooltip text="删除分组" placement="top">
                  <UButton
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
                <UFormField label="分组 ID">
                  <UInput v-model="group.id" placeholder="例如 4028808b..." />
                </UFormField>

                <UFormField label="线程数">
                  <UInput
                    v-model="group.threads"
                    type="number"
                    min="1"
                    placeholder="正整数"
                  />
                </UFormField>

                <UFormField label="继承全局抽奖配置">
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
                <UFormField label="倒计时范围（秒）" class="md:col-span-2">
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

                <UFormField label="最大观众数">
                  <UInput
                    v-model="group.lottery.conditions.maxViewers"
                    type="number"
                    placeholder="留空表示继承"
                    min="0"
                  />
                </UFormField>

                <UFormField label="最低中奖概率 (%)">
                  <UInput
                    v-model="group.lottery.conditions.minProbability"
                    type="number"
                    placeholder="留空表示继承"
                    min="0"
                    max="100"
                  />
                </UFormField>

                <UFormField label="策略切换阈值 (次)">
                  <UInput
                    v-model="group.lottery.switchThreshold"
                    type="number"
                    placeholder="留空表示继承"
                    min="0"
                  />
                </UFormField>

                <UFormField label="粉丝团福袋参与">
                  <USelect
                    v-model="group.lottery.fanClub"
                    :items="groupFanClubOptions"
                  />
                </UFormField>

                <UFormField label="抢袋后停留时间 (秒)" class="md:col-span-2">
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

        <UFormField label="Redis 连接地址">
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
                icon="i-heroicons-document-duplicate"
                :disabled="validationMessages.length > 0"
                @click="handleCopyYaml"
              >
                复制 YAML
              </UButton>
              <UButton
                icon="i-heroicons-arrow-down-tray"
                color="primary"
                :disabled="validationMessages.length > 0 || isExporting"
                :loading="isExporting"
                @click="handleExport"
              >
                导出文件
              </UButton>
            </div>
            <pre
              class="rounded border border-gray-200 bg-gray-900 p-4 text-sm text-gray-100"
              >{{ yamlPreview }}
          </pre
            >
          </div>
        </UCard>
      </motion.div>
    </AnimatePresence>
  </main>
</template>
