function getApurationBootstrap(authToken) {
  var actor = SessionService.requireUser(authToken);
  return ApurationService.getBootstrap(actor);
}
function getApurationWorkspace(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return ApurationService.getWorkspace(actor, payload);
}
function getApurationStudentDetails(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return ApurationService.getStudentDetails(actor, payload);
}
function saveApurationDecisions(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return ApurationService.saveDecisions(actor, payload);
}
function transitionApurationResult(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return ApurationService.transition(actor, payload);
}
function processApurationTransition(authToken, jobId) {
  var actor = SessionService.requireUser(authToken);
  return ApurationService.processTransition(actor, jobId);
}
