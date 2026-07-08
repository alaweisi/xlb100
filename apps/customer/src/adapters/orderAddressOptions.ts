import type { CityCode, ScheduledTimeSlot } from "@xlb/types";

export interface OrderAddressCityOption {
  cityCode: CityCode;
  province: string;
  city: string;
  districts: string[];
}

export const orderAddressOptionsByCity: Record<string, OrderAddressCityOption> = {
  hangzhou: {
    cityCode: "hangzhou",
    province: "浙江省",
    city: "杭州市",
    districts: ["西湖区", "上城区", "拱墅区", "滨江区"],
  },
  shanghai: {
    cityCode: "shanghai",
    province: "上海市",
    city: "上海市",
    districts: ["黄浦区", "静安区", "徐汇区", "浦东新区"],
  },
  beijing: {
    cityCode: "beijing",
    province: "北京市",
    city: "北京市",
    districts: ["朝阳区", "海淀区", "东城区", "西城区"],
  },
};

export const serviceTimeSlots: Array<{
  slot: ScheduledTimeSlot;
  label: string;
  timeRange: string;
  startHour: number;
}> = [
  { slot: "morning", label: "上午", timeRange: "09:00-12:00", startHour: 9 },
  { slot: "afternoon", label: "下午", timeRange: "14:00-17:00", startHour: 14 },
  { slot: "evening", label: "晚上", timeRange: "18:00-20:00", startHour: 18 },
];

export const scheduleDayOptions = [
  { label: "明天", offsetDays: 1 },
  { label: "后天", offsetDays: 2 },
  { label: "本周末", offsetDays: 5 },
];

export function getOrderAddressOption(cityCode: CityCode): OrderAddressCityOption {
  return orderAddressOptionsByCity[cityCode] ?? orderAddressOptionsByCity.hangzhou;
}

export function getServiceTimeSlot(slot: ScheduledTimeSlot) {
  return serviceTimeSlots.find((item) => item.slot === slot) ?? serviceTimeSlots[0];
}

export function buildScheduledAt(offsetDays: number, slot: ScheduledTimeSlot, now = new Date()): string {
  const selectedSlot = getServiceTimeSlot(slot);
  const date = new Date(now);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(selectedSlot.startHour, 0, 0, 0);
  return date.toISOString();
}

export function formatScheduledLabel(scheduledAt: string, slot: ScheduledTimeSlot): string {
  const date = scheduledAt ? new Date(scheduledAt) : null;
  const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("zh-CN") : "未预约";
  const selectedSlot = getServiceTimeSlot(slot);
  return `${dateText} ${selectedSlot.label} ${selectedSlot.timeRange}`;
}
