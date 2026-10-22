/** Endpoints administrativos de ocorrências/desclassificações. */
function getOccurrenceAdminContext(authToken, filters) {
  var actor = SessionService.requireUser(authToken);
  return OccurrenceService.getAdminContext(actor, filters || {});
}

function saveOccurrence(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return OccurrenceService.save(actor, payload);
}

function deleteOccurrence(authToken, recordId, filters) {
  var actor = SessionService.requireUser(authToken);
  return OccurrenceService.remove(actor, recordId, filters || {});
}
