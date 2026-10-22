/**
 * Infraestrutura compartilhada.
 * Regra global: acesso à planilha e cache ficam concentrados aqui/DAOs.
 */
var TextUtil = (function () {
  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
  }

  function localeComparePt(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return Object.freeze({
    text: text,
    normalizeEmail: normalizeEmail,
    isValidEmail: isValidEmail,
    localeComparePt: localeComparePt,
    escapeHtml: escapeHtml
  });
})();

var CryptoUtil = (function () {
  function sha256Hex(value) {
    var bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(value || ''),
      Utilities.Charset.UTF_8
    );
    return bytes.map(function (byte) {
      return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0');
    }).join('');
  }

  function sixDigitCode() {
    var bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + '|' + Utilities.getUuid(),
      Utilities.Charset.UTF_8
    );
    var number = 0;
    for (var i = 0; i < 6; i++) {
      number = (number * 256 + (bytes[i] < 0 ? bytes[i] + 256 : bytes[i])) % 1000000;
    }
    return String(number).padStart(6, '0');
  }

  function sessionToken() {
    return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  }

  return Object.freeze({
    sha256Hex: sha256Hex,
    sixDigitCode: sixDigitCode,
    sessionToken: sessionToken
  });
})();

var PerformanceCache = (function () {
  function getJson(key) {
    var raw = CacheService.getScriptCache().get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      CacheService.getScriptCache().remove(key);
      return null;
    }
  }

  function putJson(key, value, ttlSeconds) {
    var serialized = JSON.stringify(value);
    // O cache é uma otimização. Listas grandes continuam disponíveis na base,
    // sem exceder os 100 KB permitidos por valor (medidos em bytes UTF-8).
    if (Utilities.newBlob(serialized).getBytes().length > 90 * 1024) {
      CacheService.getScriptCache().remove(key);
      return false;
    }
    CacheService.getScriptCache().put(key, serialized, ttlSeconds);
    return true;
  }

  function get(key) {
    return CacheService.getScriptCache().get(key);
  }

  function put(key, value, ttlSeconds) {
    CacheService.getScriptCache().put(key, String(value), ttlSeconds);
  }

  function remove(key) {
    CacheService.getScriptCache().remove(key);
  }

  return Object.freeze({ getJson: getJson, putJson: putJson, get: get, put: put, remove: remove });
})();

var LockExecutor = (function () {
  function withScriptLock(callback) {
    var lock = LockService.getScriptLock();
    lock.waitLock(CONFIG.PERFORMANCE.LOCK_TIMEOUT_MS);
    try {
      return callback();
    } finally {
      lock.releaseLock();
    }
  }

  return Object.freeze({ withScriptLock: withScriptLock });
})();

