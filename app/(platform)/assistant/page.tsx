import { cookies } from "next/headers";
import { Bot } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { listRooms } from "@/features/rooms/queries";
import { AssistantForm } from "@/components/assistant/AssistantForm";
import { EmptyState } from "@/components/ui/EmptyState";

// Teacher/Admin only; Students and Guardians are redirected, and the action re-checks the role.
export default async function AssistantPage() {
  await pageRole(STAFF);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "ast");
  const rooms = await listRooms();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title}</h1>
      <p className="text-sm text-muted">{L.scope}</p>
      {rooms.length === 0 ? <EmptyState icon={Bot} title={L.title} /> : <AssistantForm rooms={rooms} labels={L} />}
      <p className="text-xs text-muted">{L.examples}</p>
    </div>
  );
}
