function getAwardeeWorkspace(authToken) {
  var actor = SessionService.requireUser(authToken);
  return AwardeeWorkspaceService.getWorkspace(actor);
}

function saveAwardeeWorkspaceBatch(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return AwardeeWorkspaceService.saveBatch(actor, payload || {});
}

function deleteAwardeeWorkspaceDraft(authToken, recordId) {
  var actor = SessionService.requireUser(authToken);
  return AwardeeWorkspaceService.removeDraft(actor, recordId);
}

function publishAwardeeWorkspace(authToken) {
  var actor = SessionService.requireUser(authToken);
  return AwardeeWorkspaceService.publish(actor);
}
