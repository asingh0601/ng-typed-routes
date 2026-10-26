import ts from 'typescript';

/** A route as understood statically from the source, before naming. */
export interface AnalyzedRoute {
  path: string;
  outlet?: string;
  redirectTo: boolean;
  children: AnalyzedRoute[];
  name?: string;
  queryType?: string;
  /** Runtime parsing hints for non-string query params, derived from the declared type. */
  queryCodec?: Record<string, string>;
  dataType?: string;
  /** `file:line` of the route object literal, for diagnostics. */
  source: string;
}

export interface AnalyzeResult {
  routes: AnalyzedRoute[];
  warnings: string[];
  /** Every source file that contributed routes (used by `watch`). */
  files: string[];
}

const META_TYPE_NAMES = new Set(['TypedRoute']);
const MAX_DEPTH = 50;

/**
 * Reads the exported routes array of `routesFile` and follows `children`,
 * spreads, identifiers and `loadChildren` dynamic imports (including barrel
 * re-exports and `.then(m => m.X)` forms) to produce a static route tree.
 */
export function analyzeRoutes(program: ts.Program, routesFile: string, exportName?: string): AnalyzeResult {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(routesFile);
  if (!sourceFile) {
    throw new Error(`Routes file is not part of the program: ${routesFile}`);
  }
  const ctx = new Context(checker, program);
  const rootExpr = findRoutesExport(sourceFile, exportName, ctx);
  if (!rootExpr) {
    throw new Error(
      exportName
        ? `No exported variable '${exportName}' found in ${routesFile}.`
        : `Could not find an exported routes array in ${routesFile}. ` +
          `Export a 'const routes: Routes = [...]' or pass --export <name>.`,
    );
  }
  ctx.files.add(sourceFile.fileName);
  const routes = ctx.readRoutesArray(rootExpr, 0);
  return { routes, warnings: ctx.warnings, files: [...ctx.files] };
}

class Context {
  readonly warnings: string[] = [];
  readonly files = new Set<string>();
  private readonly visiting = new Set<ts.Node>();

  constructor(
    readonly checker: ts.TypeChecker,
    readonly program: ts.Program,
  ) {}

  warn(node: ts.Node | undefined, message: string): void {
    this.warnings.push(node ? `${location(node)}: ${message}` : message);
  }

  /** Resolves an expression to the array literal it denotes and reads its routes. */
  readRoutesArray(expr: ts.Expression, depth: number): AnalyzedRoute[] {
    if (depth > MAX_DEPTH) {
      this.warn(expr, 'Route nesting too deep; stopping.');
      return [];
    }
    const array = this.resolveArray(expr, depth);
    if (!array) {
      this.warn(expr, 'Could not statically resolve this routes array; skipped.');
      return [];
    }
    if (this.visiting.has(array)) {
      this.warn(expr, 'Circular route reference; skipped.');
      return [];
    }
    this.visiting.add(array);
    this.files.add(array.getSourceFile().fileName);
    const routes: AnalyzedRoute[] = [];
    for (const element of array.elements) {
      if (ts.isSpreadElement(element)) {
        routes.push(...this.readRoutesArray(element.expression, depth + 1));
        continue;
      }
      const obj = this.resolveObject(element, depth);
      if (!obj) {
        this.warn(element, 'Route element is not a statically known object literal; skipped.');
        continue;
      }
      const route = this.readRoute(obj, element, depth);
      if (route) routes.push(route);
    }
    this.visiting.delete(array);
    return routes;
  }

