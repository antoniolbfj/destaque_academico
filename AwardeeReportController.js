/** Endpoint do construtor de relatórios de premiados. */
function getAwardeeReportWorkspace(authToken) {
  var actor = SessionService.requireUser(authToken);
  return AwardeeReportService.getWorkspace(actor);
}
