import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { L1Composer } from "@/components/l1/L1Composer";
import { L1ZoneBoard } from "@/components/l1/L1ZoneBoard";
import { L1ManualReview } from "@/components/l1/L1ManualReview";
import { L1DailyBoard } from "@/components/l1/L1DailyBoard";
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">L1 Review</h1>
            <HowButton
              withText
              title="How to run L1 Review"
              why="L1 is where a conversation stops being an opinion and becomes a score. Without it nobody can say why 30 bookings a day did not happen."
              howToExecute={[
                "Review 100 interactions a day: pick the newest first, oldest never.",
                "Score against the step list only — speed, understanding, follow-up, the extra 10%.",
                "Every low score must end in a label on the lead and a close promise or a written reason there is none.",
                "Close the loop the same day: the person who was reviewed must see the mark before the next shift.",
              ]}
              whatNotToDo={[
                "Do not review only bad calls — the wow moments are what the team copies.",
                "Do not score without quoting the line that earned the mark.",
                "Do not let AI-only scores stand on a disputed conversation; re-do it manually.",
              ]}
              problemsThatCanOccur={[
                "Reviews pile up and the feedback arrives too late to change behaviour.",
                "Everyone scores an identical 7 — the scale stops discriminating.",
              ]}
              branches={[
                { condition: "The same failure appears in 3+ reviews for one person", then: "Stop reviewing them and coach the single behaviour instead." },
                { condition: "A zone scores well but does not book", then: "The gap is inventory or pricing, not conversation quality." },
                { condition: "AI and manual scores disagree by 3+", then: "Trust the manual score and note why the AI misread it." },
              ]}
              doneWhen="Today's 100 are marked, every low score has a label on the lead, and each reviewed person has seen their mark."
            />
          </div>
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