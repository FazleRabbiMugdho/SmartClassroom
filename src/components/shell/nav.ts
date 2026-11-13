import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, DoorOpen, CalendarCheck, ShieldAlert, ScanFace, Video,
  ChartLine, CloudSun, Bot, Cpu, SlidersHorizontal, HardDriveUpload,
  FlaskConical, ClipboardCheck, ScrollText, CalendarDays, Users, Bell,
} from "lucide-react";
import type { AppRole } from "@/server/auth/session";

export interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

// Admin/Teacher platform (Part D2). Teacher sees a subset; admin-only items are excluded.
const ADMIN: NavItem[] = [
  { labelKey: "nav.overview", href: "/overview", icon: LayoutDashboard },
  { labelKey: "nav.rooms", href: "/rooms", icon: DoorOpen },
  { labelKey: "nav.attendance", href: "/attendance", icon: CalendarCheck },
  { labelKey: "nav.safety", href: "/incidents", icon: ShieldAlert },
  { labelKey: "nav.access", href: "/access/cards", icon: ScanFace },
  { labelKey: "nav.vision", href: "/rooms", icon: Video },
  { labelKey: "nav.analytics", href: "/analytics", icon: ChartLine },
  { labelKey: "nav.weather", href: "/weather", icon: CloudSun },
  { labelKey: "nav.assistant", href: "/assistant", icon: Bot },
  { labelKey: "nav.devices", href: "/devices", icon: Cpu },
  { labelKey: "nav.settings", href: "/settings/users", icon: SlidersHorizontal },
  { labelKey: "nav.ota", href: "/devices", icon: HardDriveUpload },
  { labelKey: "nav.models", href: "/models/hand-raise", icon: FlaskConical },
  { labelKey: "nav.judge", href: "/judge", icon: ClipboardCheck },
  { labelKey: "nav.audit", href: "/settings/audit", icon: ScrollText },
];

const TEACHER: NavItem[] = ADMIN.filter((i) =>
  ["nav.overview", "nav.rooms", "nav.attendance", "nav.safety", "nav.access", "nav.vision", "nav.analytics", "nav.weather", "nav.assistant", "nav.devices", "nav.models", "nav.judge"].includes(i.labelKey),
);

const STUDENT: NavItem[] = [
  { labelKey: "nav.studentHome", href: "/student/dashboard", icon: LayoutDashboard },
  { labelKey: "nav.attendance", href: "/student/attendance", icon: CalendarCheck },
  { labelKey: "nav.schedule", href: "/student/schedule", icon: CalendarDays },
];

const GUARDIAN: NavItem[] = [
  { labelKey: "nav.guardianHome", href: "/guardian/dashboard", icon: LayoutDashboard },
  { labelKey: "nav.children", href: "/guardian/dashboard", icon: Users },
  { labelKey: "nav.attendance", href: "/guardian/attendance", icon: CalendarCheck },
  { labelKey: "nav.notifications", href: "/guardian/notifications", icon: Bell },
];

const byRole: Record<AppRole, NavItem[]> = { ADMIN, TEACHER, STUDENT, GUARDIAN };

// A user may hold several roles; the most privileged drives the shell.
export function primaryRole(roles: AppRole[]): AppRole {
  return (["ADMIN", "TEACHER", "GUARDIAN", "STUDENT"] as const).find((r) => roles.includes(r)) ?? "STUDENT";
}

export function navForRole(role: AppRole): NavItem[] {
  return byRole[role];
}
