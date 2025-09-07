import * as vscode from "vscode";
import { parse as parseYml } from "jsr:@std/yaml@1";
import { BdlAst } from "@disjukr/bdl/ast";
import { BdlConfig } from "@disjukr/bdl/io/config";
import parseBdl from "@disjukr/bdl/parser";

export class BdlShortTermContext {
  #workspaceFolder: vscode.WorkspaceFolder | undefined;
  #docContexts = new Map<
    vscode.TextDocument,
    BdlShortTermDocumentContext
  >();
  #bdlConfig: BdlConfig | undefined;

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
    if (this.#bdlConfig) return this.#bdlConfig;
    if (!this.workspaceFolder) return;
    this.#bdlConfig = await loadBdlConfig(this.workspaceFolder.uri);
    return this.#bdlConfig;
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

async function loadBdlConfig(
  workspaceFolderUri: vscode.Uri,
): Promise<BdlConfig | undefined> {
  try {
    const textDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspaceFolderUri, "bdl.yml"),
    );
    const bdlYmlText = textDocument.getText();
    const bdlYml = parseYml(bdlYmlText);
    return bdlYml as BdlConfig;
  } catch { /* ignore */ }
}
