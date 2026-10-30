import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  History,
  LayoutDashboard,
  Lightbulb,
  type LucideIcon,
  Activity,
  Search,
  Settings,
  Users,
} from "lucide-react";

/** One quiet line icon per page in the list (P2b). */
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  review: CheckSquare,
  ideas: Lightbulb,
  keywords: Search,
  scheduled: CalendarDays,
  history: History,
  siteHealth: Activity,
  plan: BarChart3,
  users: Users,
  settings: Settings,
};

export function NavIcon({ name }: { name: string }) {
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.8} />;
}
