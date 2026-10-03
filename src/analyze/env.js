/**
 * Environment variables that redirect traffic, trust or code execution.
 * @param {string} key
 * @param {unknown} value
 * @returns {string|null} explanation, or null when the variable looks harmless
 */
export function analyzeEnvVar(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  if (/^(?:ANTHROPIC|OPENAI|GEMINI|GOOGLE|AZURE_OPENAI|MISTRAL|COHERE|GROQ|OPENROUTER)[A-Z_]*(?:BASE_URL|API_BASE|ENDPOINT|API_URL)$/i.test(key) || /_BASE_URL$/i.test(key)) {
    const host = hostOf(v);
    if (host && !isTrustedApiHost(host)) return `${key} sends API traffic, including your key and prompts, to ${host}`;
    return null;
  }
  if (/^(?:HTTPS?_PROXY|ALL_PROXY)$/i.test(key)) {
    const host = hostOf(v);
    if (host && !isLocal(host)) return `${key} routes traffic through ${host}`;
    return null;
  }
  if (key === 'NODE_TLS_REJECT_UNAUTHORIZED' && String(v) === '0') return 'disables TLS certificate verification for Node';
  if (/^(?:NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE|GIT_SSL_CAINFO)$/.test(key)) return `${key} makes tools trust a certificate authority from the repo`;
  if (key === 'NODE_OPTIONS' && /--(?:require|import|loader|experimental-loader)\b|(?:^|\s)-r\s/.test(v)) return 'NODE_OPTIONS preloads code into every Node process';
  if (/^(?:LD_PRELOAD|LD_LIBRARY_PATH|DYLD_INSERT_LIBRARIES|DYLD_LIBRARY_PATH)$/.test(key)) return `${key} injects native code into child processes`;
  if (/^(?:BASH_ENV|ENV|PROMPT_COMMAND|PYTHONSTARTUP|RUBYOPT|PERL5OPT)$/.test(key)) return `${key} runs code every time a shell or interpreter starts`;
  if (key === 'PATH' && /(?:^|:)(?:\.|\.\/|\$\{?(?:PWD|workspaceFolder)\}?)[^:]*(?::|$)/.test(v)) return 'PATH is prefixed with a directory inside the repo, so commands like git or node can be shadowed';
  return null;
}

/** @param {string} v */
function hostOf(v) {
  try {
    return new URL(v).hostname;
  } catch {
    return null;
  }
}

/** @param {string} h */
function isLocal(h) {
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' || h.endsWith('.localhost');
}

/** @param {string} h */
function isTrustedApiHost(h) {
  return (
    isLocal(h) ||
    /(?:^|\.)(?:anthropic\.com|openai\.com|googleapis\.com|openai\.azure\.com|mistral\.ai|cohere\.(?:com|ai)|groq\.com|openrouter\.ai|amazonaws\.com)$/.test(h)
  );
}
