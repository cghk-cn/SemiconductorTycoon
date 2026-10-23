import type { StateSnapshot } from "../types";
import { FabFloorView } from "./FabFloorView";

export interface FabPanelProps {
  state: StateSnapshot;
  onBuyEquipment: (eqId: string) => void;
}

export function FabPanel({ state, onBuyEquipment }: FabPanelProps) {
  return <FabFloorView state={state} onBuyEquipment={onBuyEquipment} />;
}
