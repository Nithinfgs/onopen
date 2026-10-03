// eslint's transitive `punycode` package is plain JS that @types/node resolves into.
// Mapping it to a stub keeps `tsc --checkJs` from type-checking node_modules.
declare const punycode: unknown;
export = punycode;
