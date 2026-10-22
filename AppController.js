/** Controller da aplicação/sessão. */
function getSessionContext(authToken) {
  var user = SessionService.getUserOptional(authToken);
  return user ? AppService.getContext(user) : { authenticated: false };
}

function getBootstrapContext(authToken) {
  var user = SessionService.requireUser(authToken);
  return AppService.getContext(user);
}

/** Diagnóstico restrito do vínculo entre o Web App e a base instalada. */
function getRuntimeBindingDiagnostics(authToken) {
  var user = SessionService.requireUser(authToken);
  AuthorizationService.requireManageUsers(user);
  var binding = SpreadsheetGateway.getBindingDiagnostics();
  var sheets = [];
  var missing = [];
  try {
    var ss = SpreadsheetGateway.getSpreadsheet();
    sheets = ss.getSheets().map(function (sheet) { return sheet.getName(); });
    missing = InstallationSchema.managedNames().filter(function (name) { return sheets.indexOf(name) < 0; });
  } catch (error) {
    binding.error = binding.error || (error && error.message ? error.message : String(error));
  }
  return {
    appVersion: CONFIG.BUILD_VERSION,
    binding: binding,
    managedSheetsExpected: InstallationSchema.managedNames(),
    managedSheetsMissing: missing,
    sheetCount: sheets.length
  };
}
