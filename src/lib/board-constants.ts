import type { AssignmentStatus, RoomStatus } from "./database.types";

export interface BoardPerson {
  id: string;
  name: string;
  role: string;
  color: string;
  area: string | null;
  /** Duty status; absent means "assigned" (normal duty). */
  status?: AssignmentStatus;
}

export const LEADER_AREA = "Leader";

export const FIXED_TASKS = [
  "OPD前台",
  "住院前台",
  "麻後訪視",
  "諮詢室",
  "衛教室",
  "電子同意書",
  "庫房",
];

export const ROOMS = Array.from({ length: 31 }, (_, i) => `R${i + 1}`);

export const SHIFT_12_20 = [
  "12-20A1",
  "12-20A2",
  "12-20A3",
  "12-20A4",
  "12-20A5",
  "12-20A6",
];

export const SHIFT_EVENING = [
  "小夜A1",
  "小夜A2",
  "小夜A3",
  "小夜A4",
  "小夜A5",
  "小夜A6",
];

export const SHIFT_NIGHT = [
  "大夜A1",
  "大夜A2",
  "大夜A3",
  "大夜A4",
  "大夜A5",
  "大夜A6",
];

export const ANESTHESIA_OUTSIDE = [
  "天使",
  "鏡檢",
  "鏡檢PAR",
  "健檢",
  "健檢PAR",
];

export const RECOVERY_ROOMS = ["住院PAR", "門診PAR"];

export const CASE_MANAGEMENT = ["PCA", "疼痛個案管理", "ERAS個案管理"];

export const ALL_AREAS = [
  LEADER_AREA,
  ...FIXED_TASKS,
  ...ROOMS,
  ...SHIFT_12_20,
  ...SHIFT_EVENING,
  ...SHIFT_NIGHT,
  ...ANESTHESIA_OUTSIDE,
  ...RECOVERY_ROOMS,
  ...CASE_MANAGEMENT,
];

export const ALL_AREAS_SET = new Set(ALL_AREAS);

export const ROOM_STATUS_META: Record<
  RoomStatus,
  { label: string; className: string }
> = {
  idle: { label: "空房", className: "bg-slate-200 text-slate-600" },
  induction: { label: "誘導中", className: "bg-amber-200 text-amber-800" },
  surgery: { label: "手術中", className: "bg-red-200 text-red-800" },
  cleaning: { label: "清潔中", className: "bg-blue-200 text-blue-800" },
  ready: { label: "備妥", className: "bg-green-200 text-green-800" },
};

export const ROOM_STATUS_ORDER: RoomStatus[] = [
  "idle",
  "induction",
  "surgery",
  "cleaning",
  "ready",
];

export const ASSIGNMENT_STATUS_META = {
  assigned: { label: "", className: "" },
  break: { label: "休息", className: "bg-amber-300 text-amber-900" },
  relief: { label: "代班", className: "bg-violet-300 text-violet-900" },
} as const;

export const COLOR_PALETTE = [
  "bg-amber-100",
  "bg-pink-100",
  "bg-green-100",
  "bg-blue-100",
  "bg-purple-100",
  "bg-orange-100",
];

export const DEMO_PEOPLE: BoardPerson[] = [
  {
    id: "demo-1",
    name: "王小明",
    role: "麻醉護理師",
    color: "bg-amber-100",
    area: "R1",
  },
  {
    id: "demo-2",
    name: "林怡君",
    role: "Leader",
    color: "bg-pink-100",
    area: "Leader",
  },
  {
    id: "demo-3",
    name: "陳美玲",
    role: "前台",
    color: "bg-green-100",
    area: "OPD前台",
  },
  {
    id: "demo-4",
    name: "張志宏",
    role: "PAR",
    color: "bg-purple-100",
    area: "健檢PAR",
  },
  {
    id: "demo-5",
    name: "黃雅婷",
    role: "PCA",
    color: "bg-blue-100",
    area: "疼痛個案管理",
  },
  {
    id: "demo-6",
    name: "蔡宗翰",
    role: "小夜",
    color: "bg-orange-100",
    area: "小夜A1",
  },
];
