import * as vscode from "vscode";
import { parse as parseYml } from "jsr:@std/yaml@1";
import type { BdlAst } from "@disjukr/bdl/ast";
import { span } from "@disjukr/bdl/ast/misc";
import type { BdlConfig } from "@disjukr/bdl/io/config";
import type { BdlStandard } from "@disjukr/bdl/io/standard";
import parseBdl from "@disjukr/bdl/parser";

export class BdlShortTermContext {
  #workspaceFolder: vscode.WorkspaceFolder | undefined;
  #docContexts = new Map<
    vscode.TextDocument,
    BdlShortTermDocumentContext
  >();
  #loadBdlConfigResult: LoadConfigResult<BdlConfig> | undefined;
  #loadBdlStandardResult: LoadConfigResult<BdlStandard> | undefined;

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
    if (this.#loadBdlConfigResult) return this.#loadBdlConfigResult.configYml;
    if (!this.workspaceFolder) return;
    this.#loadBdlConfigResult = await loadBdlConfig(this.workspaceFolder.uri);
    return this.#loadBdlConfigResult?.configYml;
  }

  async getBdlStandard(): Promise<BdlStandard | undefined> {
    if (this.#loadBdlStandardResult) {
      return this.#loadBdlStandardResult.configYml;
    }
    const standardId = this.entryDocContext.standardId;
    if (!standardId) return;
    const bdlConfig = await this.getBdlConfig();
    if (!bdlConfig?.standards?.[standardId]) return;
    const standardPath = bdlConfig.standards[standardId];
    const { configDirectory } = this.#loadBdlConfigResult!;
    const standardUri = vscode.Uri.joinPath(configDirectory, standardPath);
    this.#loadBdlStandardResult = await loadConfig<BdlStandard>(standardUri);
    return this.#loadBdlStandardResult?.configYml;
  }
}

export class BdlShortTermDocumentContext {
  #ast: BdlAst | undefined;

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

  get standardId(): string | undefined {
    const standardAttr = this.ast.attributes.find(
      (attr) => span(this.text, attr.name) === "standard",
    );
    if (!standardAttr?.content) return undefined;
    return span(this.text, standardAttr.content);
  }
}

interface LoadConfigResult<T> {
  configDirectory: vscode.Uri;
  configYml: T;
}

async function loadConfig<T>(configPath: vscode.Uri): Promise<
  LoadConfigResult<T> | undefined
> {
  try {
    const textDocument = await vscode.workspace.openTextDocument(configPath);
    const configDirectory = vscode.Uri.joinPath(configPath, "..");
    const configYmlText = textDocument.getText();
    const configYml = parseYml(configYmlText) as T;
    return { configDirectory, configYml };
  } catch { /* ignore */ }
}

async function loadBdlConfig(
  workspaceFolderUri: vscode.Uri,
): Promise<LoadConfigResult<BdlConfig> | undefined> {
  const configPath = await findBdlConfigPath(workspaceFolderUri);
  if (!configPath) return;
  return loadConfig(configPath);
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
    const parent = vscode.Uri.joinPath(dir, "..");
    if (parent.path === dir.path) break;
    dir = parent;
  }
  return result;
}
