import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MissionQueue } from "@/components/workflow/MissionQueue";

export const Route = createFileRoute("/my-work")({
  head: () => ({
    meta: [
      { title: "My Work — Mission Queue" },
      { name: "description", content: "One mission at a time: waves, live projected end of day, mandatory next action on every outcome." },
      { property: "og:title", content: "My Work — Mission Queue" },
      { property: "og:description", content: "Your daily mission with waves, recovery queue and guaranteed next actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell><MissionQueue /></AppShell>,
});
