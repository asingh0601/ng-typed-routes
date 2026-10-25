/*
 * Public API Surface of ng-typed-routes
 */

export {
  route,
  meta,
  buildPath,
  extractParamNames,
  type AnyRoute,
  type RouteDef,
  type RouteMeta,
  type MetaShape,
  type TypedRoute,
  type ParamValue,
  type QueryValue,
  type QueryShape,
  type ParamName,
  type PathParams,
  type ParamValues,
  type PathArgs,
  type HasParams,
  type PatternOf,
  type ParamsOf,
  type ParamValuesOf,
  type QueryOf,
  type DataOf,
  type RouteHasParams,
} from './lib/types';
export { defineRoutes, typedRoutes, type TypedTree } from './lib/infer';
export { TypedRouter, type NavigateOptions, type NavigateExtras, type NavigateArgs } from './lib/typed-router';
export { TypedLinkDirective, type TypedLinkInput, type TypedLinkError } from './lib/typed-link.directive';
export {
  injectParams,
  injectQuery,
  injectData,
  type ParamSignals,
  type QuerySignals,
  type InjectOptions,
} from './lib/inject';