  /** Unwraps casts and follows identifiers/exports until an array literal is found. */
  resolveArray(expr: ts.Expression, depth: number): ts.ArrayLiteralExpression | undefined {
    const e = unwrap(expr);
    if (ts.isArrayLiteralExpression(e)) return e;
    if (ts.isCallExpression(e)) {
      const callee = unwrap(e.expression);
      // defineRoutes([...]) from the zero-codegen mode is transparent.
      if (ts.isIdentifier(callee) && callee.text === 'defineRoutes' && e.arguments.length > 0) {
        return this.resolveArray(e.arguments[0], depth);
      }
      return undefined;
    }
    if (ts.isAwaitExpression(e)) return this.resolveArray(e.expression, depth);
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) {
      const init = this.initializerOf(e);
      return init ? this.resolveArray(init, depth + 1) : undefined;
    }
    return undefined;
  }

  resolveObject(expr: ts.Expression, depth: number): ts.ObjectLiteralExpression | undefined {
    const e = unwrap(expr);
    if (ts.isObjectLiteralExpression(e)) return e;
    if (depth > MAX_DEPTH) return undefined;
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) {
      const init = this.initializerOf(e);
      return init ? this.resolveObject(init, depth + 1) : undefined;
    }
    return undefined;
  }

  /** Follows a symbol (through aliases/re-exports) to its variable initializer. */
  initializerOf(node: ts.Expression): ts.Expression | undefined {
    const symbol = this.resolveSymbol(this.checker.getSymbolAtLocation(node));
    return this.initializerOfSymbol(symbol);
  }

  initializerOfSymbol(symbol: ts.Symbol | undefined): ts.Expression | undefined {
    if (!symbol) return undefined;
    const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (!decl) return undefined;
    this.files.add(decl.getSourceFile().fileName);
    if (ts.isVariableDeclaration(decl) && decl.initializer) return decl.initializer;
    if (ts.isExportAssignment(decl)) return decl.expression;
    if (ts.isShorthandPropertyAssignment(decl)) {
      return this.initializerOfSymbol(this.checker.getShorthandAssignmentValueSymbol(decl));
    }
    if (ts.isPropertyAssignment(decl)) return decl.initializer;
    if (ts.isBindingElement(decl)) {
      // const { X } = await import('./x') — resolve via the module's export of the same name
      const name = decl.propertyName ?? decl.name;
      const parent = decl.parent.parent;
      if (ts.isVariableDeclaration(parent) && parent.initializer && ts.isIdentifier(name)) {
        const moduleSymbol = this.moduleSymbolOfImportCall(unwrap(parent.initializer));
        if (moduleSymbol) return this.initializerOfSymbol(this.exportOf(moduleSymbol, name.text));
      }
    }
    return undefined;
  }

  resolveSymbol(symbol: ts.Symbol | undefined): ts.Symbol | undefined {
    if (!symbol) return undefined;
    let current = symbol;
    for (let i = 0; i < 20 && current.flags & ts.SymbolFlags.Alias; i++) {
      const next = this.checker.getAliasedSymbol(current);
      if (!next || next === current) break;
      current = next;
    }
    return current;
  }

  exportOf(moduleSymbol: ts.Symbol, name: string): ts.Symbol | undefined {
    const exports = this.checker.getExportsOfModule(moduleSymbol);
    const found = exports.find((s) => s.name === name);
    return this.resolveSymbol(found);
  }

  /** Module symbol for `import('./x')`, falling back to manual module resolution. */
  moduleSymbolOfImportCall(expr: ts.Expression): ts.Symbol | undefined {
    const e = unwrap(expr);
    if (ts.isAwaitExpression(e)) return this.moduleSymbolOfImportCall(e.expression);
    if (!ts.isCallExpression(e) || e.expression.kind !== ts.SyntaxKind.ImportKeyword) return undefined;
    const arg = e.arguments[0];
    if (!arg || !ts.isStringLiteralLike(arg)) return undefined;
    const direct = this.checker.getSymbolAtLocation(arg);
    if (direct && direct.flags & ts.SymbolFlags.ValueModule) return direct;
    const containing = e.getSourceFile().fileName;
    const resolved = ts.resolveModuleName(arg.text, containing, this.program.getCompilerOptions(), ts.sys);
    const fileName = resolved.resolvedModule?.resolvedFileName;
    const sf = fileName ? this.program.getSourceFile(fileName) : undefined;
    return sf ? this.checker.getSymbolAtLocation(sf) : undefined;
  }

  readRoute(obj: ts.ObjectLiteralExpression, element: ts.Expression, depth: number): AnalyzedRoute | undefined {
    const props = this.collectProperties(obj, depth);
    const pathInit = props.get('path');
    let path: string | undefined;
    if (pathInit) {
      path = this.stringValue(pathInit);
      if (path === undefined) {
        this.warn(pathInit, "Route 'path' is not a string literal; route skipped.");
        return undefined;
      }
    } else if (props.has('matcher')) {
      this.warn(obj, 'Routes with a custom matcher are not supported; skipped.');
      return undefined;
    } else {
      path = '';
    }

    const route: AnalyzedRoute = {
      path,
      redirectTo: props.has('redirectTo'),
      children: [],
      source: location(obj),
    };
    const outletInit = props.get('outlet');
    if (outletInit) {
      const outlet = this.stringValue(outletInit);
      if (outlet && outlet !== 'primary') route.outlet = outlet;
    }

    const childrenInit = props.get('children');
    if (childrenInit) {
      route.children.push(...this.readRoutesArray(childrenInit, depth + 1));
    }
    const loadChildrenInit = props.get('loadChildren');
    if (loadChildrenInit) {
      const lazy = this.resolveLoadChildren(loadChildrenInit);
      if (lazy) {
        route.children.push(...this.readRoutesArray(lazy, depth + 1));
      } else {
        this.warn(loadChildrenInit, "Could not follow 'loadChildren'; its routes are not generated.");
      }
    }

    this.readMeta(element, route);
    return route;
  }

  /** Flattens `{ ...base, path: 'x' }` into a name → initializer map (later wins). */
  collectProperties(obj: ts.ObjectLiteralExpression, depth: number): Map<string, ts.Expression> {
    const props = new Map<string, ts.Expression>();
    for (const member of obj.properties) {
      if (ts.isSpreadAssignment(member)) {
        const inner = this.resolveObject(member.expression, depth + 1);
        if (inner) {
          for (const [k, v] of this.collectProperties(inner, depth + 1)) props.set(k, v);
        } else {
          this.warn(member, 'Spread in route object could not be resolved; ignored.');
        }
        continue;
      }
      const name = propertyName(member.name);
      if (name === undefined) continue;
      if (ts.isPropertyAssignment(member)) {
        props.set(name, member.initializer);
      } else if (ts.isShorthandPropertyAssignment(member)) {
        props.set(name, member.name);
      }
    }
    return props;
  }

  stringValue(expr: ts.Expression): string | undefined {
    const e = unwrap(expr);
    if (ts.isStringLiteralLike(e)) return e.text;
    if (ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    const type = this.checker.getTypeAtLocation(e);
    if (type.isStringLiteral()) return type.value;
    return undefined;
  }

  /** Returns the expression that yields the lazy routes array, or undefined. */
  resolveLoadChildren(init: ts.Expression): ts.Expression | undefined {
    const fn = unwrap(init);
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) {
      // loadChildren: someFunction — try to follow the identifier
      if (ts.isIdentifier(fn) || ts.isPropertyAccessExpression(fn)) {
        const target = this.initializerOf(fn);
        return target ? this.resolveLoadChildren(target) : undefined;
      }
      return undefined;
    }
    const returned = returnedExpression(fn.body);
    if (!returned) return undefined;
    return this.resolveLazyExpression(returned);
  }

  private resolveLazyExpression(expr: ts.Expression): ts.Expression | undefined {
    const e = unwrap(expr);
    if (ts.isAwaitExpression(e)) return this.resolveLazyExpression(e.expression);

    // import('./x') → default export
    const moduleSymbol = this.moduleSymbolOfImportCall(e);
    if (moduleSymbol) {
      const def = this.exportOf(moduleSymbol, 'default');
      const init = this.initializerOfSymbol(def);
      if (!init) this.warn(e, "Lazy module has no default export; use '.then(m => m.ROUTES)'.");
      return init;
    }

    // import('./x').then(cb)
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'then') {
      const importModule = this.moduleSymbolOfImportCall(e.expression.expression);
      const cb = e.arguments[0] ? unwrap(e.arguments[0]) : undefined;
      if (!importModule || !cb) return undefined;
      const exportName = this.exportNameFromCallback(cb);
      if (!exportName) {
        this.warn(cb, "Could not read the export name from the '.then' callback.");
        return undefined;
      }
      return this.initializerOfSymbol(this.exportOf(importModule, exportName));
    }

    // (await import('./x')).routes
    if (ts.isPropertyAccessExpression(e)) {
      const moduleFromAccess = this.moduleSymbolOfImportCall(e.expression);
      if (moduleFromAccess) return this.initializerOfSymbol(this.exportOf(moduleFromAccess, e.name.text));
      return this.initializerOf(e);
    }
    if (ts.isIdentifier(e)) return this.initializerOf(e);
    if (ts.isArrayLiteralExpression(e)) return e;
    return undefined;
  }

  /** `m => m.X`, `m => m.default`, `({ X }) => X`, `({ X: y }) => y`, `m => { return m.X; }`. */
  private exportNameFromCallback(cb: ts.Expression): string | undefined {
    if (!ts.isArrowFunction(cb) && !ts.isFunctionExpression(cb)) return undefined;
    const param = cb.parameters[0];
    const returned = returnedExpression(cb.body);
    if (!param || !returned) return undefined;
    const r = unwrap(returned);
    if (ts.isIdentifier(param.name)) {
      if (ts.isPropertyAccessExpression(r) && ts.isIdentifier(r.expression) && r.expression.text === param.name.text) {
        return r.name.text;
      }
      if (ts.isElementAccessExpression(r) && ts.isStringLiteralLike(r.argumentExpression)) {
        return r.argumentExpression.text;
      }
      if (ts.isIdentifier(r) && r.text === param.name.text) return 'default';
      return undefined;
    }
    if (ts.isObjectBindingPattern(param.name) && ts.isIdentifier(r)) {
      for (const el of param.name.elements) {
        if (ts.isIdentifier(el.name) && el.name.text === r.text) {
          const prop = el.propertyName;
          return prop && ts.isIdentifier(prop) ? prop.text : el.name.text;
        }
      }
    }
    return undefined;
  }

  /** Reads `{...} satisfies TypedRoute<{ name; query; data }>`. */
  private readMeta(element: ts.Expression, route: AnalyzedRoute): void {
    const typeNode = satisfiesTypeOf(element);
    if (!typeNode) return;
    if (!ts.isTypeReferenceNode(typeNode) || !typeNode.typeArguments?.length) return;
    const refName = ts.isIdentifier(typeNode.typeName) ? typeNode.typeName.text : typeNode.typeName.right.text;
    if (!META_TYPE_NAMES.has(refName)) return;
    const metaType = this.checker.getTypeFromTypeNode(typeNode.typeArguments[0]);
    for (const prop of metaType.getProperties()) {
      const propType = this.propertyType(prop, typeNode);
      switch (prop.name) {
        case 'name': {
          if (propType.isStringLiteral()) route.name = propType.value;
          else this.warn(typeNode, "TypedRoute 'name' must be a string literal; ignored.");
          break;
        }
        case 'query': {
          route.queryType = this.serializeType(propType, typeNode, 0);
          const codec = this.queryCodec(propType, typeNode);
          if (Object.keys(codec).length > 0) route.queryCodec = codec;
          break;
        }
        case 'data':
          route.dataType = this.serializeType(propType, typeNode, 0);
          break;
        default:
          this.warn(typeNode, `Unknown TypedRoute option '${prop.name}'; ignored.`);
      }
    }
  }

  /** `{ page?: number; all?: boolean; ids?: number[] }` → `{ page: 'number', all: 'boolean', ids: 'number[]' }`. */
  private queryCodec(queryType: ts.Type, at: ts.Node): Record<string, string> {
    const codec: Record<string, string> = {};
    for (const prop of queryType.getProperties()) {
      const kind = this.codecKind(this.propertyType(prop, at));
      if (kind && kind !== 'string') codec[prop.name] = kind;
    }
    return codec;
  }

  private codecKind(type: ts.Type): string | undefined {
    const members = type.isUnion() ? type.types.filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))) : [type];
    if (members.length === 0) return undefined;
    const every = (pred: (t: ts.Type) => boolean) => members.every(pred);
    if (every((t) => !!(t.flags & ts.TypeFlags.NumberLike))) return 'number';
    if (every((t) => !!(t.flags & ts.TypeFlags.BooleanLike))) return 'boolean';
    if (every((t) => !!(t.flags & ts.TypeFlags.StringLike))) return 'string';
    if (every((t) => this.checker.isArrayType(t))) {
      const elems = members.map((t) => this.checker.getTypeArguments(t as ts.TypeReference)[0]).filter(Boolean);
      if (elems.every((e) => !!(e.flags & ts.TypeFlags.NumberLike))) return 'number[]';
      if (elems.every((e) => !!(e.flags & ts.TypeFlags.StringLike))) return 'string[]';
    }
    return undefined;
  }

  private propertyType(prop: ts.Symbol, at: ts.Node): ts.Type {
    const type = this.checker.getTypeOfSymbolAtLocation(prop, at);
    if (prop.flags & ts.SymbolFlags.Optional && type.isUnion()) {
      const nonUndefined = type.types.filter((t) => !(t.flags & ts.TypeFlags.Undefined));
      if (nonUndefined.length === 1) return nonUndefined[0];
      return this.checker.getNonNullableType(type);
    }
    return type;
  }

  /** Prints a type as source text that is valid in the generated file (inline, no imports). */
  serializeType(type: ts.Type, at: ts.Node, depth: number): string {
    const fallback = () =>
      this.checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias);
    if (depth > 8) return fallback();
    if (type.isStringLiteral()) return quote(type.value);
    if (type.isNumberLiteral()) return String(type.value);
    if (type.flags & ts.TypeFlags.BooleanLiteral) return fallback();
    if (type.isUnion()) {
      // boolean is a union of true|false; print it as written
      if (type.flags & ts.TypeFlags.Boolean) return 'boolean';
      const parts = type.types.map((t) => this.serializeType(t, at, depth + 1));
      return [...new Set(parts)].join(' | ');
    }
    if (type.isIntersection()) {
      return type.types.map((t) => this.serializeType(t, at, depth + 1)).join(' & ');
    }
    if (this.checker.isArrayType(type)) {
      const [elem] = this.checker.getTypeArguments(type as ts.TypeReference);
      const inner = elem ? this.serializeType(elem, at, depth + 1) : 'unknown';
      const needsParens = inner.includes(' | ') || inner.includes(' & ');
      const readonly = this.checker.typeToString(type).startsWith('readonly ') ? 'readonly ' : '';
      return `${readonly}${needsParens ? `(${inner})` : inner}[]`;
    }
    if (this.checker.isTupleType(type)) return fallback();
    if (type.flags & ts.TypeFlags.Object) {
      const obj = type as ts.ObjectType;
      if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) return fallback();
      if (obj.objectFlags & ts.ObjectFlags.Class) return fallback();
      const props = type.getProperties();
      const indexInfos = this.checker.getIndexInfosOfType(type);
      if (props.length === 0 && indexInfos.length === 0) return '{}';
      const members: string[] = [];
      for (const info of indexInfos) {
        const keyType = this.serializeType(info.keyType, at, depth + 1);
        members.push(`[key: ${keyType}]: ${this.serializeType(info.type, at, depth + 1)}`);
      }
      for (const p of props) {
        const optional = p.flags & ts.SymbolFlags.Optional ? '?' : '';
        const readonly = isReadonlySymbol(p) ? 'readonly ' : '';
        const pt = this.propertyType(p, at);
        members.push(`${readonly}${propertyKey(p.name)}${optional}: ${this.serializeType(pt, at, depth + 1)}`);
      }
      return `{ ${members.join('; ')} }`;
    }
    return fallback();
  }
}