var SpreadsheetGateway = (function () {
  var spreadsheet = null;
  var sheetCache = {};

  function installationConfig_() {
    return CONFIG.INSTALLATION || {};
  }

  function scriptProperties_() {
    return PropertiesService.getScriptProperties();
  }

  function documentProperties_() {
    try {
      return PropertiesService.getDocumentProperties ? PropertiesService.getDocumentProperties() : null;
    } catch (error) {
      return null;
    }
  }

  function propertyKey_() {
    return installationConfig_().DATABASE_ID_PROPERTY || 'TOPPLUS_DATABASE_SPREADSHEET_ID';
  }

  function readStoredIds_() {
    var key = propertyKey_();
    var scriptId = TextUtil.text(scriptProperties_().getProperty(key));
    var documentStore = documentProperties_();
    var documentId = documentStore ? TextUtil.text(documentStore.getProperty(key)) : '';
    return { script: scriptId, document: documentId };
  }

  function isLegacyProject_() {
    var cfg = installationConfig_();
    if (!cfg.ALLOW_LEGACY_RUNTIME_FALLBACK) return false;
    if (!cfg.LEGACY_SCRIPT_ID || !cfg.LEGACY_SPREADSHEET_ID) return false;
    try {
      return String(ScriptApp.getScriptId() || '') === String(cfg.LEGACY_SCRIPT_ID);
    } catch (error) {
      return false;
    }
  }

  function resolveSpreadsheetId() {
    var cfg = installationConfig_();
    var stored = readStoredIds_();

    // Em projetos vinculados, Document Properties pertencem ao próprio container
    // e são a âncora mais forte para o Web App. Se o Script Property divergir,
    // corrige-o automaticamente para evitar deriva entre execuções RPC.
    if (stored.document) {
      if (stored.script !== stored.document) {
        scriptProperties_().setProperty(propertyKey_(), stored.document);
      }
      return stored.document;
    }

    if (stored.script) {
      var documentStore = documentProperties_();
      if (documentStore && !stored.document) {
        documentStore.setProperty(propertyKey_(), stored.script);
      }
      return stored.script;
    }

    // Compatibilidade antiga ficou explicitamente desativada no pacote
    // distribuível. Só pode ser reativada por configuração consciente.
    if (isLegacyProject_()) return TextUtil.text(cfg.LEGACY_SPREADSHEET_ID);

    throw new Error('O vínculo da base instalada não foi encontrado neste projeto. Abra a planilha instalada e execute Destaque Acadêmico > Verificar instalação.');
  }

  function reset() {
    spreadsheet = null;
    sheetCache = {};
    PerformanceCache.remove(CONFIG.PERFORMANCE.OWNER_CACHE_KEY);
  }

  function bindSpreadsheetId(spreadsheetId) {
    var id = TextUtil.text(spreadsheetId);
    if (!id) throw new Error('Não foi possível vincular a base: ID da planilha não informado.');
    var key = propertyKey_();
    scriptProperties_().setProperty(key, id);
    var documentStore = documentProperties_();
    if (documentStore) documentStore.setProperty(key, id);
    reset();
    return id;
  }

  function clearBinding() {
    var key = propertyKey_();
    scriptProperties_().deleteProperty(key);
    var documentStore = documentProperties_();
    if (documentStore) documentStore.deleteProperty(key);
    reset();
  }

  function getConfiguredSpreadsheetId() {
    var stored = readStoredIds_();
    return stored.document || stored.script || '';
  }

  function getBindingDiagnostics() {
    var stored = readStoredIds_();
    var resolved = '';
    var opened = '';
    var error = '';
    try {
      resolved = resolveSpreadsheetId();
      opened = getSpreadsheet().getId();
    } catch (e) {
      error = e && e.message ? e.message : String(e);
    }
    return {
      scriptId: (function () { try { return String(ScriptApp.getScriptId() || ''); } catch (e2) { return ''; } })(),
      scriptPropertyDatabaseId: stored.script,
      documentPropertyDatabaseId: stored.document,
      resolvedDatabaseId: resolved,
      openedDatabaseId: opened,
      consistent: Boolean(resolved && opened && String(resolved) === String(opened) && (!stored.document || String(stored.document) === String(resolved))),
      error: error
    };
  }

  function getSpreadsheet() {
    var id = resolveSpreadsheetId();
    if (!spreadsheet || String(spreadsheet.getId()) !== String(id)) {
      spreadsheet = SpreadsheetApp.openById(id);
      sheetCache = {};
    }
    return spreadsheet;
  }

  function getSheet(sheetName, required) {
    var mustExist = required !== false;
    // Abrir a base pode substituir o cache; faça isso antes de capturar
    // a referência usada na atribuição da aba.
    var currentSpreadsheet = getSpreadsheet();
    if (!Object.prototype.hasOwnProperty.call(sheetCache, sheetName)) {
      sheetCache[sheetName] = currentSpreadsheet.getSheetByName(sheetName) || null;
    }
    if (!sheetCache[sheetName] && mustExist) {
      var diagnostics = getBindingDiagnostics();
      console.error('Estrutura ausente no runtime. Aba=' + sheetName + '; resolved=' + diagnostics.resolvedDatabaseId + '; opened=' + diagnostics.openedDatabaseId + '; scriptProperty=' + diagnostics.scriptPropertyDatabaseId + '; documentProperty=' + diagnostics.documentPropertyDatabaseId + '.');
      throw new Error('A estrutura obrigatória "' + sheetName + '" não foi encontrada na base instalada. Execute Destaque Acadêmico > Verificar instalação na planilha instalada e atualize a implantação do Web App.');
    }
    return sheetCache[sheetName];
  }

  function getOwnerEmail() {
    var cached = PerformanceCache.get(CONFIG.PERFORMANCE.OWNER_CACHE_KEY);
    if (cached) return TextUtil.normalizeEmail(cached);

    var ownerEmail = '';
    try {
      var owner = getSpreadsheet().getOwner();
      ownerEmail = TextUtil.normalizeEmail(owner && typeof owner.getEmail === 'function' ? owner.getEmail() : '');
    } catch (error) {
      console.warn('Não foi possível obter o proprietário da planilha: ' + (error && error.message ? error.message : error));
    }

    if (!ownerEmail) {
      try {
        ownerEmail = TextUtil.normalizeEmail(Session.getEffectiveUser().getEmail());
      } catch (error2) {
        console.warn('Não foi possível obter o usuário efetivo: ' + (error2 && error2.message ? error2.message : error2));
      }
    }

    if (ownerEmail) {
      PerformanceCache.put(CONFIG.PERFORMANCE.OWNER_CACHE_KEY, ownerEmail, CONFIG.PERFORMANCE.OWNER_CACHE_TTL_SECONDS);
    }
    return ownerEmail;
  }

  return Object.freeze({
    resolveSpreadsheetId: resolveSpreadsheetId,
    bindSpreadsheetId: bindSpreadsheetId,
    clearBinding: clearBinding,
    getConfiguredSpreadsheetId: getConfiguredSpreadsheetId,
    getBindingDiagnostics: getBindingDiagnostics,
    reset: reset,
    getSpreadsheet: getSpreadsheet,
    getSheet: getSheet,
    getOwnerEmail: getOwnerEmail
  });
})();

/**
 * DAO de baixo nível para planilhas.
 * - leituras em bloco (getValues uma vez por faixa);
 * - processamento em memória;
 * - gravações em lote (setValues por bloco), nunca célula a célula.
 */
