import type { Nodes } from "./node.ts";

export type VisitFn<T> = (visitor: Visitor, node: T) => void;
export type Visitor = {
  [K in keyof Nodes as `visit${K}`]: VisitFn<Nodes[K]>;
};

const noop = () => {};

export const baseVisitor: Visitor = {
  visitSpan: noop,
  visitAttribute: (visitor, node) => {
    visitor.visitAttributeSymbol(visitor, node.symbol);
    visitor.visitSpan(visitor, node.name);
    node.content && visitor.visitSpan(visitor, node.content);
  },
  visitBdlAst: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    node.statements.forEach(
      (stmt) => visitor.visitModuleLevelStatement(visitor, stmt),
    );
  },
  visitModuleLevelStatement: (visitor, node) => {
    switch (node.type) {
      case "Enum":
        visitor.visitEnum(visitor, node);
        break;
      case "Import":
        visitor.visitImport(visitor, node);
        break;
      case "Oneof":
        visitor.visitOneof(visitor, node);
        break;
      case "Proc":
        visitor.visitProc(visitor, node);
        break;
      case "Custom":
        visitor.visitCustom(visitor, node);
        break;
      case "Struct":
        visitor.visitStruct(visitor, node);
        break;
      case "Union":
        visitor.visitUnion(visitor, node);
        break;
    }
  },
  visitEnum: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.keyword);
    visitor.visitSpan(visitor, node.name);
    visitor.visitSpan(visitor, node.bracketOpen);
    node.items.forEach((item) => visitor.visitEnumItem(visitor, item));
    visitor.visitSpan(visitor, node.bracketClose);
  },
  visitImport: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.keyword);
    node.path.forEach((pathItem) => visitor.visitPathItem(visitor, pathItem));
    visitor.visitSpan(visitor, node.bracketOpen);
    node.items.forEach((item) => visitor.visitImportItem(visitor, item));
    visitor.visitSpan(visitor, node.bracketClose);
  },
  visitOneof: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.keyword);
    visitor.visitSpan(visitor, node.name);
    visitor.visitSpan(visitor, node.bracketOpen);
    node.items.forEach((item) => visitor.visitOneofItem(visitor, item));
    visitor.visitSpan(visitor, node.bracketClose);
  },
  visitProc: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.keyword);
    visitor.visitSpan(visitor, node.name);
    visitor.visitSpan(visitor, node.eq);
    visitor.visitTypeExpression(visitor, node.inputType);
    visitor.visitSpan(visitor, node.arrow);
    visitor.visitTypeExpression(visitor, node.outputType);
    node.error && visitor.visitThrowsError(visitor, node.error);
  },
  visitCustom: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.keyword);
    visitor.visitSpan(visitor, node.name);
    visitor.visitSpan(visitor, node.eq);
    visitor.visitTypeExpression(visitor, node.originalType);
  },
  visitStruct: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.keyword);
    visitor.visitSpan(visitor, node.name);
    visitor.visitSpan(visitor, node.bracketOpen);
    node.fields.forEach((field) => visitor.visitStructField(visitor, field));
    visitor.visitSpan(visitor, node.bracketClose);
  },
  visitUnion: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.keyword);
    visitor.visitSpan(visitor, node.name);
    visitor.visitSpan(visitor, node.bracketOpen);
    node.items.forEach((item) => visitor.visitUnionItem(visitor, item));
    visitor.visitSpan(visitor, node.bracketClose);
  },
  visitAttributeSymbol: (visitor, node) => {
    switch (node.type) {
      case "Sharp":
        visitor.visitSharp(visitor, node);
        break;
      case "At":
        visitor.visitAt(visitor, node);
        break;
    }
  },
  visitSharp: noop,
  visitAt: noop,
  visitEnumItem: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
    node.comma && visitor.visitSpan(visitor, node.comma);
  },
  visitImportItem: (visitor, node) => {
    visitor.visitSpan(visitor, node.name);
    node.alias && visitor.visitImportAlias(visitor, node.alias);
    node.comma && visitor.visitSpan(visitor, node.comma);
  },
  visitImportAlias: (visitor, node) => {
    visitor.visitSpan(visitor, node.as);
    visitor.visitSpan(visitor, node.name);
  },
  visitPathItem: (visitor, node) => {
    switch (node.type) {
      case "Identifier":
        visitor.visitIdentifier(visitor, node);
        break;
      case "Dot":
        visitor.visitDot(visitor, node);
        break;
    }
  },
  visitIdentifier: noop,
  visitDot: noop,
  visitOneofItem: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitTypeExpression(visitor, node.itemType);
    node.comma && visitor.visitSpan(visitor, node.comma);
  },
  visitThrowsError: (visitor, node) => {
    visitor.visitSpan(visitor, node.keywordThrows);
    visitor.visitTypeExpression(visitor, node.errorType);
  },
  visitStructField: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
    node.question && visitor.visitSpan(visitor, node.question);
    visitor.visitSpan(visitor, node.colon);
    visitor.visitTypeExpression(visitor, node.fieldType);
    node.comma && visitor.visitSpan(visitor, node.comma);
  },
  visitTypeExpression: (visitor, node) => {
    visitor.visitSpan(visitor, node.valueType);
    node.container && visitor.visitContainer(visitor, node.container);
  },
  visitContainer: (visitor, node) => {
    visitor.visitSpan(visitor, node.bracketOpen);
    node.keyType && visitor.visitSpan(visitor, node.keyType);
    visitor.visitSpan(visitor, node.bracketClose);
  },
  visitUnionItem: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
    node.struct && visitor.visitUnionItemStruct(visitor, node.struct);
    node.comma && visitor.visitSpan(visitor, node.comma);
  },
  visitUnionItemStruct: (visitor, node) => {
    visitor.visitSpan(visitor, node.bracketOpen);
    node.fields.forEach((field) => visitor.visitStructField(visitor, field));
    visitor.visitSpan(visitor, node.bracketClose);
  },
};
