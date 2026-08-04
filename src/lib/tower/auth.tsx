import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { canAccess, modulesForRoles, primaryRole, ROLE_DEFAULT_TEAM, type ModuleId, type Role, type TowerModule } from "@/lib/tower/access";
import type { ReviewTeam } from "@/lib/tower/review-os";

type AuthState = {
  user: User | null;
  roles: Role[];
  team: ReviewTeam | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isOperator: boolean;
  isSales: boolean;
  isControlTower: boolean;
  /** Anyone who runs the tower floor: admin, manager, control tower or operator. */
  isTowerOps: boolean;
  role: Role | null;
  modules: TowerModule[];
  can: (id: ModuleId) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function TowerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [team, setTeam] = useState<ReviewTeam | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (uid: string) => {
    const [r, p] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("team").eq("user_id", uid).maybeSingle(),
    ]);
    const list = (r.data ?? []).map((x) => x.role);
    setRoles(list);
    const fallback = list.map((x) => ROLE_DEFAULT_TEAM[x]).find(Boolean) ?? null;
    setTeam((p.data?.team as ReviewTeam | null) ?? fallback);
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    if (data.user) await loadRoles(data.user.id);
    else { setRoles([]); setTeam(null); }
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      if (data.session?.user) await loadRoles(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setUser(session?.user ?? null);
        if (session?.user) setTimeout(() => loadRoles(session.user.id), 0);
        else { setRoles([]); setTeam(null); }
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager") || isAdmin;
  const isControlTower = roles.includes("control_tower") || isAdmin;
  const isOperator = roles.includes("operator") || isAdmin;

  const value: AuthState = {
    user,
    roles,
    team,
    loading,
    isAdmin,
    isManager,
    isOperator,
    isSales: roles.includes("sales") || isAdmin,
    isControlTower,
    isTowerOps: isAdmin || isManager || isControlTower || isOperator,
    role: primaryRole(roles),
    modules: modulesForRoles(roles),
    can: (id: ModuleId) => canAccess(id, roles),
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTowerAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTowerAuth outside provider");
  return v;
}
