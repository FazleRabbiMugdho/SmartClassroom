import { cookies } from "next/headers";
import Link from "next/link";
import { DoorOpen } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { listRooms } from "@/features/rooms/queries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function RoomsPage() {
  await pageRole(STAFF);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const labels = labelsFor(locale, "room");
  const rooms = await listRooms();

  if (rooms.length === 0) {
    return <EmptyState icon={DoorOpen} title={labels.none} description={labels.noneBody} />;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{labels.select}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {rooms.map((r) => (
          <li key={r.id}>
            <Link href={`/rooms/${r.id}`} className="block">
              <Card className="transition-colors hover:border-indigo/40">
                <p className="font-semibold">{r.display_name}</p>
                <p className="tabular text-sm text-muted">{r.room_code}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
