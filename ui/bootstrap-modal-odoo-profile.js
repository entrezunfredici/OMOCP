// Injected into the OpenClaw Control UI bootstrap IIFE.
// Variables in scope: apiBase, authHeaders, makeBackdrop, ensureStyle, ODOO_PROFILE_FORM_TPL

function isOdooAdd(target) {
  var node = (target && target.closest && target.closest('.qs-link-btn,button,a,[role="button"]')) || target;
  var label = ((node && node.textContent) || '').trim().toLowerCase();
  if (!label.startsWith('add') && !label.startsWith('ajouter')) return false;
  var parent = node;
  for (var i = 0; parent && i < 10; i++, parent = parent.parentElement) {
    var t = ((parent && parent.textContent) || '').toLowerCase();
    if (t.includes('odoo') || t.includes('profil')) return true;
  }
  return false;
}

function openOdooModal(prefill, onSaved) {
  ensureStyle();
  var existing = document.querySelector('.doodoo-backdrop');
  if (existing) existing.remove();
  var backdrop = makeBackdrop();
  backdrop.innerHTML = ODOO_PROFILE_FORM_TPL;
  var form = backdrop.querySelector('form');
  var msg = form.querySelector('.doodoo-msg');
  if (prefill) {
    var h2 = form.querySelector('h2');
    if (h2) h2.textContent = 'Modifier le profil Odoo';
    form.elements.url.value = prefill.base_url || '';
    form.elements.db.value = prefill.database || '';
    form.elements.login.value = prefill.login || '';
  }
  backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop || (e.target.closest && e.target.closest('[data-cancel]'))) backdrop.remove();
  });
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    msg.className = 'doodoo-msg';
    msg.textContent = 'Sauvegarde...';
    var body = Object.assign(
      prefill && prefill.id ? { id: prefill.id } : {},
      {
        base_url: form.elements.url.value,
        database: form.elements.db.value,
        login: form.elements.login.value,
        password: form.elements.password.value
      }
    );
    fetch(apiBase + '/odoo/profile', {
      method: 'POST',
      headers: authHeaders(), body: JSON.stringify(body)
    }).then(function(res) {
      return res.json();
    }).then(function(data) {
      if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
      msg.textContent = 'Sauvegardé ✓';
      if (onSaved) { onSaved(); setTimeout(function() { backdrop.remove(); }, 800); }
      else { form.reset(); }
    })
    .catch(function(err) {
      msg.className = 'doodoo-msg doodoo-error';
      msg.textContent = String(err.message || err);
    });
  });
  document.body.appendChild(backdrop);
}
