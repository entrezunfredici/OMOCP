// Modal add/edit for AI providers (presets + custom).
// Variables in scope: presets, apiBase, authHeaders, makeBackdrop, ensureStyle, escHtml, AI_PROVIDER_FORM_TPL

function openAIProviderModal(prefill, onSaved) {
  ensureStyle();
  var existing = document.querySelector('.doodoo-backdrop');
  if (existing) existing.remove();
  var backdrop = makeBackdrop();
  backdrop.innerHTML = AI_PROVIDER_FORM_TPL;
  var form = backdrop.querySelector('form');
  var msg = form.querySelector('.doodoo-msg');
  var presetSel = form.elements.preset_id;
  var customFields = form.querySelectorAll('[data-custom]');

  // Populate preset dropdown
  presets.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    presetSel.appendChild(opt);
  });

  function syncCustomFields() {
    var isCustom = presetSel.value === 'custom';
    customFields.forEach(function(el) { el.style.display = isCustom ? '' : 'none'; });
  }
  presetSel.addEventListener('change', syncCustomFields);

  // Pre-fill if editing
  if (prefill) {
    var matchingPreset = presets.find(function(p) { return p.id === prefill.id; });
    if (matchingPreset) {
      presetSel.value = matchingPreset.id;
    } else {
      presetSel.value = 'custom';
      form.elements.id.value = prefill.id || '';
      form.elements.name.value = prefill.name || '';
      form.elements.url.value = prefill.url || '';
    }
    form.querySelector('h2').textContent = 'Modifier le provider IA';
  }
  syncCustomFields();

  backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop || (e.target.closest && e.target.closest('[data-cancel]'))) backdrop.remove();
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var preset = presets.find(function(p) { return p.id === presetSel.value; });
    var isCustom = presetSel.value === 'custom';
    var body = isCustom
      ? {
          id: form.elements.id.value.trim(),
          name: form.elements.name.value.trim(),
          url: form.elements.url.value.trim(),
          api: 'openai-completions',
          api_key: form.elements.api_key.value,
        }
      : {
          id: preset.id,
          name: preset.label,
          url: preset.url,
          api: preset.api || 'openai-completions',
          api_key: form.elements.api_key.value,
        };

    if (!body.id || !body.name || !body.url) {
      msg.className = 'doodoo-msg doodoo-error';
      msg.textContent = 'id, nom et URL requis.';
      return;
    }

    msg.className = 'doodoo-msg';
    msg.textContent = 'Sauvegarde...';
    fetch(apiBase + '/ai-provider', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    })
    .then(function(r) { return r.json(); })
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
