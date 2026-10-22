/** Endpoints administrativos de premiados. */
function getAwardeeAdminContext(authToken, filters) {
  var actor = SessionService.requireUser(authToken);
  return AwardeeService.getAdminContext(actor, filters || {});
}

function saveAwardee(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return AwardeeService.save(actor, payload);
}

function deleteAwardee(authToken, recordId, filters) {
  var actor = SessionService.requireUser(authToken);
  return AwardeeService.remove(actor, recordId, filters || {});
}
