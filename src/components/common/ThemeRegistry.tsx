"use client";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { ThemeModeProvider, useThemeMode } from "@/hooks/useThemeMode";

function ThemeInner({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeMode();
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeModeProvider>
      <ThemeInner>{children}</ThemeInner>
    </ThemeModeProvider>
  );
}
