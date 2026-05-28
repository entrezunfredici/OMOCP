// Floating Odoo Profiles panel (bottom-left) — list + inline rules accordion.
// Variables in scope: apiBase, authHeaders, ensureStyle, openOdooModal, openOdooRightsModal

var _odooFloatBody = null;

function _fetchSdkConfig(cb) {
  Promise.all([
    fetch(apiBase + '/sdk/odoo/profiles', { headers: authHeaders() }).then(function(r) { return r.json(); }),
    fetch(apiBase + '/sdk/odoo/rights',   { headers: authHeaders() }).then(function(r) { return r.json(); }),
  ]).then(function(results) {
    cb(null, results[0].profiles || [], results[1].rights || []);
  }).catch(function(err) { cb(err, [], []); });
}

function _refreshOdooPanel() {
  if (_odooFloatBody) _renderOdooPanel(_odooFloatBody);
}

function _deleteOdooRight(right, button) {
  var label = right.label || right.odoo_model || right.id;
  if (!window.confirm('Supprimer la règle "' + label + '" ?')) return;
  button.disabled = true;
  button.textContent = '...';
  fetch(apiBase + '/sdk/odoo/right/' + encodeURIComponent(right.id), {
    method: 'DELETE',
    headers: authHeaders(),
  }).then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || 'Erreur suppression');
      _refreshOdooPanel();
    })
    .catch(function(err) {
      button.disabled = false;
      button.textContent = 'Suppr.';
      window.alert(String(err.message || err));
    });
}

function _renderRulesSection(container, profileId, rights) {
  container.innerHTML = '';

  if (rights.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'doodoo-list-empty';
    empty.textContent = 'Aucune règle d\'accès.';
    container.appendChild(empty);
  } else {
    rights.forEach(function(right) {
      var row = document.createElement('div');
      row.className = 'doodoo-odoo-rule-row';

      // Left: model + fields tags + crud flags
      var info = document.createElement('div');
      info.className = 'doodoo-odoo-rule-info';

      var modelLine = document.createElement('div');
      modelLine.className = 'doodoo-odoo-rule-desc';
      modelLine.textContent = right.odoo_model;
      info.appendChild(modelLine);

      var metaLine = document.createElement('div');
      metaLine.className = 'doodoo-odoo-rule-meta';

      // Field tags
      var fields = right.fields || [];
      fields.slice(0, 6).forEach(function(f) {
        var tag = document.createElement('span');
        tag.className = 'doodoo-right-field-tag';
        tag.textContent = f === '*' ? '★ tous' : f;
        metaLine.appendChild(tag);
      });
      if (fields.length > 6) {
        var more = document.createElement('span');
        more.className = 'doodoo-right-field-tag';
        more.textContent = '+' + (fields.length - 6);
        metaLine.appendChild(more);
      }

      // CRUD badges
      var crud = document.createElement('span');
      crud.className = 'doodoo-right-crud';
      [['read','R','r'], ['create','C','c'], ['update','U','u'], ['delete','D','d']].forEach(function(op) {
        var flag = document.createElement('span');
        flag.className = 'doodoo-right-crud-flag ' + op[2] + (right[op[0]] ? ' on' : '');
        flag.textContent = op[1];
        crud.appendChild(flag);
      });
      metaLine.appendChild(crud);

      info.appendChild(metaLine);

      // Buttons
      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'doodoo-ak-add';
      editBtn.textContent = 'Modifier';
      editBtn.onclick = function() { openOdooRightsModal(right, _refreshOdooPanel); };

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'doodoo-ak-add doodoo-odoo-delete';
      delBtn.textContent = 'Suppr.';
      delBtn.onclick = function() { _deleteOdooRight(right, delBtn); };

      row.appendChild(info);
      row.appendChild(editBtn);
      row.appendChild(delBtn);
      container.appendChild(row);
    });
  }

  var addRuleBtn = document.createElement('button');
  addRuleBtn.type = 'button';
  addRuleBtn.className = 'doodoo-ak-custom doodoo-odoo-add-rule';
  addRuleBtn.textContent = '+ Ajouter une règle';
  addRuleBtn.onclick = function() {
    openOdooRightsModal({ profile_id: profileId }, _refreshOdooPanel);
  };
  container.appendChild(addRuleBtn);
}

