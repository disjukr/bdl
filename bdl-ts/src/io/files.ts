import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Enumerate BDL files without following symlinks. */
export function* walkBdlFiles(root: string): Generator<{ path: string }> {
 for (const entry of readdirSync(root, { withFileTypes: true })) {
  const path = join(root, entry.name);
  if (entry.isDirectory()) yield* walkBdlFiles(path);
  else if (entry.isFile() && entry.name.endsWith(".bdl")) yield { path };
 }
}
