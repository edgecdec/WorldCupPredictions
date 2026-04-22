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

const KNOCKOUT_END = "Jul 19";

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

function buildPhases(
  lockTimeGroups: string | null,
  lockTimeKnockout: string | null
): Phase[] {
  const groupDate = lockTimeGroups ? formatDate(lockTimeGroups) : null;
  const koDate = lockTimeKnockout ? formatDate(lockTimeKnockout) : null;

  return [
    {
      label: "Predictions Open",
      description:
        "Fill out your group predictions — rank all 12 groups and pick which 3rd-place teams advance.",
      icon: <EditNoteIcon />,
      dateRange: groupDate ? `Now – ${groupDate}` : "Dates TBD",
    },
    {
      label: "Group Stage",
      description:
        "Watch matches and track your predictions vs live results. Knockout predictions open near the end.",
      icon: <GroupsIcon />,
      dateRange:
        groupDate && koDate ? `${groupDate} – ${koDate}` : "Dates TBD",
    },
    {
      label: "Knockout Predictions",
      description:
        "Come back to fill out your knockout bracket before the Round of 32 begins.",
      icon: <AccountTreeIcon />,
      dateRange: koDate ? `Around ${koDate}` : "Dates TBD",
    },
    {
      label: "Knockout Stage",
      description:
        "Watch the bracket unfold from the Round of 32 through the Final. Track the leaderboard live!",
      icon: <EmojiEventsIcon />,
      dateRange: koDate ? `${koDate} – ${KNOCKOUT_END}` : "Dates TBD",
    },
  ];
}

export default function TournamentTimeline({
  lockTimeGroups,
  lockTimeKnockout,
}: TournamentTimelineProps) {
  const theme = useTheme();
  const activeStep = getActiveStep(lockTimeGroups, lockTimeKnockout);
  const phases = buildPhases(lockTimeGroups, lockTimeKnockout);

  const dateColor =
    theme.palette.mode === "dark" ? "primary.light" : "primary.dark";

  return (
    <Box sx={{ textAlign: "left", mt: 2 }}>
      <Typography
        variant="subtitle1"
        fontWeight="bold"
        gutterBottom
        sx={{ textAlign: "center" }}
      >
        Tournament Timeline
      </Typography>
      <Stepper activeStep={activeStep} orientation="vertical" sx={{ pl: 1 }}>
        {phases.map((phase, idx) => (
          <Step key={phase.label} completed={idx < activeStep}>
            <StepLabel
              icon={phase.icon}
              optional={
                <Typography variant="caption" sx={{ color: dateColor }}>
                  {phase.dateRange}
                </Typography>
              }
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
            </StepContent>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}
