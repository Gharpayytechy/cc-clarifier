import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ControlTowerTeamPage } from "@/components/control-tower/ControlTowerTeamPage";

export const Route = createFileRoute("/control-tower-team")({
  head: () => ({
    meta: [
      { title: "Control Tower Team — Gharpayy" },
      { name: "description", content: "Alignment layer above zones: single-owner lock, 4-gate flawless process, inventory focus, BBD lineup, chat-depth review, assigned worklist." },
    ],
  }),
  component: () => (
    <AppShell>
      <ControlTowerTeamPage />
    </AppShell>
  ),
});