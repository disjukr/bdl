import parseBdl from 'bdl/parser';
import type { BdlIr } from 'bdl/ir';
import { defineStruct } from '@disjukr/bdl-runtime/data-schema';
import { generateTs } from 'bdl/generator/ts';
const ast = parseBdl('struct User { id: string }');
const ir: BdlIr = { modules: {}, defs: {} };
generateTs({ ir, fileExtension: '.ts', importPathSuffix: '.js' });
defineStruct('test', []);
console.log(ast.statements);
