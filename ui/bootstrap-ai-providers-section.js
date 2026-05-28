// Floating AI Providers panel — presets + custom providers.
// Variables in scope: presets, apiBase, authHeaders, ensureStyle, openAIProviderModal, escHtml

var _aiFloatBody = null;

function _fetchConfiguredProviders(cb) {
  fetch(apiBase + '/ai-providers', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) { cb(null, data.providers || []); })
    .catch(function(err) { cb(err, []); });
}

function _refreshAIPanel() {
  if (_aiFloatBody) _renderAIPanel(_aiFloatBody);
}

function _refreshAndReload() {
  _refreshAIPanel();
}

function _triggerGatewayReload(statusEl) {
  if (statusEl) { statusEl.textContent = 'Redémarrage gateway…'; statusEl.className = 'doodoo-reload-status doodoo-reload-loading'; }
  fetch(apiBase + '/gateway/reload', { method: 'POST', headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function() {
      if (!statusEl) return;
      statusEl.textContent = 'Gateway redémarre (~10s)…';
      statusEl.className = 'doodoo-reload-status doodoo-reload-ok';
      setTimeout(function() { if (statusEl.parentNode) statusEl.remove(); }, 12000);
    })
    .catch(function() {
      if (!statusEl) return;
      statusEl.textContent = 'Redémarrage manuel requis';
      statusEl.className = 'doodoo-reload-status doodoo-reload-warn';
    });
}

function _deleteAIProvider(provider, btn) {
  if (!window.confirm('Supprimer le provider "' + (provider.name || provider.id) + '" ?')) return;
  var prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Suppression...';
  fetch(apiBase + '/ai-provider/' + encodeURIComponent(provider.id), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.ok) throw new Error(data.error || 'Erreur suppression');
    _refreshAIPanel();
  })
  .catch(function(err) {
    btn.disabled = false;
    btn.textContent = prev;
    window.alert(String(err.message || err));
  });
}

function _renderAIRow(body, provider, isConfigured) {
  var row = document.createElement('div');
  row.className = 'doodoo-ak-row';

  var name = document.createElement('span');
  name.className = 'doodoo-ak-name';
  name.textContent = provider.name || provider.label || provider.id;

  var check = document.createElement('span');
  check.className = 'doodoo-ak-check';
  if (isConfigured) { check.textContent = '✓'; check.title = 'Clé configurée'; }

  var editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'doodoo-ak-add';
  editBtn.textContent = isConfigured ? 'Modifier →' : 'Add →';
  editBtn.onclick = function() { openAIProviderModal(provider, _refreshAndReload); };

  row.append(name, check, editBtn);

  if (isConfigured) {
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'doodoo-ak-add doodoo-odoo-delete';
    delBtn.textContent = 'Supprimer';
    delBtn.onclick = function() { _deleteAIProvider(provider, delBtn); };
    row.appendChild(delBtn);
  }

  body.appendChild(row);
}

function _renderAIPanel(body) {
  body.innerHTML = '<div class="doodoo-list-empty">Chargement…</div>';
  _fetchConfiguredProviders(function(err, configured) {
    body.innerHTML = '';
    var configuredIds = configured.map(function(p) { return p.id; });

    if (err) {
      var errDiv = document.createElement('div');
      errDiv.className = 'doodoo-list-empty';
      errDiv.textContent = 'Erreur : ' + String(err.message || err);
      body.appendChild(errDiv);
      return;
    }

    // Preset rows (skip "custom" sentinel)
    presets.filter(function(p) { return p.id !== 'custom'; }).forEach(function(p) {
      _renderAIRow(body, p, configuredIds.indexOf(p.id) !== -1);
    });

    // Custom (non-preset) providers
    var presetIds = presets.map(function(p) { return p.id; });
    var customProviders = configured.filter(function(p) { return presetIds.indexOf(p.id) === -1; });
    customProviders.forEach(function(p) {
      _renderAIRow(body, p, true);
    });

    var footer = document.createElement('div');
    footer.className = 'doodoo-ak-footer';
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'doodoo-ak-custom';
    addBtn.textContent = '+ Ajouter un provider custom';
    addBtn.onclick = function() { openAIProviderModal(null, _refreshAndReload); };
    footer.appendChild(addBtn);
    body.appendChild(footer);
  });
}

function _buildAIFloatingPanel() {
  if (document.getElementById('doodoo-ai-float')) return;
  ensureStyle();

  var wrap = document.createElement('div');
  wrap.id = 'doodoo-ai-float';

  var hdr = document.createElement('div');
  hdr.className = 'doodoo-ak-float-header';

  var title = document.createElement('span');
  title.textContent = '🤖 Providers IA';

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

  _aiFloatBody = body;
  _renderAIPanel(body);

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
    _buildAIFloatingPanel();
  } else {
    document.addEventListener('DOMContentLoaded', _buildAIFloatingPanel);
  }
})();
