"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Input";

export function RoomSelector({ rooms, value, label }: { rooms: { id: string; display_name: string }[]; value: string; label: string }) {
  const router = useRouter();
  if (rooms.length < 2) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      {label}
      <Select value={value} onChange={(e) => router.push(`/rooms/${e.target.value}`)} className="w-44">
        {rooms.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
      </Select>
    </label>
  );
}
