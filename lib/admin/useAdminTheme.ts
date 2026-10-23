"use client";

import { useEffect, useState } from "react";

export type AdminTheme = "light" | "dark" | "system";
export const ADMIN_THEME_KEY = "mediwell-admin-theme";
const THEME_EVENT = "medwell-admin-theme-changed";
const valid = (value: unknown): value is AdminTheme => ["light", "dark", "system"].includes(String(value));

export function useAdminTheme() {
  const [theme, setTheme] = useState<AdminTheme>("light");
  useEffect(() => {
    const sync = () => {
      let value: string | null = document.documentElement.dataset.adminTheme || "light";
      try { value = localStorage.getItem(ADMIN_THEME_KEY) || value; } catch { /* Keep the current theme when storage is unavailable. */ }
      const next = valid(value) ? value : "light";
      document.documentElement.dataset.adminTheme = next;
      setTheme(next);
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(THEME_EVENT, sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(THEME_EVENT, sync); };
  }, []);
  const selectTheme = (value: AdminTheme) => {
    if (!valid(value)) return;
    document.documentElement.dataset.adminTheme = value;
    setTheme(value);
    try { localStorage.setItem(ADMIN_THEME_KEY, value); } catch { /* The selected theme still applies to this tab. */ }
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  return { theme, selectTheme };
}
