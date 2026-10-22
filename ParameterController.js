function getParameterAdminContext(authToken) {
  var actor = SessionService.requireUser(authToken);
  return ParameterService.getAdminContext(actor);
}
function saveParameter(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return ParameterService.saveParameter(actor, payload);
}
function deleteParameter(authToken, parameterId) {
  var actor = SessionService.requireUser(authToken);
  return ParameterService.removeParameter(actor, parameterId);
}
function saveParameterPackage(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return ParameterService.savePackage(actor, payload);
}
function deleteParameterPackage(authToken, packageId) {
  var actor = SessionService.requireUser(authToken);
  return ParameterService.removePackage(actor, packageId);
}