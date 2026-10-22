/** DAO do módulo de importação de dados acadêmicos e de sua área temporária de staging. */
var DataImportDAO = (function () {
  var JOB_PROPERTY_PREFIX = 'TOPPLUS_DEV_IMPORT_JOB_';
  var STAGE_PREFIX = '__IMP_';
  var MAX_JOB_AGE_MS = 12 * 60 * 60 * 1000;

  function readTarget(type) {
    var definition = DataImportModel.schema(type);
    var table = SheetDAO.readTable(definition.sheetName, definition.targetHeaders.length);
    SheetDAO.requireHeaders(table.headers, definition.targetHeaders, definition.sheetName);
    return table.rows;
  }

  function replaceTarget(type, rows) {
    var definition = DataImportModel.schema(type);
    SheetDAO.replaceBody(definition.sheetName, rows || [], definition.targetHeaders.length);
  }

  function appendTarget(type, rows) {
    var definition = DataImportModel.schema(type);
    SheetDAO.appendRows(definition.sheetName, rows || []);
  }

  function updateTargetRows(type, entries) {
    var definition = DataImportModel.schema(type);
    SheetDAO.updateRowsByIndex(definition.sheetName, entries || [], definition.targetHeaders.length);
  }

  function jobKey_(jobId) {
    return JOB_PROPERTY_PREFIX + String(jobId || '');
  }

  function saveJob_(job) {
    PropertiesService.getScriptProperties().setProperty(jobKey_(job.id), JSON.stringify(job));
  }

  function getJob(jobId) {
    var raw = PropertiesService.getScriptProperties().getProperty(jobKey_(jobId));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (error) { return null; }
  }

  function removeJob_(jobId) {
    PropertiesService.getScriptProperties().deleteProperty(jobKey_(jobId));
  }

  function cleanupExpiredJobs_() {
    var now = Date.now();
    var properties = PropertiesService.getScriptProperties().getProperties();
    Object.keys(properties).forEach(function (key) {
      if (key.indexOf(JOB_PROPERTY_PREFIX) !== 0) return;
      var job = null;
      try { job = JSON.parse(properties[key]); } catch (error) { job = null; }
      if (!job || !job.createdAt || now - Number(job.createdAt) > MAX_JOB_AGE_MS) {
        if (job && job.sheetName) {
          var sheet = SpreadsheetGateway.getSheet(job.sheetName, false);
          if (sheet) SpreadsheetGateway.getSpreadsheet().deleteSheet(sheet);
        }
        PropertiesService.getScriptProperties().deleteProperty(key);
      }
    });
  }

  function createStage(actorEmail, context) {
    cleanupExpiredJobs_();
    var id = Utilities.getUuid().replace(/-/g, '');
    var sheetName = STAGE_PREFIX + String(Date.now()) + '_' + id.substring(0, 10);
    var definition = DataImportModel.schema(context.dataType);
    var spreadsheet = SpreadsheetGateway.getSpreadsheet();
    var sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, definition.sourceHeaders.length).setValues([definition.sourceHeaders.slice()]);
    sheet.setFrozenRows(1);
    sheet.hideSheet();

    var job = {
      id: id,
      sheetName: sheetName,
      actorEmail: TextUtil.normalizeEmail(actorEmail),
      context: context,
      createdAt: Date.now()
    };
    saveJob_(job);
    return job;
  }

  function appendStage(job, rows) {
    var definition = DataImportModel.schema(job.context.dataType);
    var width = definition.sourceHeaders.length;
    var safeRows = (rows || []).map(function (row) {
      var output = new Array(width).fill('');
      for (var i = 0; i < width; i++) output[i] = Array.isArray(row) && i < row.length ? row[i] : '';
      return output;
    });
    SheetDAO.appendRows(job.sheetName, safeRows);
  }

  function readStage(job) {
    var definition = DataImportModel.schema(job.context.dataType);
    var table = SheetDAO.readTable(job.sheetName, definition.sourceHeaders.length);
    SheetDAO.requireHeaders(table.headers, definition.sourceHeaders, 'área temporária de importação');
    return table.rows;
  }

  function destroyStage(job) {
    if (!job) return;
    try {
      var sheet = job.sheetName ? SpreadsheetGateway.getSheet(job.sheetName, false) : null;
      if (sheet) SpreadsheetGateway.getSpreadsheet().deleteSheet(sheet);
    } catch (error) {
      console.warn('Não foi possível remover a aba temporária de importação: ' + (error && error.message ? error.message : error));
    } finally {
      removeJob_(job.id);
    }
  }

  return Object.freeze({
    readTarget: readTarget,
    replaceTarget: replaceTarget,
    appendTarget: appendTarget,
    updateTargetRows: updateTargetRows,
    createStage: createStage,
    appendStage: appendStage,
    readStage: readStage,
    getJob: getJob,
    destroyStage: destroyStage
  });
})();
