import type { BdlStandard } from "../../generated/standard.ts";
import standard from "../../generated/json/conventional.json" with {
  type: "json",
};
export default standard as unknown as BdlStandard;

import yamlText from "../../../../standards/conventional.yaml" with {
  type: "text",
};
export { yamlText };
