import { colors } from "../styles/theme";
import { AppMode } from "../types";

interface Props {
  appMode: AppMode;
}

function formatKeybind(key: string, action: string) {
  return (
    <text>
      <span style={{ fg: colors.key }}>{key}</span>
      <span style={{ fg: colors.separator }}> │ </span>
      <span style={{ fg: colors.action }}>{action}</span>
    </text>
  );
}

export default function KeybindHelp({ appMode }: Props) {
  if (
    appMode === AppMode.Search ||
    appMode === AppMode.NewSession ||
    appMode === AppMode.Rename
  ) {
    return (
      <box style={{ flexDirection: "row", gap: 0.5 }}>
        {formatKeybind("Enter", "select")}
        {formatKeybind(" ↑/↓ ", "navigate")}
        {formatKeybind(" Esc ", "cancel")}
      </box>
    );
  }

  return (
    <box style={{ flexDirection: "row", gap: 0.5, flexWrap: "wrap" }}>
      {formatKeybind("j/k", "navigate")}
      {formatKeybind("1-9", "switch")}
      {formatKeybind(" d ", "kill")}
      {formatKeybind(" r ", "rename")}
      {formatKeybind(" n ", "new")}
      {formatKeybind(" i ", "search")}
      {formatKeybind(" R ", "refresh")}
      {formatKeybind(" q ", "quit")}
    </box>
  );
}
