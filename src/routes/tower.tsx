import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { TowerAuthProvider, useTowerAuth } from "@/lib/tower/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/tower")({
  component: () => (
    <TowerAuthProvider>
      <TowerShell />
    </TowerAuthProvider>
  ),
  head: () => ({ meta: [{ title: "Control Tower — Gharpayy" }] }),
});

function TowerShell() {
  const auth = useTowerAuth();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const tabs = [
    { to: "/tower", label: "Control Tower", exact: true },
    { to: "/tower/my-leads", label: "My Leads" },
    { to: "/tower/team", label: "Team" },
    { to: "/tower/review", label: "Review OS" },
    { to: "/tower/feedback", label: "My Feedback" },
    { to: "/tower/quality", label: "Quality" },
    { to: "/tower/dashboard", label: "Dashboard" },
    { to: "/tower/eod", label: "EOD" },
    { to: "/tower/admin", label: "Admin" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-lg font-bold">Gharpayy Control Tower</div>
              <div className="text-xs text-muted-foreground">Zero Lead Left Behind</div>
            </div>
            <nav className="flex gap-1 flex-wrap">
              {tabs.map((t) => {
                const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
                return (
                  <Link key={t.to} to={t.to} className={`px-3 py-1.5 rounded text-sm ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {auth.user ? (
              <>
                <div className="text-right">
                  <div className="text-xs font-medium">{auth.user.email}</div>
                  <div className="flex gap-1 justify-end mt-0.5">
                    {auth.roles.map((r) => <Badge key={r} variant="outline" className="text-[9px] px-1">{r}</Badge>)}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={async () => { await auth.signOut(); nav({ to: "/auth" }); }}>Sign out</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => nav({ to: "/auth" })}>Sign in</Button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto p-4"><Outlet /></main>
    </div>
  );
}