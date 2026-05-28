// Injected into the OpenClaw Control UI bootstrap IIFE.
// Variables in scope: apiBase, authHeaders, makeBackdrop, ensureStyle, escHtml, ODOO_RIGHTS_FORM_TPL

function isOdooRightsAdd(target) {
  var node = (target && target.closest && target.closest('.qs-link-btn,button,a,[role="button"]')) || target;
  var label = ((node && node.textContent) || '').trim().toLowerCase();
  if (!label.startsWith('add') && !label.startsWith('ajouter')) return false;
  var parent = node;
  for (var i = 0; parent && i < 10; i++, parent = parent.parentElement) {
    var t = ((parent && parent.textContent) || '').toLowerCase();
    if (t.includes('permission') || t.includes('right') || t.includes('droit') || t.includes('règle') || t.includes('regle')) return true;
  }
  return false;
}

function openOdooRightsModal(prefill, onSaved) {
  ensureStyle();
  var existing = document.querySelector('.doodoo-backdrop');
  if (existing) existing.remove();

  var backdrop = makeBackdrop();
  backdrop.innerHTML = ODOO_RIGHTS_FORM_TPL;
  var form = backdrop.querySelector('form');
  var msg = form.querySelector('.doodoo-msg');

  var profileSelect   = form.elements.profile_id;
  var modelSelect     = form.elements.model_name;
  var modelHidden     = form.elements.odoo_model;
  var fieldsSection   = form.querySelector('.doodoo-fields-section');
  var fieldInput      = form.querySelector('[name="field_search"]');
  var fieldDropdown   = form.querySelector('.doodoo-field-options');
  var tagsList        = form.querySelector('.doodoo-tags-list');

  var _models = [];
  var _fields = [];
  var _tags   = [];

  // ── Profiles ────────────────────────────────────────────────────────────
  fetch(apiBase + '/sdk/odoo/profiles', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var profiles = (data && data.profiles) || [];
      if (!profiles.length) {
        profileSelect.innerHTML = '<option value="">Aucun profil — ajoutez d\'abord un profil Odoo</option>';
        return;
      }
      profileSelect.innerHTML = profiles.map(function(p) {
        var sel = prefill && prefill.profile_id === p.id ? ' selected' : '';
        return '<option value="' + escHtml(p.id) + '"' + sel + '>' + escHtml(p.label || p.id) + '</option>';
      }).join('');
      _loadModels(profileSelect.value);
    })
    .catch(function() { profileSelect.innerHTML = '<option value="">Erreur chargement profils</option>'; });

  profileSelect.addEventListener('change', function() {
    modelSelect.innerHTML = '<option value="">— Sélectionner un modèle —</option>';
    modelSelect.disabled = true;
    modelHidden.value = '';
    fieldsSection.style.display = 'none';
    _tags = [];
    _renderTags();
    _loadModels(profileSelect.value);
  });

  // ── Models ──────────────────────────────────────────────────────────────
  function _loadModels(pid) {
    if (!pid) return;
    modelSelect.innerHTML = '<option value="">Chargement...</option>';
    modelSelect.disabled = true;
    _models = [];
    fetch(apiBase + '/sdk/odoo/models/' + encodeURIComponent(pid), { headers: authHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        _models = (data && data.models) || [];
        modelSelect.innerHTML = '<option value="">— Sélectionner un modèle —</option>'
          + _models.map(function(m) {
            return '<option value="' + escHtml(m.model) + '">'
              + escHtml(m.model) + (m.name ? ' — ' + escHtml(m.name) : '')
              + '</option>';
          }).join('');
        modelSelect.disabled = false;
        if (prefill && prefill.odoo_model) {
          modelSelect.value = prefill.odoo_model;
          if (modelSelect.value) {
            modelHidden.value = prefill.odoo_model;
            _loadFields(pid, prefill.odoo_model);
          }
        }
      })
      .catch(function() {
        modelSelect.innerHTML = '<option value="">Erreur chargement modèles</option>';
        modelSelect.disabled = false;
      });
  }

  modelSelect.addEventListener('change', function() {
    var val = this.value;
    modelHidden.value = val;
    fieldsSection.style.display = 'none';
    _tags = [];
    _renderTags();
    if (val) _loadFields(profileSelect.value, val);
  });

  // ── Fields ──────────────────────────────────────────────────────────────
  function _loadFields(pid, model) {
    if (!pid || !model) return;
    fieldsSection.style.display = '';
    fieldInput.placeholder = 'Chargement des champs...';
    fieldInput.disabled = true;
    _fields = [];
    fetch(apiBase + '/sdk/odoo/fields/' + encodeURIComponent(pid) + '/' + encodeURIComponent(model), { headers: authHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        _fields = (data && data.fields) || [];
        fieldInput.placeholder = 'Ajouter un champ...';
        fieldInput.disabled = false;
        if (prefill && prefill.fields && prefill.fields.length) {
          _tags = prefill.fields.slice();
          _renderTags();
        }
      })
      .catch(function() { fieldInput.placeholder = 'Erreur chargement champs'; fieldInput.disabled = false; });
  }

  fieldInput.addEventListener('input', function() {
    var q = this.value.toLowerCase();
    var results = _fields.filter(function(f) {
      if (_tags.includes(f.name) || _tags.includes('*')) return false;
      return !q || f.name.toLowerCase().includes(q) || (f.label || '').toLowerCase().includes(q);
    }).slice(0, 30);
    if (!results.length) { fieldDropdown.hidden = true; return; }
    fieldDropdown.innerHTML = results.map(function(f) {
      return '<div class="doodoo-combo-option" data-val="' + escHtml(f.name) + '">'
        + '<span class="doodoo-combo-model">' + escHtml(f.name) + '</span>'
        + '<span class="doodoo-combo-name">' + escHtml(f.label || '') + (f.type ? ' (' + escHtml(f.type) + ')' : '') + '</span>'
        + '</div>';
    }).join('');
    fieldDropdown.hidden = false;
  });

  fieldDropdown.addEventListener('mousedown', function(e) {
    var opt = e.target.closest('.doodoo-combo-option');
    if (!opt) return;
    e.preventDefault();
    _addTag(opt.dataset.val);
    fieldInput.value = '';
    fieldDropdown.hidden = false;
    fieldInput.dispatchEvent(new Event('input'));
  });

  fieldInput.addEventListener('focus', function() { this.dispatchEvent(new Event('input')); });
  fieldInput.addEventListener('blur', function() { setTimeout(function() { fieldDropdown.hidden = true; }, 150); });

  var allBtn = form.querySelector('[data-all-fields]');
  if (allBtn) allBtn.onclick = function() {
    _addTag('*');
    fieldInput.value = '';
    fieldDropdown.hidden = true;
  };

  function _addTag(name) {
    if (_tags.includes(name)) return;
    if (name === '*') { _tags = ['*']; }
    else if (!_tags.includes('*')) { _tags.push(name); }
    _renderTags();
    fieldInput.dispatchEvent(new Event('input'));
  }

  function _removeTag(name) {
    _tags = _tags.filter(function(t) { return t !== name; });
    _renderTags();
    fieldInput.dispatchEvent(new Event('input'));
  }

  function _renderTags() {
    tagsList.innerHTML = '';
    _tags.forEach(function(t) {
      var chip = document.createElement('span');
      chip.className = 'doodoo-tag';
      chip.textContent = t;
      var x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.title = 'Retirer';
      x.onclick = function() { _removeTag(t); };
      chip.appendChild(x);
      tagsList.appendChild(chip);
    });
  }

  // ── Prefill (edit mode) ─────────────────────────────────────────────────
  if (prefill) {
    if (prefill.id) { var h2 = form.querySelector('h2'); if (h2) h2.textContent = 'Modifier la règle'; }
    if (prefill.read    !== undefined) form.elements.crud_read.checked    = !!prefill.read;
    if (prefill.create  !== undefined) form.elements.crud_create.checked  = !!prefill.create;
    if (prefill.update  !== undefined) form.elements.crud_update.checked  = !!prefill.update;
    if (prefill['delete'] !== undefined) form.elements.crud_delete.checked = !!prefill['delete'];
    if (prefill.require_confirmation !== undefined) form.elements.require_confirmation.checked = !!prefill.require_confirmation;
  }

  // ── Close / Cancel ──────────────────────────────────────────────────────
  backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop || (e.target.closest && e.target.closest('[data-cancel]'))) backdrop.remove();
  });

  // ── Submit ──────────────────────────────────────────────────────────────
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    msg.className = 'doodoo-msg';
    msg.textContent = 'Sauvegarde...';

    if (!modelHidden.value) {
      msg.className = 'doodoo-msg doodoo-error';
      msg.textContent = 'Veuillez sélectionner un modèle Odoo.';
      return;
    }
    if (!_tags.length) {
      msg.className = 'doodoo-msg doodoo-error';
      msg.textContent = 'Veuillez ajouter au moins un champ (ou "*" pour tous).';
      return;
    }

    var body = {
      profile_id: profileSelect.value,
      odoo_model: modelHidden.value,
      fields:     _tags,
      read:       form.elements.crud_read.checked,
      create:     form.elements.crud_create.checked,
      update:     form.elements.crud_update.checked,
      'delete':   form.elements.crud_delete.checked,
      require_confirmation: form.elements.require_confirmation.checked,
    };
    if (prefill && prefill.id) body.id = prefill.id;

    fetch(apiBase + '/sdk/odoo/right', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
        msg.textContent = 'Sauvegardé ✓';
        if (onSaved) { onSaved(); setTimeout(function() { backdrop.remove(); }, 800); }
      })
      .catch(function(err) {
        msg.className = 'doodoo-msg doodoo-error';
        msg.textContent = String(err.message || err);
      });
  });

  document.body.appendChild(backdrop);
}
