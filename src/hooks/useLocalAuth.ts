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

  // Get token from localStorage
  const token = typeof window !== "undefined" ? localStorage.getItem("aolc_token") : null;

  const meQuery = trpc.localAuth.me.useQuery(
    { token: token || "" },
    { enabled: !!token && !user, retry: false }
  );

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

  const logout = useCallback(() => {
    localStorage.removeItem("aolc_token");
    setUser(null);
    window.location.href = "/login";
  }, []);

  return {
    user,
    isLoading,
    login,
    logout,
    isAdmin: user?.role === "admin",
    error: loginMutation.error?.message,
  };
}
