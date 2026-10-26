// Debug helper: prints the Angular type-check block generated for a component,
// plus the type-constructor declarations of the type-check file.
// Usage: node scripts/dump-tcb.mjs <tsconfig> <file.ts> <ClassName> [--full]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ng = require('@angular/compiler-cli');

const [tsconfigArg, fileArg, className, flag] = process.argv.slice(2);
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
    const tcb = checker.getTypeCheckBlock(node);
    if (!tcb) {
      console.log('NO TCB');
      return;
    }
    const text = tcb.getSourceFile().text;
    if (flag === '--full') {
      console.log(text);
      return;
    }
    const lines = text.split('\n');
    console.log(lines.filter((l) => /_ctor\d|^import /.test(l) && !/^(var )?_t\d/.test(l)).join('\n'));
    console.log('---- TCB ----');
    console.log(tcb.getText());
  }
});
