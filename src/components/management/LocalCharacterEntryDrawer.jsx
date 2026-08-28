// SPDX-License-Identifier: GPL-3.0-or-later

import { Drawer } from "@mui/material";
import CharacterDataEditor from "./CharacterDataEditor.jsx";

export default function LocalCharacterEntryDrawer(props) {
  return (
    <Drawer
      anchor="right"
      open={props.open}
      onClose={props.onClose}
      PaperProps={{ sx: { width: { xs: "min(96vw, 620px)", sm: 620 }, p: 2.5 } }}
    >
      <CharacterDataEditor
        {...props}
        initialCharacterData={props.record}
        onCancel={props.onClose}
      />
    </Drawer>
  );
}
