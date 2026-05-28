// Injected into the OpenClaw Control UI bootstrap IIFE.
// Injects a floating API Keys panel (fixed bottom-right) — no fragile DOM detection.
// Variables in scope: presets, ensureStyle, openProviderModal

function _getConfiguredIds() {
  try { return JSON.parse(localStorage.getItem('doodoo:configured_providers') || '[]'); }
  catch (e) { return []; }
}

function _markConfigured(id) {
  var list = _getConfiguredIds();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem('doodoo:configured_providers', JSON.stringify(list));
  }
}

function _renderFloatingRows(body) {
  body.innerHTML = '';
  var configured = _getConfiguredIds();

  presets.filter(function(p) { return p.id !== 'custom'; }).forEach(function(p) {
    var row = document.createElement('div');
    row.className = 'doodoo-ak-row';

    var name = document.createElement('span');
    name.className = 'doodoo-ak-name';
    name.textContent = p.label;

    var check = document.createElement('span');
    check.className = 'doodoo-ak-check';
    if (configured.includes(p.id)) { check.textContent = '✓'; check.title = 'Clé configurée'; }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'doodoo-ak-add';
    btn.textContent = configured.includes(p.id) ? 'Modifier →' : 'Add →';
    btn.onclick = function() {
      openProviderModal(p, function() {
        _markConfigured(p.id);
        _renderFloatingRows(body);
      });
    };

    row.append(name, check, btn);
    body.appendChild(row);
  });

  var footer = document.createElement('div');
  footer.className = 'doodoo-ak-footer';
  var customBtn = document.createElement('button');
  customBtn.type = 'button';
  customBtn.className = 'doodoo-ak-custom';
  customBtn.textContent = '+ Ajouter un provider custom';
  customBtn.onclick = function() {
    openProviderModal(presets.find(function(p) { return p.id === 'custom'; }));
  };
  footer.appendChild(customBtn);
  body.appendChild(footer);
}

function _buildFloatingPanel() {
  if (document.getElementById('doodoo-ak-float')) return;
  ensureStyle();

  var wrap = document.createElement('div');
  wrap.id = 'doodoo-ak-float';

  var hdr = document.createElement('div');
  hdr.className = 'doodoo-ak-float-header';

  var title = document.createElement('span');
  title.textContent = '🔑 API Keys';

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = '▼';

  hdr.appendChild(title);
  hdr.appendChild(toggle);

  var body = document.createElement('div');
  body.className = 'doodoo-ak-float-body';

  wrap.appendChild(hdr);
  wrap.appendChild(body);
  document.body.appendChild(wrap);

  _renderFloatingRows(body);

  var collapsed = false;
  function doToggle() {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : '';
    toggle.textContent = collapsed ? '▲' : '▼';
  }
  hdr.addEventListener('click', doToggle);
}

(function() {
  if (document.body) {
    _buildFloatingPanel();
  } else {
    document.addEventListener('DOMContentLoaded', _buildFloatingPanel);
  }
})();
