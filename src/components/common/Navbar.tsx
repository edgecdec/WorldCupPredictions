"use client";
import { useState, useEffect } from "react";
import {
  AppBar, Toolbar, Typography, Button, Box, IconButton, Tooltip,
  Drawer, List, ListItemButton, ListItemText, Divider,
} from "@mui/material";
import { DarkMode, LightMode, Menu as MenuIcon } from "@mui/icons-material";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";
import { getPhase, isPageRestricted, getUnlockMessage, type TournamentPhase } from "@/lib/tournamentPhase";
import type { Tournament } from "@/types";

const NAV_LINKS = [
  { label: "Predictions", href: "/bracket" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Simulator", href: "/simulate" },
  { label: "Who Picked", href: "/whopicked" },
  { label: "Stats", href: "/stats" },
  { label: "Groups", href: "/groups" },
] as const;

export default function Navbar() {
  const { user, logout } = useAuth();
  const { mode, toggle } = useThemeMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [phase, setPhase] = useState<TournamentPhase>('pre-tournament');

  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then(d => setPhase(getPhase(d.tournament as Tournament | null)))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  const isLinkRestricted = (href: string) =>
    !user?.is_admin && isPageRestricted(href, phase);

  const getLinkTooltip = (href: string) =>
    getUnlockMessage(href, phase) ?? '';

  const themeTooltip = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const themeIcon = mode === "dark" ? <LightMode /> : <DarkMode />;

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography
            variant="h6"
            component="a"
            href="/"
            sx={{ flexGrow: 1, textDecoration: "none", color: "inherit" }}
          >
            ⚽ World Cup Predictions
          </Typography>

          {/* Desktop nav */}
          <Box sx={{ display: { xs: "none", md: "flex" }, gap: 1, alignItems: "center" }}>
            {user && NAV_LINKS.map((l) => {
              const restricted = isLinkRestricted(l.href);
              const btn = (
                <Button
                  key={l.href}
                  color="inherit"
                  href={restricted ? undefined : l.href}
                  disabled={restricted}
                  sx={restricted ? { opacity: 0.4 } : undefined}
                >
                  {l.label}
                </Button>
              );
              if (restricted) {
                return (
                  <Tooltip key={l.href} title={getLinkTooltip(l.href)}>
                    <span>{btn}</span>
                  </Tooltip>
                );
              }
              return btn;
            })}
            {user?.is_admin && <Button color="warning" href="/admin">Admin</Button>}
            <Tooltip title={themeTooltip}>
              <IconButton color="inherit" onClick={toggle} size="small">{themeIcon}</IconButton>
            </Tooltip>
            {user ? (
              <>
                <Typography variant="body2" sx={{ mx: 1 }}>{user.username}</Typography>
                <Button color="inherit" onClick={handleLogout} size="small">Logout</Button>
              </>
            ) : (
              <Button color="inherit" href="/" size="small">Login</Button>
            )}
          </Box>

          {/* Mobile */}
          <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center" }}>
            <Tooltip title={themeTooltip}>
              <IconButton color="inherit" onClick={toggle} size="small">{themeIcon}</IconButton>
            </Tooltip>
            <IconButton color="inherit" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu">
              <MenuIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 240 }} role="navigation" onClick={() => setDrawerOpen(false)}>
          <List>
            {user && NAV_LINKS.map((l) => {
              const restricted = isLinkRestricted(l.href);
              if (restricted) {
                return (
                  <Tooltip key={l.href} title={getLinkTooltip(l.href)} placement="left">
                    <span>
                      <ListItemButton disabled>
                        <ListItemText primary={l.label} sx={{ opacity: 0.4 }} />
                      </ListItemButton>
                    </span>
                  </Tooltip>
                );
              }
              return (
                <ListItemButton key={l.href} component="a" href={l.href}>
                  <ListItemText primary={l.label} />
                </ListItemButton>
              );
            })}
            {user?.is_admin && (
              <ListItemButton component="a" href="/admin">
                <ListItemText primary="Admin" sx={{ color: "warning.main" }} />
              </ListItemButton>
            )}
            <Divider />
            {user ? (
              <>
                <ListItemButton disabled>
                  <ListItemText primary={user.username} />
                </ListItemButton>
                <ListItemButton onClick={handleLogout}>
                  <ListItemText primary="Logout" />
                </ListItemButton>
              </>
            ) : (
              <ListItemButton component="a" href="/">
                <ListItemText primary="Login" />
              </ListItemButton>
            )}
          </List>
        </Box>
      </Drawer>
    </>
  );
}
