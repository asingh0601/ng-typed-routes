// Debug helper: prints the Angular type-check block generated for a component.
// Usage: node scripts/dump-tcb.mjs <tsconfig> <file.ts> <ClassName>
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ng = require('@angular/compiler-cli');

const [tsconfigArg, fileArg, className] = process.argv.slice(2);
const tsconfig = resolve(tsconfigArg);
const { rootNames, options } = ng.readConfiguration(tsconfig);
options._enableTemplateTypeChecker = true;
const host = ng.createCompilerHost({ options });
const program = new ng.NgtscProgram(rootNames, options, host);
const diags = program.getNgSemanticDiagnostics();
for (const d of diags) console.log('DIAG:', ts.flattenDiagnosticMessageText(d.messageText, '\n'));
const tsProgram = program.getTsProgram();
const sf = tsProgram.getSourceFile(resolve(fileArg));
const checker = program.compiler.getTemplateTypeChecker();
ts.forEachChild(sf, (node) => {
  if (ts.isClassDeclaration(node) && node.name?.text === className) {
    console.log(checker.getTypeCheckBlock(node)?.getText() ?? 'NO TCB');
  }
});
