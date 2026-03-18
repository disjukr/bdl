export function resolveModulePath(
  packageName: string,
  packageRootPath: string,
  documentPath: string,
): string | undefined {
  const normalizedPackageRoot = packageRootPath.endsWith("/")
    ? packageRootPath.slice(0, -1)
    : packageRootPath;
  const packagePrefix = `${normalizedPackageRoot}/`;
  if (!documentPath.startsWith(packagePrefix)) return undefined;

  const relativeDocumentPath = documentPath.slice(packagePrefix.length);
  if (!relativeDocumentPath.endsWith(".bdl")) return undefined;

  const relativeModulePath = relativeDocumentPath
    .slice(0, -".bdl".length)
    .split("/")
    .filter(Boolean)
    .join(".");
  if (!relativeModulePath) return undefined;

  return `${packageName}.${relativeModulePath}`;
}
