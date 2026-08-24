/**
 * BRIEFING — the console writes the founder's message for them.
 *
 * One narrative built from live CRM data: where the day stands, what is
 * winning, what is broken, who is accountable, and the three orders to give
 * next. Copy for WhatsApp or print it for the stand-up.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCopy, Printer, Sunrise, Sunset } from "lucide-react";
import { toast } from "sonner";
import { useAdminFocus } from "@/founder/lib/admin-focus";
import { buildAlerts, buildLeague, buildPace } from "@/founder/lib/brain/watchtower";
import { useDecisions } from "@/founder/lib/admin/decisions-store";

export const Route = createFileRoute("/admin/briefing")({
  head: () => ({
    meta: [
      { title: "Briefing — Founder Admin | Gharpayy" },
      { name: "description", content: "Auto-written morning brief and end-of-day close: pace, zone league, risks, accountable people and the next three orders." },
      { property: "og:title", content: "Briefing — Founder Admin | Gharpayy" },
      { property: "og:description", content: "The founder's morning brief and EOD close, written from live CRM data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Briefing;
});

function Briefing() {
  return null;
}
