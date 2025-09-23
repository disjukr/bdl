import type { Nodes } from "./node.ts";

export type VisitFn<T> = (visitor: Visitor, node: T) => void;
export type Visitor = {
  [K in keyof Nodes as `visit${K}`]: VisitFn<Nodes[K]>;
};

const noop = () => {};

export const baseVisitor: Visitor = {
  visitSpan: noop,
  visitAttribute: (visitor, node) => {
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
    visitor.visitSpan(visitor, node.name);
    node.items.forEach((item) => visitor.visitEnumItem(visitor, item));
  },
  visitImport: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    node.path.forEach((pathItem) => visitor.visitSpan(visitor, pathItem));
    node.items.forEach((item) => visitor.visitImportItem(visitor, item));
  },
  visitOneof: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
    node.items.forEach((item) => visitor.visitOneofItem(visitor, item));
  },
  visitProc: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
    visitor.visitTypeExpression(visitor, node.inputType);
    visitor.visitTypeExpression(visitor, node.outputType);
    node.errorType && visitor.visitTypeExpression(visitor, node.errorType);
  },
  visitCustom: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
    visitor.visitTypeExpression(visitor, node.originalType);
  },
  visitStruct: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
    node.fields.forEach((field) => visitor.visitStructField(visitor, field));
  },
  visitUnion: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
    node.items.forEach((item) => visitor.visitUnionItem(visitor, item));
  },
  visitEnumItem: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
  },
  visitImportItem: (visitor, node) => {
    visitor.visitSpan(visitor, node.name);
    node.alias && visitor.visitSpan(visitor, node.alias);
  },
  visitOneofItem: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitTypeExpression(visitor, node.itemType);
  },
  visitStructField: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
    node.question && visitor.visitSpan(visitor, node.question);
    visitor.visitTypeExpression(visitor, node.fieldType);
  },
  visitTypeExpression: (visitor, node) => {
    visitor.visitSpan(visitor, node.valueType);
    node.container && visitor.visitContainer(visitor, node.container);
  },
  visitContainer: (visitor, node) => {
    node.keyType && visitor.visitSpan(visitor, node.keyType);
  },
  visitUnionItem: (visitor, node) => {
    node.attributes.forEach((attr) => visitor.visitAttribute(visitor, attr));
    visitor.visitSpan(visitor, node.name);
    node.fields && node.fields.forEach(
      (field) => visitor.visitStructField(visitor, field),
    );
  },
};