var SheetDAO = (function () {
  function readTable(sheetName, columnCount) {
    var sheet = SpreadsheetGateway.getSheet(sheetName, true);
    var lastRow = sheet.getLastRow();
    if (lastRow < 1) return { headers: [], rows: [], lastRow: 0 };

    // Não limita a leitura ao número esperado de colunas. Durante migrações de
    // esquema, uma coluna obrigatória pode ter sido deslocada para a direita.
    // Ler toda a largura física evita falsos erros de "coluna não encontrada"
    // e mantém o mapeamento por nome de cabeçalho como fonte de verdade.
    var requestedColumns = Math.max(1, Number(columnCount) || 1);
    var physicalColumns = Math.max(1, sheet.getLastColumn());
    var readColumns = Math.max(requestedColumns, physicalColumns);
    var values = sheet.getRange(1, 1, lastRow, readColumns).getValues();
    return {
      headers: values[0] || [],
      rows: values.length > 1 ? values.slice(1) : [],
      lastRow: lastRow,
      columnCount: readColumns
    };
  }

  function ensureCapacity_(sheet, requiredRows, requiredColumns) {
    var maxRows = sheet.getMaxRows();
    var maxColumns = sheet.getMaxColumns();
    if (requiredRows > maxRows) sheet.insertRowsAfter(maxRows, requiredRows - maxRows);
    if (requiredColumns > maxColumns) sheet.insertColumnsAfter(maxColumns, requiredColumns - maxColumns);
  }

  function writeRowsInBatches_(sheet, startRow, startColumn, rows) {
    if (!rows || !rows.length) return;
    var batchSize = Math.max(1, Number(CONFIG.PERFORMANCE.WRITE_BATCH_ROWS) || 2000);
    var columnCount = rows[0].length;
    ensureCapacity_(sheet, startRow + rows.length - 1, startColumn + columnCount - 1);
    for (var offset = 0; offset < rows.length; offset += batchSize) {
      var chunk = rows.slice(offset, offset + batchSize);
      sheet.getRange(startRow + offset, startColumn, chunk.length, columnCount).setValues(chunk);
    }
  }

  function replaceBody(sheetName, rows, columnCount) {
    assertWritable_(sheetName);
    var sheet = SpreadsheetGateway.getSheet(sheetName, true);
    var existingBodyRows = Math.max(0, sheet.getLastRow() - 1);
    var safeRows = rows || [];

    writeRowsInBatches_(sheet, 2, 1, safeRows);

    if (existingBodyRows > safeRows.length) {
      sheet.getRange(2 + safeRows.length, 1, existingBodyRows - safeRows.length, columnCount).clearContent();
    }
  }

  function appendRows(sheetName, rows) {
    if (!rows || !rows.length) return;
    assertWritable_(sheetName);
    var sheet = SpreadsheetGateway.getSheet(sheetName, true);
    var startRow = Math.max(2, sheet.getLastRow() + 1);
    writeRowsInBatches_(sheet, startRow, 1, rows);
  }

  function updateRowsByIndex(sheetName, entries, columnCount) {
    if (!entries || !entries.length) return;
    assertWritable_(sheetName);
    var sheet = SpreadsheetGateway.getSheet(sheetName, true);
    var ordered = entries.slice().sort(function (a, b) { return Number(a.index) - Number(b.index); });
    var groups = [];
    var current = null;

    ordered.forEach(function (entry) {
      var index = Number(entry.index);
      if (!Number.isInteger(index) || index < 0 || !Array.isArray(entry.row)) return;
      if (!current || index !== current.lastIndex + 1) {
        current = { startIndex: index, lastIndex: index, rows: [entry.row] };
        groups.push(current);
      } else {
        current.lastIndex = index;
        current.rows.push(entry.row);
      }
    });

    groups.forEach(function (group) {
      var rows = group.rows.map(function (row) {
        var safe = new Array(columnCount).fill('');
        for (var i = 0; i < columnCount; i++) safe[i] = i < row.length ? row[i] : '';
        return safe;
      });
      writeRowsInBatches_(sheet, 2 + group.startIndex, 1, rows);
    });
  }

  function headerMap(headers) {
    var map = {};
    (headers || []).forEach(function (header, index) {
      var key = TextUtil.text(header);
      if (key && map[key] === undefined) map[key] = index;
    });
    return map;
  }

  function assertWritable_(sheetName) {
    if (typeof LifecycleBatchDAO !== 'undefined') LifecycleBatchDAO.assertWritable(sheetName);
  }

  function requireHeaders(headers, requiredHeaders, contextLabel) {
    var map = headerMap(headers);
    (requiredHeaders || []).forEach(function (header) {
      if (map[header] === undefined) {
        throw new Error('A coluna obrigatória "' + header + '" não foi encontrada em ' + (contextLabel || 'planilha') + '.');
      }
    });
    return map;
  }

  return Object.freeze({
    readTable: readTable,
    replaceBody: replaceBody,
    appendRows: appendRows,
    updateRowsByIndex: updateRowsByIndex,
    headerMap: headerMap,
    requireHeaders: requireHeaders
  });
})();
