"use client";
import { useState } from "react";
import {
  AppBar, Toolbar, Typography, Button, Box, IconButton, Tooltip,
  Drawer, List, ListItemButton, ListItemText, Divider,
} from "@mui/material";
import { DarkMode, LightMode, Menu as MenuIcon } from "@mui/icons-material";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";

const NAV_LINKS = [
  { label: "Predictions", href: "/bracket" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Who Picked", href: "/whopicked" },
  { label: "Stats", href: "/stats" },
  { label: "Groups", href: "/groups" },
] as const;

export default function Navbar() {
  const { user, logout } = useAuth();
  const { mode, toggle } = useThemeMode();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

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
            {user && NAV_LINKS.map((l) => (
              <Button key={l.href} color="inherit" href={l.href}>{l.label}</Button>
            ))}
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
            {user && NAV_LINKS.map((l) => (
              <ListItemButton key={l.href} component="a" href={l.href}>
                <ListItemText primary={l.label} />
              </ListItemButton>
            ))}
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
