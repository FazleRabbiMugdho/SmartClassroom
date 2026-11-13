"use client";

import { useState } from "react";
import { Thermometer, Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Field } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { Table } from "@/components/ui/Table";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/shared/MetricCard";
import { SafetyStateBanner, type SafetyState } from "@/components/shared/SafetyStateBanner";
import { ConnectionPill, type ConnState } from "@/components/shared/ConnectionPill";
import { DataFreshnessLabel } from "@/components/shared/DataFreshnessLabel";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-sm font-semibold text-muted">{title}</h2>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </section>
);

export default function ShowcasePage() {
  const [tab, setTab] = useState("a");
  const rows = [
    { seq: 1048, type: "CARD_TAP", ts: "09:02:11" },
    { seq: 1049, type: "ENTRY_GRANTED", ts: "09:02:13" },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Component showcase</h1>

      <Section title="Buttons">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button>
        <Button size="sm">Small</Button>
      </Section>

      <Section title="Badges">
        <Badge>Neutral</Badge>
        <Badge tone="safe">Safe</Badge>
        <Badge tone="warning">Warning</Badge>
        <Badge tone="danger">Danger</Badge>
        <Badge tone="info">Info</Badge>
      </Section>

      <Section title="Inputs">
        <div className="w-60"><Field label="Email" htmlFor="sc-email"><Input id="sc-email" placeholder="you@example.com" /></Field></div>
        <div className="w-48"><Field label="Room" htmlFor="sc-room"><Select id="sc-room"><option>ROOM-101</option><option>ROOM-102</option></Select></Field></div>
      </Section>

      <Section title="Tabs">
        <Tabs value={tab} onChange={setTab} items={[{ value: "a", label: "Chart" }, { value: "b", label: "Live view" }]} />
      </Section>

      <Section title="Metric cards">
        <div className="w-56"><MetricCard icon={Thermometer} tint="cyan" label="Temperature" value="29.4" unit="°C" sub={<DataFreshnessLabel ageSeconds={4} />} /></div>
        <div className="w-56"><MetricCard icon={Thermometer} tint="coral" label="Chip temp" value="41.5" unit="°C" sub={<DataFreshnessLabel ageSeconds={48} />} /></div>
      </Section>

      <Section title="Connection">
        {(["ONLINE", "DELAYED", "STALE", "OFFLINE", "UNKNOWN"] as ConnState[]).map((s) => (
          <ConnectionPill key={s} state={s} rssi={-61} />
        ))}
      </Section>

      <Section title="Safety banners">
        <div className="w-full space-y-2">
          {(["SAFE", "WARNING", "DANGER", "FIRE", "PANIC"] as SafetyState[]).map((s) => (
            <SafetyStateBanner key={s} state={s} detail={s === "FIRE" ? "Door held UNLOCKED" : undefined} />
          ))}
        </div>
      </Section>

      <Section title="Table">
        <div className="w-full">
          <Table
            rows={rows}
            rowKey={(r) => String(r.seq)}
            columns={[
              { key: "seq", header: "Seq", mono: true, render: (r) => r.seq },
              { key: "type", header: "Event", render: (r) => <Badge tone="info">{r.type}</Badge> },
              { key: "ts", header: "Time", mono: true, align: "right", render: (r) => r.ts },
            ]}
          />
        </div>
      </Section>

      <Section title="Loading / empty">
        <Card className="w-56 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /></Card>
        <div className="w-full max-w-md">
          <EmptyState icon={Inbox} title="No events yet" description="Events appear here once the device reports activity." action={<Button size="sm"><Plus className="size-4" />Add</Button>} />
        </div>
      </Section>
    </main>
  );
}
