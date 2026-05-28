// Injected into the OpenClaw Control UI bootstrap IIFE.
// Variables in scope: isOdooRightsAdd, isOdooAdd, openOdooModal, openOdooRightsModal

document.addEventListener('click', function(event) {
  var target = event.target;
  if (isOdooRightsAdd(target)) {
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    openOdooRightsModal();
    return;
  }
  if (isOdooAdd(target)) {
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    openOdooModal();
    return;
  }
}, true);
