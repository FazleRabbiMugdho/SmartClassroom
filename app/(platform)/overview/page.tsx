import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { listRooms } from "@/features/rooms/queries";
import { pageRole } from "@/server/auth/guard";
import { EmptyState } from "@/components/ui/EmptyState";

// Command Centre entry: staff land on their first accessible room; students and
// guardians are sent to their own (much smaller) dashboards.
export default async function OverviewPage() {
  const ctx = await pageRole(["ADMIN", "TEACHER", "STUDENT", "GUARDIAN"]);
  if (ctx.role === "STUDENT") redirect("/student/dashboard");
  if (ctx.role === "GUARDIAN") redirect("/guardian/dashboard");

  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const labels = labelsFor(locale, "room");
  const rooms = await listRooms();
  if (rooms.length === 0) return <EmptyState icon={DoorOpen} title={labels.none} description={labels.noneBody} />;
  redirect(`/rooms/${rooms[0].id}`);
}
