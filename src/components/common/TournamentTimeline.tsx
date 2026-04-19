"use client";
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  useTheme,
} from "@mui/material";
import EditNoteIcon from "@mui/icons-material/EditNote";
import GroupsIcon from "@mui/icons-material/Groups";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";

interface TournamentTimelineProps {
  lockTimeGroups: string | null;
  lockTimeKnockout: string | null;
}

interface Phase {
  label: string;
  description: string;
  icon: React.ReactElement;
  dateRange: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getActiveStep(
  lockTimeGroups: string | null,
  lockTimeKnockout: string | null
): number {
  const now = Date.now();
  if (!lockTimeGroups) return 0;
  if (now < new Date(lockTimeGroups).getTime()) return 0;
  if (!lockTimeKnockout) return 1;
  if (now < new Date(lockTimeKnockout).getTime()) return 1;
  return 2;
}

export default function TournamentTimeline({
  lockTimeGroups,
  lockTimeKnockout,
}: TournamentTimelineProps) {
  const theme = useTheme();
  const activeStep = getActiveStep(lockTimeGroups, lockTimeKnockout);

  const phases: Phase[] = [
    {
      label: "Predictions Open",
      description:
        "Fill out your group predictions — rank all 12 groups and pick which 3rd-place teams advance.",
      icon: <EditNoteIcon />,
      dateRange: lockTimeGroups
        ? `Now – ${formatDate(lockTimeGroups)}`
        : "Dates TBD",
    },
    {
      label: "Group Stage",
      description:
        "Watch matches and track your predictions vs live results. Knockout predictions open near the end.",
      icon: <GroupsIcon />,
      dateRange:
        lockTimeGroups && lockTimeKnockout
          ? `${formatDate(lockTimeGroups)} – ${formatDate(lockTimeKnockout)}`
          : "Dates TBD",
    },
    {
      label: "Knockout Predictions",
      description:
        "Come back to fill out your knockout bracket before the Round of 32 begins.",
      icon: <AccountTreeIcon />,
      dateRange: lockTimeKnockout
        ? `Around ${formatDate(lockTimeKnockout)}`
        : "Dates TBD",
    },
    {
      label: "Knockout Stage",
      description:
        "Watch the bracket unfold from the Round of 32 through the Final. Track the leaderboard live!",
      icon: <EmojiEventsIcon />,
      dateRange: lockTimeKnockout ? `${formatDate(lockTimeKnockout)} – Jul 19` : "Dates TBD",
    },
  ];

  return (
    <Box sx={{ textAlign: "left", mt: 2 }}>
      <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ textAlign: "center" }}>
        Tournament Timeline
      </Typography>
      <Stepper activeStep={activeStep} orientation="vertical" sx={{ pl: 1 }}>
        {phases.map((phase, idx) => (
          <Step key={phase.label} completed={idx < activeStep}>
            <StepLabel
              icon={phase.icon}
              sx={{
                "& .MuiStepLabel-label": {
                  fontWeight: idx === activeStep ? "bold" : "normal",
                  color:
                    idx === activeStep
                      ? "primary.main"
                      : idx < activeStep
                        ? "text.secondary"
                        : "text.disabled",
                },
              }}
            >
              {phase.label}
            </StepLabel>
            <StepContent>
              <Typography variant="body2" color="text.secondary">
                {phase.description}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  mt: 0.5,
                  display: "block",
                  color:
                    theme.palette.mode === "dark"
                      ? "primary.light"
                      : "primary.dark",
                }}
              >
                {phase.dateRange}
              </Typography>
            </StepContent>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}
