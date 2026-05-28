// Confirmation popup — poll /env-api/confirm/pending and show modal when IA needs user approval.
// Variables in scope: apiBase, authHeaders, ensureStyle

var _confirmPolling = null;
var _shownConfirms = {};

var _CONFIRM_OP_LABELS = {
  read:   'lire',
  create: 'créer',
  update: 'modifier',
  delete: 'supprimer',
};

function _respondConfirm(id, allowed, overlay) {
  overlay.querySelector('.doodoo-confirm-allow').disabled = true;
  overlay.querySelector('.doodoo-confirm-deny').disabled  = true;
  fetch(apiBase + '/confirm/respond/' + id, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ allowed: !!allowed }),
  }).finally(function() {
    delete _shownConfirms[id];
    overlay.remove();
  });
}

function _showConfirmOverlay(entry) {
  if (_shownConfirms[entry.id]) return;
  _shownConfirms[entry.id] = true;
  ensureStyle();

  var op = _CONFIRM_OP_LABELS[entry.operation] || entry.operation;

  var overlay = document.createElement('div');
  overlay.className = 'doodoo-confirm-overlay';
  overlay.dataset.confirmId = entry.id;

  var box = document.createElement('div');
  box.className = 'doodoo-confirm-box';

  var header = document.createElement('div');
  header.className = 'doodoo-confirm-header';
  header.textContent = 'Confirmation requise';

  var body = document.createElement('div');
  body.className = 'doodoo-confirm-body';

  var opSpan = document.createElement('strong');
  opSpan.textContent = op;

  var modelCode = document.createElement('code');
  modelCode.textContent = entry.model;

  body.appendChild(document.createTextNode("L'IA demande à "));
  body.appendChild(opSpan);
  body.appendChild(document.createTextNode(' des données sur '));
  body.appendChild(modelCode);
  if (entry.profile_id) {
    var profCode = document.createElement('code');
    profCode.textContent = entry.profile_id;
    body.appendChild(document.createTextNode(' (profil '));
    body.appendChild(profCode);
    body.appendChild(document.createTextNode(')'));
  }
  body.appendChild(document.createTextNode('.'));

  var actions = document.createElement('div');
  actions.className = 'doodoo-confirm-actions';

  var denyBtn = document.createElement('button');
  denyBtn.type = 'button';
  denyBtn.className = 'doodoo-confirm-deny';
  denyBtn.textContent = 'Refuser';
  denyBtn.onclick = function() { _respondConfirm(entry.id, false, overlay); };

  var allowBtn = document.createElement('button');
  allowBtn.type = 'button';
  allowBtn.className = 'doodoo-confirm-allow';
  allowBtn.textContent = 'Autoriser';
  allowBtn.onclick = function() { _respondConfirm(entry.id, true, overlay); };

  actions.appendChild(denyBtn);
  actions.appendChild(allowBtn);
  box.appendChild(header);
  box.appendChild(body);
  box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function _pollConfirmations() {
  fetch(apiBase + '/confirm/pending', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!Array.isArray(data.pending)) return;
      data.pending.forEach(_showConfirmOverlay);
    })
    .catch(function() {});
}

(function() {
  function start() {
    if (_confirmPolling) return;
    _confirmPolling = setInterval(_pollConfirmations, 2000);
  }
  if (document.body) { start(); }
  else { document.addEventListener('DOMContentLoaded', start); }
})();
