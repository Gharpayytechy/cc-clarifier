import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ClientOnly } from "@/components/ClientOnly";
import { ClosingBoard } from "@/components/commitments/ClosingBoard";
import { HowButton } from "@/components/common/HowButton";

export const Route = createFileRoute("/closing")({
  head: () => ({
    meta: [
      { title: "Closing Board — Promised Closes & Accuracy | Gharpayy" },
      { name: "description", content: "Every 'Definitely Close' promise in one board: what closes today, which promises went overdue, how often dates moved, and each closer's promise accuracy." },
      { property: "og:title", content: "Closing Board — Promised Closes & Accuracy" },
      { property: "og:description", content: "The honest forecast: named people, named leads, named deadlines, and the full history of every date change." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClosingPage,
});

function ClosingPage() {
  return (
    <AppShell>
      <div className="space-y-4">
        <header>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Closing Board</h1>
            <HowButton
              withText
              title="What this board is for"
              why="A pipeline nobody will date is not a forecast. This board only contains leads where a named person said when the money lands."
              howToExecute={[
                "Every hard-intent lead must carry a close promise before the shift ends.",
                "Run 'Closing today' in the morning huddle and 'Overdue' in the evening review.",
                "Settle every promise the same day it is due — kept, broken, or moved with a reason.",
              ]}
              whatNotToDo={["Never move a date without writing why.", "Never report this board's numbers as revenue before payment."]}
              problemsThatCanOccur={["Optimistic short windows inflate today's number.", "Unsettled promises quietly rot into overdue noise."]}
              branches={[{ condition: "Board is empty", then: "The problem is promising discipline, not lead supply — go make promises on live leads." }]}
              doneWhen="Zero overdue promises and every one of today's rows settled."
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Today's promised closes, the promises that went past their deadline, and how reliable each person's
            word actually is. Every date change is kept forever with its reason.
          </p>
        </header>
        <ClientOnly fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading promises…</p>}>
          <ClosingBoard />
        </ClientOnly>
      </div>
    </AppShell>
  );
}
