function getManualAwardeeWorkspace(authToken) {
  var actor = SessionService.requireUser(authToken);
  return ManualAwardeeService.getWorkspace(actor);
}

function lookupManualAwardeeStudent(authToken, ra) {
  var actor = SessionService.requireUser(authToken);
  return ManualAwardeeService.lookupStudent(actor, ra);
}

function saveManualAwardee(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return ManualAwardeeService.save(actor, payload || {});
}

function deleteManualAwardee(authToken, recordId) {
  var actor = SessionService.requireUser(authToken);
  return ManualAwardeeService.remove(actor, recordId);
}
