"use client";
import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { createTheme, Theme } from "@mui/material";

type Mode = "dark" | "light";

const STORAGE_KEY = "themeMode";
const PRIMARY_GREEN = "#2e7d32";
const SECONDARY_GOLD = "#ffc107";

const ThemeModeContext = createContext<{ mode: Mode; toggle: () => void; theme: Theme }>({
  mode: "dark",
  toggle: () => {},
  theme: createTheme(),
});

const makeTheme = (mode: Mode) =>
  createTheme({
    palette: {
      mode,
      primary: { main: PRIMARY_GREEN },
      secondary: { main: SECONDARY_GOLD },
      ...(mode === "dark"
        ? { background: { default: "#121212", paper: "#1e1e1e" } }
        : { background: { default: "#f5f5f5", paper: "#ffffff" } }),
    },
    components: {
      MuiButton: {
        styleOverrides: {
          containedPrimary: { fontWeight: 700 },
        },
      },
    },
  });

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Mode | null;
    if (saved === "light" || saved === "dark") setMode(saved);
  }, []);

  const toggle = () => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  const theme = useMemo(() => makeTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider value={{ mode, toggle, theme }}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export const useThemeMode = () => useContext(ThemeModeContext);
