/** Endpoints públicos e administrativos da página pública de premiados. */
function getPublicAwardeePortal(filters) {
  return PublicAwardeeService.getPublicPortal(filters || {});
}

function getPublicAwardeeSettings(authToken) {
  var actor = SessionService.requireUser(authToken);
  return PublicAwardeeService.getAdminWorkspace(actor);
}

function savePublicAwardeeSettings(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return PublicAwardeeService.saveConfiguration(actor, payload || {});
}
