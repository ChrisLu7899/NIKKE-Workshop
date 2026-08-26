// SPDX-License-Identifier: GPL-3.0-or-later
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import ManagementPage from "./management.jsx";

document.getElementById("management-loading")?.remove();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CssBaseline />
    <ManagementPage />
  </StrictMode>,
);
