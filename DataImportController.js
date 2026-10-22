/** Controller RPC do módulo Gerenciar Dados. */
function getDataImportAdminContext(authToken, year) {
  var actor = SessionService.requireUser(authToken);
  return DataImportService.getAdminContext(actor, year);
}

function getDataSetStatus(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return DataImportService.getDataSetStatus(actor, payload);
}


function beginDataImport(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return DataImportService.begin(actor, payload);
}

function appendDataImportChunk(authToken, jobId, rows) {
  var actor = SessionService.requireUser(authToken);
  return DataImportService.appendChunk(actor, jobId, rows);
}

function previewDataImport(authToken, jobId) {
  var actor = SessionService.requireUser(authToken);
  return DataImportService.preview(actor, jobId);
}

function commitDataImport(authToken, jobId, executionOperation) {
  var actor = SessionService.requireUser(authToken);
  return DataImportService.commit(actor, jobId, executionOperation);
}

function cancelDataImport(authToken, jobId) {
  var actor = SessionService.requireUser(authToken);
  return DataImportService.cancel(actor, jobId);
}

function deleteAcademicDataSet(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return DataImportService.removeDataSet(actor, payload);
}
