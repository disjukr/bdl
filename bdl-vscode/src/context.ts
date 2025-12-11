import * as vscode from "vscode";
import { parse as parseYaml } from "jsr:@std/yaml@1";
import type * as bdlAst from "@disjukr/bdl/ast";
import { getAttributeContent, slice } from "@disjukr/bdl/ast/misc";
import {
  type BdlConfig,
  fromBonText as parseConfigFromBonText,
} from "@disjukr/bdl/io/config";
import {
  type BdlStandard,
  fromBonText as parseStandardFromBonText,
} from "@disjukr/bdl/io/standard";
import parseBdl from "@disjukr/bdl/parser";

export class BdlShortTermContext {
  #workspaceFolder: vscode.WorkspaceFolder | undefined;
  #docContexts = new Map<
    vscode.TextDocument,
    BdlShortTermDocumentContext
  >();
  #loadBdlConfigResult: LoadBdlConfigResult | undefined;
  #loadBdlStandardResult: LoadStandardResult | undefined;

  constructor(
    public extensionContext: vscode.ExtensionContext,
    public entryDocument: vscode.TextDocument,
  ) {}

  get entryDocContext() {
    return this.getDocContext(this.entryDocument);
  }

  get workspaceFolder() {
    if (this.#workspaceFolder) return this.#workspaceFolder;
    this.#workspaceFolder = vscode.workspace.getWorkspaceFolder(
      this.entryDocument.uri,
    );
    return this.#workspaceFolder;
  }

  getDocContext(
    document: vscode.TextDocument,
  ): BdlShortTermDocumentContext {
    let context = this.#docContexts.get(document);
    if (context) return context;
    context = new BdlShortTermDocumentContext(this, document);
    this.#docContexts.set(document, context);
    return context;
  }

