"use client";
import { Box, TextField, Typography, Divider } from "@mui/material";
import { ScoringSettings, DEFAULT_SCORING, KNOCKOUT_ROUNDS } from "@/types";

interface ScoringEditorProps {
  value?: ScoringSettings;
  onChange: (settings: ScoringSettings) => void;
}

const GROUP_FIELDS = [
  { key: "advanceCorrect", label: "Advance Correct" },
  { key: "exactPosition", label: "Exact Position" },
  { key: "upsetBonusPerPlace", label: "Upset Bonus Per Place" },
  { key: "advancementCorrectBonus", label: "Advancement Correct Bonus" },
  { key: "perfectOrderBonus", label: "Perfect Order Bonus" },
] as const;

export default function ScoringEditor({ value, onChange }: ScoringEditorProps) {
  const settings = value ?? DEFAULT_SCORING;

  const updateGroup = (key: (typeof GROUP_FIELDS)[number]["key"], val: number) => {
    onChange({ ...settings, groupStage: { ...settings.groupStage, [key]: val } });
  };

  const updatePointsPerRound = (idx: number, val: number) => {
    const arr = [...settings.knockout.pointsPerRound];
    arr[idx] = val;
    onChange({ ...settings, knockout: { ...settings.knockout, pointsPerRound: arr } });
  };

  const updateUpsetMultiplier = (idx: number, val: number) => {
    const arr = [...settings.knockout.upsetMultiplierPerRound];
    arr[idx] = val;
    onChange({ ...settings, knockout: { ...settings.knockout, upsetMultiplierPerRound: arr } });
  };

  const updateKnockout = (key: "upsetModulus" | "championBonus", val: number) => {
    onChange({ ...settings, knockout: { ...settings.knockout, [key]: val } });
  };

  const numField = (label: string, val: number, onChg: (v: number) => void) => (
    <TextField
      key={label}
      label={label}
      type="number"
      size="small"
      value={val}
      onChange={(e) => onChg(Number(e.target.value) || 0)}
      slotProps={{ htmlInput: { min: 0 } }}
      sx={{ width: 160 }}
    />
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="subtitle1" fontWeight="bold">Group Stage</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {GROUP_FIELDS.map((f) => numField(f.label, settings.groupStage[f.key], (v) => updateGroup(f.key, v)))}
      </Box>

      <Divider />

      <Typography variant="subtitle1" fontWeight="bold">Knockout — Points Per Round</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {KNOCKOUT_ROUNDS.map((r, i) => numField(r, settings.knockout.pointsPerRound[i] ?? 0, (v) => updatePointsPerRound(i, v)))}
      </Box>

      <Typography variant="subtitle1" fontWeight="bold">Knockout — Upset Multiplier Per Round</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {KNOCKOUT_ROUNDS.map((r, i) => numField(`${r} Multiplier`, settings.knockout.upsetMultiplierPerRound[i] ?? 0, (v) => updateUpsetMultiplier(i, v)))}
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {numField("Upset Modulus", settings.knockout.upsetModulus, (v) => updateKnockout("upsetModulus", v))}
        {numField("Champion Bonus", settings.knockout.championBonus, (v) => updateKnockout("championBonus", v))}
      </Box>
    </Box>
  );
}