function _deleteOdooProfile(profile, button) {
  var label = profile.label || profile.database || profile.id;
  if (!window.confirm('Supprimer le profil Odoo "' + label + '" ?')) return;

  var previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Suppression...';

  fetch(apiBase + '/odoo/profile/' + encodeURIComponent(profile.id), {
    method: 'DELETE',
    headers: authHeaders(),
  }).then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || 'Erreur suppression');
      _refreshOdooPanel();
    })
    .catch(function(err) {
      button.disabled = false;
      button.textContent = previous;
      window.alert(String(err.message || err));
    });
}

function _renderProfileBlock(body, profile, allRights) {
  var profileRights = allRights.filter(function(r) { return r.profile_id === profile.id; });

  var block = document.createElement('div');
  block.className = 'doodoo-odoo-profile-block';

  var row = document.createElement('div');
  row.className = 'doodoo-ak-row';

  var name = document.createElement('span');
  name.className = 'doodoo-ak-name';
  name.textContent = profile.label || profile.base_url || profile.id;

  var badge = document.createElement('span');
  badge.className = 'doodoo-ak-check';
  if (profileRights.length > 0) {
    badge.textContent = profileRights.length + ' règle' + (profileRights.length > 1 ? 's' : '');
  }

  var editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'doodoo-ak-add';
  editBtn.textContent = 'Modifier →';
  editBtn.onclick = function() { openOdooModal(profile, _refreshOdooPanel); };

  var rulesToggle = document.createElement('button');
  rulesToggle.type = 'button';
  rulesToggle.className = 'doodoo-ak-add doodoo-odoo-toggle';
  rulesToggle.textContent = 'Règles ▾';

  var deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'doodoo-ak-add doodoo-odoo-delete';
  deleteBtn.textContent = 'Supprimer';
  deleteBtn.onclick = function() { _deleteOdooProfile(profile, deleteBtn); };

  row.append(name, badge, editBtn, rulesToggle, deleteBtn);

  var rulesSection = document.createElement('div');
  rulesSection.className = 'doodoo-odoo-rules-section';
  rulesSection.style.display = 'none';
  _renderRulesSection(rulesSection, profile.id, profileRights);

  rulesToggle.onclick = function() {
    var open = rulesSection.style.display !== 'none';
    rulesSection.style.display = open ? 'none' : '';
    rulesToggle.textContent = open ? 'Règles ▾' : 'Règles ▴';
  };

  block.appendChild(row);
  block.appendChild(rulesSection);
  body.appendChild(block);
}

function _renderOdooPanel(body) {
  body.innerHTML = '<div class="doodoo-list-empty">Chargement…</div>';
  _fetchSdkConfig(function(err, profiles, rights) {
    body.innerHTML = '';

    if (err) {
      var errDiv = document.createElement('div');
      errDiv.className = 'doodoo-list-empty';
      errDiv.textContent = 'Erreur : ' + String(err.message || err);
      body.appendChild(errDiv);
    } else if (profiles.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'doodoo-list-empty';
      empty.textContent = 'Aucun profil Odoo configuré.';
      body.appendChild(empty);
    } else {
      profiles.forEach(function(profile) {
        _renderProfileBlock(body, profile, rights);
      });
    }

    var footer = document.createElement('div');
    footer.className = 'doodoo-ak-footer';
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'doodoo-ak-custom';
    addBtn.textContent = '+ Ajouter un profil Odoo';
    addBtn.onclick = function() { openOdooModal(null, _refreshOdooPanel); };
    footer.appendChild(addBtn);
    body.appendChild(footer);
  });
}

function _buildOdooFloatingPanel() {
  if (document.getElementById('doodoo-odoo-float')) return;
  ensureStyle();

  var wrap = document.createElement('div');
  wrap.id = 'doodoo-odoo-float';

  var hdr = document.createElement('div');
  hdr.className = 'doodoo-ak-float-header';

  var title = document.createElement('span');
  title.textContent = '🔗 Profils Odoo';

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

  _odooFloatBody = body;
  _renderOdooPanel(body);

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
    _buildOdooFloatingPanel();
  } else {
    document.addEventListener('DOMContentLoaded', _buildOdooFloatingPanel);
  }
})();
