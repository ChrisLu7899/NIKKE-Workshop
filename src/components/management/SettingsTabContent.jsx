// SPDX-License-Identifier: GPL-3.0-or-later
import { memo } from "react";
import { Box, Stack, Switch, Typography } from "@mui/material";

const SettingsTabContent = ({
  t,
  forceSimulatedStatsLevel400,
  onToggleForceSimulatedStatsLevel400,
}) => (
    <Stack spacing={3}>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body1">
            {t("forceSimulatedStatsLevel400")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("forceSimulatedStatsLevel400Help")}
          </Typography>
        </Box>
        <Switch
          checked={Boolean(forceSimulatedStatsLevel400)}
          onChange={onToggleForceSimulatedStatsLevel400}
          inputProps={{ "aria-label": t("forceSimulatedStatsLevel400") }}
        />
      </Box>
    </Stack>
);

export default memo(SettingsTabContent);
