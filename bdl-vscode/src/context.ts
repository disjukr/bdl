import * as vscode from "vscode";
import { parse as parseYml } from "jsr:@std/yaml@1";
import type { BdlAst } from "@disjukr/bdl/ast";
import type { BdlConfig } from "@disjukr/bdl/io/config";
import parseBdl from "@disjukr/bdl/parser";

export class BdlShortTermContext {
  #workspaceFolder: vscode.WorkspaceFolder | undefined;
  #docContexts = new Map<
    vscode.TextDocument,
    BdlShortTermDocumentContext
  >();
  #loadBdlConfigResult: LoadBdlConfigResult | undefined;

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
    const result = await loadBdlConfig(this.workspaceFolder.uri);
    if (!result) return;
    this.#loadBdlConfigResult = result;
    return this.#loadBdlConfigResult.configYml;
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
}

interface LoadBdlConfigResult {
  configDirectory: vscode.Uri;
  configYml: BdlConfig;
}
async function loadBdlConfig(
  workspaceFolderUri: vscode.Uri,
): Promise<LoadBdlConfigResult | undefined> {
  try {
    const configPath = await findBdlConfigPath(workspaceFolderUri);
    if (!configPath) return;
    const textDocument = await vscode.workspace.openTextDocument(configPath);
    const configDirectory = vscode.Uri.joinPath(configPath, "..");
    const configYmlText = textDocument.getText();
    const configYml = parseYml(configYmlText) as BdlConfig;
    return { configDirectory, configYml };
  } catch { /* ignore */ }
  return;
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
