import type { BonValue } from "../generated/bon.ts";
import type { AttributeSlot, BdlStandard } from "../generated/standard.ts";
import parseBon from "../parser/bon/parser.ts";
import { fillBonTypes } from "../bon-typer.ts";
import { toPojo } from "../conventional/bon.ts";
import ir from "../ir-bdl.ts";

export type { AttributeSlot, BdlStandard };

export function fromBonText(bonText: string): BdlStandard {
  return fromBonValue(parseBon(bonText));
}

export function fromBonValue(bonValue: BonValue): BdlStandard {
  const typeFilledBonValue = fillBonTypes(
    ir,
    bonValue,
    "bdl.standard.BdlStandard",
  );
  return toPojo(typeFilledBonValue, ir) as BdlStandard;
}
