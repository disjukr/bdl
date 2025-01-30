import type { BdlIrRef } from "./ir-ref.ts";

export interface BdlIrDiff {
  modules: DiffItem[];
  defs: DiffItem[];
}

export type DiffItem = Keep | Add | Remove | Modify;

export interface Keep {
  type: "Keep";
  prevRef: BdlIrRef;
}

export interface Add {
  type: "Add";
  nextRef: BdlIrRef;
}

export interface Remove {
  type: "Remove";
  prevRef: BdlIrRef;
}

export interface Modify {
  type: "Modify";
  prevRef: BdlIrRef;
  nextRef: BdlIrRef;
  items: DiffItem[];
}
