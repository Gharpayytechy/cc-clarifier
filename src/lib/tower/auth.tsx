import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];

type AuthState = {
  user: User | null;
  roles: Role[];
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isOperator: boolean;
  isSales: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function TowerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (uid: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role));
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    if (data.user) await loadRoles(data.user.id);
    else setRoles([]);
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
        else setRoles([]);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    user,
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isManager: roles.includes("manager") || roles.includes("admin"),
    isOperator: roles.includes("operator") || roles.includes("admin"),
    isSales: roles.includes("sales") || roles.includes("admin"),
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