function findRoutesExport(sf: ts.SourceFile, exportName: string | undefined, ctx: Context): ts.Expression | undefined {
  const candidates: { name: string; init: ts.Expression; score: number }[] = [];
  for (const stmt of sf.statements) {
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      candidates.push({ name: 'default', init: stmt.expression, score: exportName === 'default' ? 100 : 1 });
      continue;
    }
    if (!ts.isVariableStatement(stmt)) continue;
    const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const name = decl.name.text;
      if (exportName) {
        if (name === exportName) return decl.initializer;
        continue;
      }
      let score = 0;
      const typeText = decl.type?.getText(sf) ?? '';
      if (/\bRoutes\b|\bRoute\s*\[\s*\]/.test(typeText)) score += 10;
      const init = unwrap(decl.initializer);
      if (ts.isSatisfiesExpression(decl.initializer) || ts.isAsExpression(decl.initializer)) {
        const t = (decl.initializer as ts.SatisfiesExpression | ts.AsExpression).type.getText(sf);
        if (/\bRoutes\b|\bRoute\s*\[\s*\]/.test(t)) score += 10;
      }
      if (ts.isCallExpression(init) && ts.isIdentifier(unwrap(init.expression)) && (unwrap(init.expression) as ts.Identifier).text === 'defineRoutes') {
        score += 10;
      }
      if (/routes/i.test(name)) score += 5;
      if (ts.isArrayLiteralExpression(init)) score += 1;
      if (score > 0) candidates.push({ name, init: decl.initializer, score });
    }
  }
  if (exportName) return undefined;
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    ctx.warn(undefined, `Several exports look like routes (${candidates.map((c) => c.name).join(', ')}); using '${candidates[0].name}'. Pass --export to choose.`);
  }
  return candidates[0]?.init;
}

function satisfiesTypeOf(node: ts.Node): ts.TypeNode | undefined {
  let current: ts.Node = node;
  // The element itself may be the satisfies expression, or wrapped in parentheses.
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  if (ts.isSatisfiesExpression(current)) return current.type;
  // Or the object literal might sit inside `(obj satisfies X)`.
  let parent = node.parent;
  while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
  if (parent && ts.isSatisfiesExpression(parent)) return parent.type;
  return undefined;
}

export function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr;
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e) || ts.isNonNullExpression(e)) {
      e = e.expression;
    } else {
      return e;
    }
  }
}

function returnedExpression(body: ts.ConciseBody): ts.Expression | undefined {
  if (!ts.isBlock(body)) return body;
  for (const stmt of body.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) return stmt.expression;
  }
  return undefined;
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function isReadonlySymbol(symbol: ts.Symbol): boolean {
  const decl = symbol.valueDeclaration;
  if (!decl || !ts.canHaveModifiers(decl)) return false;
  return ts.getModifiers(decl)?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false;
}

function propertyKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : quote(name);
}

export function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

export function location(node: ts.Node): string {
  const sf = node.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `${sf.fileName}:${line + 1}`;
}
