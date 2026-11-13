import { redirect, notFound } from "next/navigation";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Device detail lives in the room dashboard (health panel). Resolve device -> room.
export default async function DevicePage({ params }: { params: Promise<{ deviceId: string }> }) {
  await pageRole(STAFF);
  const { deviceId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("devices").select("room_id").eq("id", deviceId).maybeSingle();
  if (!data) notFound();
  redirect(`/rooms/${data.room_id}`);
}
