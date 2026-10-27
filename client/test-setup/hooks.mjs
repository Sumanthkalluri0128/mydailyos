// Lets Node's test runner load the app's files the way Vite does: imports without ".js" are resolved by adding it.
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (e) {
    if (e && e.code === 'ERR_MODULE_NOT_FOUND' && /^\.{1,2}\//.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.js`, context);
    throw e;
  }
}
