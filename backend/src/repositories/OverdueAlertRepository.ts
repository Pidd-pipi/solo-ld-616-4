import type { OverdueAlert } from "../models/OverdueAlert";
import { inMemoryStore } from "./inMemoryStore";

export const overdueAlertRepository = {
  findAll: (): OverdueAlert[] => inMemoryStore.table("overdueAlert"),

  save: (row: OverdueAlert): OverdueAlert => {
    inMemoryStore.table("overdueAlert").push(row);
    return row;
  },

  nextId: (): number => inMemoryStore.nextId("overdueAlert")
};
