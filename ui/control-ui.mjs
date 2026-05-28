import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readFile(filename) {
  return fs.readFileSync(path.join(__dirname, filename), "utf8").trim();
}

function escapeTemplate(content) {
  return content.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

function readCssBundle(filenames) {
  return filenames.map((f) => readFile(f)).join("\n\n");
}

export function installControlUiTokenBootstrap({
  token,
  controlUiBootstrapPath,
  controlUiBootstrapSrc,
  controlUiIndexPath,
}) {
  if (!token) return;

  try {
    fs.mkdirSync(path.dirname(controlUiBootstrapPath), { recursive: true });

    // All templates and CSS are embedded at build time as constants in the IIFE.
    // Backticks and backslashes are escaped so they can be used in template literals.
    const cssTpl = escapeTemplate(readCssBundle([
      "assets/colors.css",
      "assets/forms.css",
      "assets/lists.css",
      "assets/items.css",
    ]));
    const listTpl            = escapeTemplate(readFile("doodoo_list.html"));
    const odooProfileFormTpl = escapeTemplate(readFile("doodoo_odoo_profile_form.html"));
    const odooRightsFormTpl  = escapeTemplate(readFile("doodoo_odoo_rights_form.html"));
    const aiProviderFormTpl  = escapeTemplate(readFile("doodoo_ai_provider_form.html"));

    fs.writeFileSync(
      controlUiBootstrapPath,
      [
        // ── Token bootstrap ───────────────────────────────────────────
        "(() => {",
        `  const serverToken = ${JSON.stringify(token)};`,
        "  const current = new URL(window.location.href);",
        "  const hash = current.hash.startsWith('#') ? current.hash.slice(1) : current.hash;",
        "  const hashParams = new URLSearchParams(hash);",
        "  const urlToken = current.searchParams.get('token') || hashParams.get('token') || '';",
        "  const activeToken = urlToken || serverToken || localStorage.getItem('openclaw:gatewayToken') || sessionStorage.getItem('openclaw:gatewayToken');",
        "  if (!activeToken) return;",
        "  localStorage.setItem('openclaw:gatewayToken', activeToken);",
        "  sessionStorage.setItem('openclaw:gatewayToken', activeToken);",
        "})();",
        "",
        // ── Refresh Control UI after gateway restart ─────────────────
        "(() => {",
        "  const NativeWebSocket = window.WebSocket;",
        "  if (!NativeWebSocket || NativeWebSocket.__doodooRestartRefresh) return;",
        "  function scheduleRefresh(){",
        "    const now = Date.now();",
        "    const last = Number(sessionStorage.getItem('doodoo:lastGatewayRefresh') || '0');",
        "    if (now - last < 60000) return;",
        "    sessionStorage.setItem('doodoo:lastGatewayRefresh', String(now));",
        "    setTimeout(() => window.location.reload(), 45000);",
        "  }",
        "  function DoodooWebSocket(url, protocols){",
        "    const ws = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);",
        "    ws.addEventListener('close', (event) => {",
        "      if (event && event.code === 1012) scheduleRefresh();",
        "    });",
        "    return ws;",
        "  }",
        "  DoodooWebSocket.prototype = NativeWebSocket.prototype;",
        "  DoodooWebSocket.OPEN = NativeWebSocket.OPEN;",
        "  DoodooWebSocket.CONNECTING = NativeWebSocket.CONNECTING;",
        "  DoodooWebSocket.CLOSING = NativeWebSocket.CLOSING;",
        "  DoodooWebSocket.CLOSED = NativeWebSocket.CLOSED;",
        "  DoodooWebSocket.__doodooRestartRefresh = true;",
        "  window.WebSocket = DoodooWebSocket;",
        "})();",
        "",
        // ── UI injection IIFE ─────────────────────────────────────────
        "(() => {",

        // Shared runtime helpers
        "  const apiBase = window.__DOODOO_ENV_API_URL__ || (window.location.origin + '/env-api');",
        "  function getToken(){ const current = new URL(window.location.href); const hash = current.hash.startsWith('#') ? current.hash.slice(1) : current.hash; const hashParams = new URLSearchParams(hash); const token = current.searchParams.get('token') || hashParams.get('token') || localStorage.getItem('openclaw:gatewayToken') || sessionStorage.getItem('openclaw:gatewayToken') || ''; if (token) { localStorage.setItem('openclaw:gatewayToken', token); sessionStorage.setItem('openclaw:gatewayToken', token); } return token; }",
        "  function authHeaders(){ const t=getToken(); const h={'Content-Type':'application/json'}; if(t) h.Authorization='Bearer '+t; return h; }",
        "  function escHtml(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]||c; }); }",
        "  function makeBackdrop(){ const d=document.createElement('div'); d.className='doodoo-backdrop'; return d; }",
        "  function ensureStyle(){ if(document.getElementById('doodoo-style')) return; const s=document.createElement('style'); s.id='doodoo-style'; s.textContent=css; document.head.appendChild(s); }",

        // Provider presets
        "  var presets = [",
        "    { id: 'anthropic',  label: 'Anthropic',  url: 'https://api.anthropic.com/v1',                    api: 'anthropic-messages'  },",
        "    { id: 'openai',     label: 'OpenAI',     url: 'https://api.openai.com/v1',                       api: 'openai-responses'    },",
        "    { id: 'google',     label: 'Google',     url: 'https://generativelanguage.googleapis.com/v1beta', api: 'google-generative-ai' },",
        "    { id: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1',                    api: 'openai-completions'  },",
        "    { id: 'mistral',    label: 'Mistral AI', url: 'https://api.mistral.ai/v1',                       api: 'openai-completions'  },",
        "    { id: 'groq',       label: 'Groq',       url: 'https://api.groq.com/openai/v1',                  api: 'openai-completions'  },",
        "    { id: 'deepseek',   label: 'DeepSeek',   url: 'https://api.deepseek.com/v1',                     api: 'openai-completions'  },",
        "    { id: 'custom',     label: 'Autre',      url: '',                                                 api: 'openai-completions'  },",
        "  ];",

        // CSS and HTML templates (embedded at build time)
        `  var css = \`${cssTpl}\`;`,
        `  var LIST_TPL            = \`${listTpl}\`;`,
        `  var ODOO_PROFILE_FORM_TPL = \`${odooProfileFormTpl}\`;`,
        `  var ODOO_RIGHTS_FORM_TPL  = \`${odooRightsFormTpl}\`;`,
        `  var AI_PROVIDER_FORM_TPL  = \`${aiProviderFormTpl}\`;`,

        // Modal logic
        readFile("bootstrap-modal-odoo-profile.js"),
        readFile("bootstrap-modal-odoo-rights.js"),
        readFile("bootstrap-modal-ai-provider.js"),

        // Odoo Profiles floating panel
        readFile("bootstrap-odoo-section.js"),

        // AI Providers floating panel
        readFile("bootstrap-ai-providers-section.js"),

        // List widget system (MutationObserver injection into QS)
        readFile("doodoo_list_system.js"),

        // Global click handler
        readFile("bootstrap-click-handler.js"),

        // Odoo confirmation popup (polls /confirm/pending, shows overlay)
        readFile("bootstrap-confirm-popup.js"),

        "})();",
        "",
      ].join("\n"),
      { mode: 0o644 },
    );

    let html = fs.readFileSync(controlUiIndexPath, "utf8");
    html = html.replace(
      /\n?\s*<script src="\.\/assets\/doodoo-token-bootstrap\.js(?:\?v=[^"]*)?"><\/script>/g,
      "",
    );

    const scriptTag = `    <script src="${controlUiBootstrapSrc}?v=${Date.now()}"></script>`;
    const moduleScript = /(\s*<script type="module" crossorigin src="\.\/assets\/[^"]+\.js"><\/script>)/;
    if (!moduleScript.test(html)) {
      throw new Error("module script tag not found in Control UI index.html");
    }

    html = html.replace(moduleScript, `\n${scriptTag}$1`);
    fs.writeFileSync(controlUiIndexPath, html);
  } catch (error) {
    console.warn("Cannot install OpenClaw Control UI token bootstrap:", error.message);
  }
}
