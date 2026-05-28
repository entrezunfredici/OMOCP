// Injected into the OpenClaw Control UI bootstrap IIFE.
// Variables in scope: presets, apiBase, authHeaders, makeBackdrop, ensureStyle, PROVIDER_FORM_TPL

function inferProviderFromButton(button) {
  var row = button.closest('div,li,tr') || button.parentElement;
  var text = ((row && row.textContent) || '').toLowerCase();
  return presets.find(function(p) { return p.id !== 'custom' && text.includes(p.label.toLowerCase()); })
      || presets.find(function(p) { return p.id === 'custom'; });
}

function isApiKeysAdd(target) {
  var node = (target && target.closest && target.closest('.qs-link-btn,button,a,[role="button"]')) || target;
  var label = ((node && node.textContent) || '').trim().toLowerCase();
  if (!label.startsWith('add')) return false;

  // Find the containing row — try specific class first, then fall back to parent element
  var row = (node.closest && node.closest('.qs-row')) || node.parentElement;

  // Check if a known provider name is in the row
  var knownProvider = presets.some(function(p) {
    return p.id !== 'custom' && ((row && row.textContent) || '').toLowerCase().includes(p.label.toLowerCase());
  });

  // If not found in immediate row, walk up a few levels (handles flex/grid layouts)
  if (!knownProvider) {
    var el = node.parentElement;
    for (var j = 0; el && j < 6; j++, el = el.parentElement) {
      var t = (el.textContent || '').toLowerCase();
      if (presets.some(function(p) { return p.id !== 'custom' && t.includes(p.label.toLowerCase()); })) {
        knownProvider = true;
        break;
      }
    }
  }
  if (!knownProvider) return false;

  // Confirm we are inside an "API Keys" section
  var parent = node.parentElement;
  for (var i = 0; parent && i < 12; i++, parent = parent.parentElement) {
    if ((parent.textContent || '').includes('API Keys')) return true;
  }
  return document.body.textContent.includes('API Keys');
}

function openProviderModal(initial, onSaved) {
  ensureStyle();
  var existing = document.querySelector('.doodoo-backdrop');
  if (existing) existing.remove();
  var selected = initial || presets[0];
  var backdrop = makeBackdrop();
  backdrop.innerHTML = PROVIDER_FORM_TPL;
  var form = backdrop.querySelector('form');
  var providerSel = form.elements.provider;
  var nameInput = form.elements.name;
  var urlInput = form.elements.url;
  var msg = form.querySelector('.doodoo-msg');

  presets.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    if (p.id === selected.id) opt.selected = true;
    providerSel.appendChild(opt);
  });

  function sync() {
    var p = presets.find(function(x) { return x.id === providerSel.value; }) || presets[presets.length - 1];
    if (p.id !== 'custom') { nameInput.value = p.label; urlInput.value = p.url; }
    nameInput.closest('[data-custom]').style.display = p.id === 'custom' ? 'grid' : 'none';
  }
  providerSel.addEventListener('change', sync);
  sync();

  backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop || (e.target.closest && e.target.closest('[data-cancel]'))) backdrop.remove();
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    msg.className = 'doodoo-msg';
    msg.textContent = 'Sauvegarde...';
    fetch(apiBase + '/providers/api-key', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        provider: providerSel.value,
        name: nameInput.value,
        url: urlInput.value,
        key: form.elements.key.value
      })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
      msg.textContent = 'Clé sauvegardée. Redémarrez OpenClaw pour appliquer le provider.';
      form.elements.key.value = '';
      if (onSaved) { onSaved(selected); setTimeout(function() { backdrop.remove(); }, 1200); }
    })
    .catch(function(err) {
      msg.className = 'doodoo-msg doodoo-error';
      msg.textContent = String(err.message || err);
    });
  });

  document.body.appendChild(backdrop);
}
