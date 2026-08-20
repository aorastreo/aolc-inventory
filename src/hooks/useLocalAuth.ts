import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/providers/trpc";

interface AuthUser {
  id: number;
  name: string;
  username: string;
  role: string;
  storeId: number;
}

export function useLocalAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("aolc_token", data.token);
      setUser(data.user);
      setIsLoading(false);
    },
    onError: () => {
      setIsLoading(false);
    }
  });

  const loginByStoreMutation = trpc.localAuth.loginByStore.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("aolc_token", data.token);
      setUser(data.user);
      setIsLoading(false);
    },
    onError: () => {
      setIsLoading(false);
    }
  });

  // Get token from localStorage
  const token = typeof window !== "undefined" ? localStorage.getItem("aolc_token") : null;

  const meQuery = trpc.localAuth.me.useQuery(
    { token: token || "" },
    { enabled: !!token && !user, retry: false }
  );

  // Safety timeout: never stay loading more than 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data);
      setIsLoading(false);
    } else if (meQuery.isError) {
      localStorage.removeItem("aolc_token");
      setUser(null);
      setIsLoading(false);
    } else if (!token) {
      setIsLoading(false);
    }
  }, [meQuery.data, meQuery.isError, meQuery.isSuccess, token]);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    return loginMutation.mutateAsync({ username, password });
  }, [loginMutation]);

  const loginByStore = useCallback(async (storeId: number, password: string) => {
    setIsLoading(true);
    return loginByStoreMutation.mutateAsync({ storeId, password });
  }, [loginByStoreMutation]);

  const logout = useCallback(() => {
    localStorage.removeItem("aolc_token");
    setUser(null);
    window.location.href = "/login";
  }, []);

  const role = user?.role || null;
  const storeId = user?.storeId || null;

  return {
    user,
    isLoading,
    login,
    loginByStore,
    logout,
    role,
    storeId,
    isAdmin: role === "admin",
    isManager: role === "admin" || role === "manager",
    isEmployee: role === "employee",
    error: loginMutation.error?.message || loginByStoreMutation.error?.message,
  };
}
