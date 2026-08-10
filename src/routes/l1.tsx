import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { L1Composer } from "@/components/l1/L1Composer";
import { L1ZoneBoard } from "@/components/l1/L1ZoneBoard";
import { ClientOnly } from "@/components/ClientOnly";

export const Route = createFileRoute("/l1")({
  head: () => ({
    meta: [
      { title: "L1 Review — Chat & Call Audit by Zone | Gharpayy" },
      { name: "description", content: "Audit every chat and call step by step: speed, follow-ups, understanding, human vs AI, the extra 10%, wow and dull moments, and why the customer has not paid." },
      { property: "og:title", content: "L1 Review — Chat & Call Audit by Zone" },
      { property: "og:description", content: "Owner-grade L1 review for every Gharpayy conversation, zone by zone, with a payment forecast against 30 bookings per day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: L1Page,
});

function L1Page() {
  return (
    <AppShell>
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">L1 Review</h1>
          <p className="text-sm text-muted-foreground">
            Every chat and every call, audited against the step list — zone by zone. Was it followed,
            was it fast, did we understand, did we add the extra 10%, and when does the money land?
          </p>
        </header>

        <Tabs defaultValue="daily">
          <TabsList className="flex-wrap">
            <TabsTrigger value="daily">Daily 100</TabsTrigger>
            <TabsTrigger value="manual">Manual review (no AI)</TabsTrigger>
            <TabsTrigger value="board">Zone board</TabsTrigger>
            <TabsTrigger value="chat">Auto review — chat</TabsTrigger>
            <TabsTrigger value="call">Auto review — call</TabsTrigger>
          </TabsList>
          <TabsContent value="daily" className="mt-4">
            <ClientOnly fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading today's marks…</p>}>
              <L1DailyBoard />
            </ClientOnly>
          </TabsContent>
          <TabsContent value="manual" className="mt-4">
            <ClientOnly fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading manual review…</p>}>
              <L1ManualReview kind="chat" />
            </ClientOnly>
          </TabsContent>
          <TabsContent value="board" className="mt-4">
            <ClientOnly fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading reviews…</p>}>
              <L1ZoneBoard />
            </ClientOnly>
          </TabsContent>
          <TabsContent value="chat" className="mt-4"><L1Composer kind="chat" /></TabsContent>
          <TabsContent value="call" className="mt-4"><L1Composer kind="call" /></TabsContent>
        </Tabs>

      </div>
    </AppShell>
  );
}