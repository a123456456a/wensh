import type { BusinessDomain } from "@wensh/shared";

/** 业务域下拉选项（展示标签） */
export const DOMAIN_OPTIONS: ReadonlyArray<{
  value: BusinessDomain;
  label: string;
}> = [
  { value: "demo", label: "本地演示" },
  { value: "mes", label: "制造执行" },
  { value: "mro", label: "设备维护" },
];

/** 各业务域示例问题（空状态与示例弹层使用） */
export const DOMAIN_SAMPLE_QUESTIONS: Record<BusinessDomain, string[]> = {
  demo: [
    "上个月哪条产线良率最低？",
    "今年A线的工单完成率按月统计",
    "统计各班次的平均OEE",
    "查询所有状态为running的工单数量",
    "近30天停机时间最长的产线是哪条？",
  ],
  mes: [
    "上个月哪条产线良率最低？",
    "各车间工单完成率对比",
    "近7天 OEE 趋势",
  ],
  mro: [
    "本月故障次数最多的设备 TOP5",
    "备件库存低于安全库存的清单",
    "维保计划完成率按车间统计",
  ],
};
