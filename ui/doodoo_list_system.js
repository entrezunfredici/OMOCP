// Injected into the OpenClaw Control UI bootstrap IIFE.
// Variables in scope: apiBase, authHeaders, ensureStyle,
//                     openOdooModal, openOdooRightsModal, LIST_TPL.

function makeDoodooListWidget(title) {
  var div = document.createElement('div');
  div.innerHTML = LIST_TPL;
  var w = div.firstElementChild;
  w.querySelector('.doodoo-list-title').textContent = title;
  return w;
}

function setListItems(widget, items, labelFn, onEdit, onDelete) {
  var ul = widget.querySelector('.doodoo-list-items');
  var empty = widget.querySelector('.doodoo-list-empty');
  ul.innerHTML = '';
  if (!items.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  items.forEach(function(item) {
    var li = document.createElement('li');
    li.className = 'doodoo-list-item';
    var lbl = document.createElement('span');
    lbl.className = 'doodoo-list-item-label';
    lbl.textContent = labelFn(item);
    var acts = document.createElement('div');
    acts.className = 'doodoo-list-item-actions';
    var editBtn = document.createElement('button');
    editBtn.type = 'button'; editBtn.textContent = '✎'; editBtn.title = 'Modifier';
    editBtn.onclick = function() { onEdit(item); };
    var delBtn = document.createElement('button');
    delBtn.type = 'button'; delBtn.textContent = '✕'; delBtn.title = 'Supprimer';
    delBtn.className = 'danger';
    delBtn.onclick = function() { onDelete(item); };
    acts.append(editBtn, delBtn);
    li.append(lbl, acts);
    ul.appendChild(li);
  });
}

function fetchOdooConfig() {
  return fetch(apiBase + '/odoo/config', { headers: authHeaders() }).then(function(r) { return r.json(); });
}

function refreshOdooProfilesList(widget) {
  fetchOdooConfig().then(function(data) {
    var profiles = (data && data.config && data.config.connection_profiles) || [];
    setListItems(
      widget, profiles,
      function(p) { return (p.label || p.id) + (p.base_url ? '  —  ' + p.base_url : ''); },
      function(p) { openOdooModal(p, function() { refreshOdooProfilesList(widget); }); },
      function(p) {
        if (!confirm('Supprimer le profil "' + (p.label || p.id) + '" ?')) return;
        fetch(apiBase + '/odoo/profile/' + p.id, { method: 'DELETE', headers: authHeaders() })
          .then(function() { refreshOdooProfilesList(widget); });
      }
    );
  }).catch(function() {});
}

function refreshOdooRightsList(widget) {
  fetchOdooConfig().then(function(data) {
    var rules = (data && data.config && data.config.permission_rules) || [];
    setListItems(
      widget, rules,
      function(r) { return r.model + '.' + r.field + '  —  ' + r.operation + (r.allowed === false ? ' [refusé]' : ''); },
      function(r) { openOdooRightsModal(r, function() { refreshOdooRightsList(widget); }); },
      function(r) {
        if (!confirm('Supprimer la règle ' + r.model + '.' + r.field + ' (' + r.operation + ') ?')) return;
        fetch(apiBase + '/odoo/permission-rule/' + r.id, { method: 'DELETE', headers: authHeaders() })
          .then(function() { refreshOdooRightsList(widget); });
      }
    );
  }).catch(function() {});
}

// Build and insert the Odoo card after a given anchor element.
function _insertOdooSection(anchorCard) {
  if (!anchorCard || !anchorCard.parentElement) return false;
  ensureStyle();
  var section = document.createElement('div');
  section.dataset.doodooSection = '1';
  section.className = 'doodoo-section';

  var cardTitle = document.createElement('div');
  cardTitle.className = 'doodoo-section-title';
  cardTitle.innerHTML = '<span class="doodoo-section-title-icon">&#9881;</span> Odoo';
  section.appendChild(cardTitle);

  var pw = makeDoodooListWidget('Profils de connexion');
  var rw = makeDoodooListWidget('Règles de permission');
  pw.querySelector('.doodoo-list-add').onclick = function() { openOdooModal(null, function() { refreshOdooProfilesList(pw); }); };
  rw.querySelector('.doodoo-list-add').onclick = function() { openOdooRightsModal(null, function() { refreshOdooRightsList(rw); }); };
  section.append(pw, rw);

  anchorCard.after(section);
  refreshOdooProfilesList(pw);
  refreshOdooRightsList(rw);
  return true;
}

// Find the smallest element that:
//   - contains the text "API Keys"
//   - has at least 2 direct children (is a real card, not a text wrapper)
// by walking up from a starting element.
function _walkUpToCard(startEl) {
  var el = startEl;
  while (el && el !== document.body) {
    if ((el.textContent || '').includes('API Keys') && el.children.length >= 2) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function tryInjectDoodooSection() {
  // Already injected?
  if (document.querySelector('[data-doodoo-section]')) return true;

  var anchorCard = null;

  // Strategy 1: walk up from a .qs-row element (API Keys rows use this class)
  var row = document.querySelector('.qs-row');
  if (row) anchorCard = _walkUpToCard(row.parentElement);

  // Strategy 2: TreeWalker to find the exact "API Keys" text node, then walk up
  if (!anchorCard) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() === 'API Keys' && node.parentElement) {
        anchorCard = _walkUpToCard(node.parentElement);
        if (anchorCard) break;
      }
    }
  }

  // Strategy 3: broad text search — find any element whose own text includes "API Keys"
  // and has siblings (i.e., is inside a grid with other cards)
  if (!anchorCard) {
    var all = Array.from(document.querySelectorAll('*'));
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if ((el.textContent || '').includes('API Keys') &&
          el.children.length >= 2 &&
          el.parentElement && el.parentElement.children.length >= 2) {
        anchorCard = el;
        break;
      }
    }
  }

  if (!anchorCard) return false;
  return _insertOdooSection(anchorCard);
}

(function() {
  var timer;
  var obs = new MutationObserver(function() {
    clearTimeout(timer);
    timer = setTimeout(tryInjectDoodooSection, 200);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  // Also try immediately in case the page is already loaded
  setTimeout(tryInjectDoodooSection, 500);
})();