  async getBdlConfig(): Promise<BdlConfig | undefined> {
    if (!this.workspaceFolder) return;
    if (!this.#loadBdlConfigResult) {
      this.#loadBdlConfigResult = await loadBdlConfig(this.workspaceFolder.uri);
    }
    if (!this.#loadBdlConfigResult.success) return;
    return this.#loadBdlConfigResult.bdlConfig;
  }

  async getBdlConfigDirectory(): Promise<vscode.Uri | undefined> {
    if (!this.workspaceFolder) return;
    if (!this.#loadBdlConfigResult) {
      this.#loadBdlConfigResult = await loadBdlConfig(this.workspaceFolder.uri);
    }
    if (!this.#loadBdlConfigResult.success) return;
    return this.#loadBdlConfigResult.configDirectory;
  }

  async getBdlStandard(): Promise<BdlStandard | undefined> {
    if (!this.#loadBdlStandardResult) {
      const standardId = this.entryDocContext.standardId;
      if (!standardId) return;
      const bdlConfig = await this.getBdlConfig();
      if (!this.#loadBdlConfigResult?.success) return;
      if (!bdlConfig?.standards?.[standardId]) return;
      const standardPath = bdlConfig.standards[standardId];
      const { configDirectory } = this.#loadBdlConfigResult;
      const standardUri = vscode.Uri.joinPath(configDirectory, standardPath);
      this.#loadBdlStandardResult = await loadStandard(standardUri);
    }
    if (!this.#loadBdlStandardResult.success) return;
    return this.#loadBdlStandardResult.bdlStandard;
  }
}

export class BdlShortTermDocumentContext {
  #ast: bdlAst.BdlAst | undefined;
  #standardAttr: LoadResult<bdlAst.Attribute> | undefined;
  #moduleInfo:
    | LoadResult<{ packageName: string; modulePath: string }>
    | undefined;

  constructor(
    public context: BdlShortTermContext,
    public document: vscode.TextDocument,
  ) {}

  get text() {
    return this.document.getText();
  }

  get ast() {
    if (this.#ast) return this.#ast;
    this.#ast = parseBdl(this.text);
    return this.#ast;
  }

  get standardAttr(): bdlAst.Attribute | undefined {
    if (!this.#standardAttr) {
      const standardAttr = this.ast.attributes.find(
        (attr) => slice(this.text, attr.name) === "standard",
      );
      this.#standardAttr = standardAttr
        ? { success: true, ...standardAttr }
        : { success: false };
    }
    if (!this.#standardAttr.success) return undefined;
    return this.#standardAttr;
  }

  get standardId(): string | undefined {
    const standardAttr = this.standardAttr;
    if (!standardAttr?.content) return undefined;
    return getAttributeContent(this.text, standardAttr);
  }

  async getModulePath(): Promise<string | undefined> {
    get: if (!this.#moduleInfo) {
      const bdlConfig = await this.context.getBdlConfig();
      if (!bdlConfig?.paths) return;
      const cfgDir = await this.context.getBdlConfigDirectory();
      if (!cfgDir) return;
      const documentPath = this.document.uri.path;
      const pathEntries = Object.entries(bdlConfig.paths);
      for (const [packageName, packagePath] of pathEntries) {
        const absPkgPath = vscode.Uri.joinPath(cfgDir, packagePath).path;
        if (documentPath.startsWith(absPkgPath)) {
          const subPath = documentPath.slice(absPkgPath.length);
          const names = subPath.split("/").filter(Boolean);
          const modulePath = `${packageName}.${names.join(".")}`;
          this.#moduleInfo = { success: true, packageName, modulePath };
          break get;
        }
      }
      this.#moduleInfo = { success: false };
    }
    if (!this.#moduleInfo.success) return;
    return this.#moduleInfo.modulePath;
  }
}

type LoadResult<T> = T & { success: true } | { success: false };

type LoadStandardResult = LoadResult<{
  standardDirectory: vscode.Uri;
  bdlStandard: BdlStandard;
}>;
async function loadStandard(
  standardPath: vscode.Uri,
): Promise<LoadStandardResult> {
  try {
    const textDocument = await vscode.workspace.openTextDocument(standardPath);
    const standardDirectory = vscode.Uri.joinPath(standardPath, "..");
    const standardText = textDocument.getText();
    const bdlStandard = parseYaml(standardText) as BdlStandard;
    return { success: true, standardDirectory, bdlStandard };
  } catch { /* ignore */ }
  return { success: false };
}

type LoadBdlConfigResult = LoadResult<{
  configDirectory: vscode.Uri;
  bdlConfig: BdlConfig;
}>;
async function loadBdlConfig(
  workspaceFolderUri: vscode.Uri,
): Promise<LoadBdlConfigResult> {
  const configPath = await findBdlConfigPath(workspaceFolderUri);
  if (!configPath) return { success: false };
  try {
    const textDocument = await vscode.workspace.openTextDocument(configPath);
    const configDirectory = vscode.Uri.joinPath(configPath, "..");
    const configText = textDocument.getText();
    const bdlConfig = parseYaml(configText) as BdlConfig;
    return { success: true, configDirectory, bdlConfig };
  } catch { /* ignore */ }
  return { success: false };
}

async function findBdlConfigPath(
  workspaceFolderUri: vscode.Uri,
): Promise<vscode.Uri | undefined> {
  const candidates = getBdlConfigCandidates(workspaceFolderUri);
  for (const candidateUri of candidates) {
    try {
      await vscode.workspace.fs.stat(candidateUri);
      return candidateUri;
    } catch { /* ignore */ }
  }
  return;
}

function getBdlConfigCandidates(cwd: vscode.Uri): vscode.Uri[] {
  const result: vscode.Uri[] = [];
  let dir = cwd;
  while (true) {
    result.push(vscode.Uri.joinPath(dir, "bdl.yml"));
    result.push(vscode.Uri.joinPath(dir, "bdl.yaml"));
    const parent = vscode.Uri.joinPath(dir, "..");
    if (parent.path === dir.path) break;
    dir = parent;
  }
  return result;
}
