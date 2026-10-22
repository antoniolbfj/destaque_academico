var PermanentRecordModel = (function () {
  var REGIMES = Object.freeze(['ANUAL', 'SEMESTRAL', 'CENID']);

  function normalizeRegime(value) {
    var regime = TextUtil.text(value).toUpperCase();
    if (REGIMES.indexOf(regime) < 0) throw new Error('Regime acadêmico inválido.');
    return regime;
  }

  function normalizeYear(value) {
    var year = Number(value);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error('Informe um ano válido.');
    return year;
  }

  function normalizeSemester(regime, value) {
    var semester = value === '' || value === null || value === undefined ? null : Number(value);
    if (regime === 'SEMESTRAL') {
      if (semester !== 1 && semester !== 2) throw new Error('Informe o semestre (1 ou 2).');
      return semester;
    }
    return null;
  }

  function normalizeStatus(value, fallback) {
    var status = TextUtil.text(value || fallback).toUpperCase();
    var allowed = [CONFIG.RECORD_STATUS.UNDER_REVIEW, CONFIG.RECORD_STATUS.PUBLISHED, CONFIG.RECORD_STATUS.APPROVED];
    if (allowed.indexOf(status) < 0) throw new Error('Situação administrativa inválida.');
    return status;
  }

  function normalizeOptionalNumber(value, label) {
    if (value === '' || value === null || value === undefined) return null;
    var number = Number(value);
    if (!Number.isFinite(number)) throw new Error((label || 'Valor') + ' inválido.');
    return number;
  }

  function normalizeOptionalInteger(value, label) {
    var number = normalizeOptionalNumber(value, label);
    if (number === null) return null;
    if (!Number.isInteger(number)) throw new Error((label || 'Valor') + ' deve ser inteiro.');
    return number;
  }

  function normalizeDateOnly(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      var y = value.getFullYear();
      var m = String(value.getMonth() + 1).padStart(2, '0');
      var d = String(value.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + d;
    }
    var raw = TextUtil.text(value);
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) throw new Error('Informe a data no formato AAAA-MM-DD.');
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      throw new Error('Informe uma data válida.');
    }
    return raw;
  }

  function normalizeOptionalDateOnly(value) {
    if (value === '' || value === null || value === undefined) return '';
    return normalizeDateOnly(value);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeContext(source) {
    var regime = normalizeRegime(source && source.regime);
    var year = normalizeYear(source && source.year);
    return {
      regime: regime,
      year: year,
      semester: normalizeSemester(regime, source && source.semester)
    };
  }


  function contextKey(source) {
    var context = normalizeContext(source || {});
    return context.regime + '|' + context.year + '|' + (context.semester === null ? '' : context.semester);
  }

  function matchesContext(record, source) {
    var context = normalizeContext(source || {});
    return record && record.regime === context.regime &&
      Number(record.year) === Number(context.year) &&
      (context.regime !== 'SEMESTRAL' || Number(record.semester) === Number(context.semester));
  }

  function matchesFilters(record, filters) {
    var f = filters || {};
    if (TextUtil.text(f.regime) && record.regime !== TextUtil.text(f.regime).toUpperCase()) return false;
    if (f.year !== '' && f.year !== null && f.year !== undefined && Number(record.year) !== Number(f.year)) return false;
    if (f.semester !== '' && f.semester !== null && f.semester !== undefined && Number(record.semester) !== Number(f.semester)) return false;
    if (TextUtil.text(f.status) && record.status !== TextUtil.text(f.status).toUpperCase()) return false;
    if (TextUtil.text(f.ra) && record.ra !== TextUtil.text(f.ra).toUpperCase()) return false;
    return true;
  }

  return Object.freeze({
    REGIMES: REGIMES,
    normalizeRegime: normalizeRegime,
    normalizeYear: normalizeYear,
    normalizeSemester: normalizeSemester,
    normalizeStatus: normalizeStatus,
    normalizeOptionalNumber: normalizeOptionalNumber,
    normalizeOptionalInteger: normalizeOptionalInteger,
    normalizeDateOnly: normalizeDateOnly,
    normalizeOptionalDateOnly: normalizeOptionalDateOnly,
    normalizeContext: normalizeContext,
    contextKey: contextKey,
    matchesContext: matchesContext,
    matchesFilters: matchesFilters,
    nowIso: nowIso
  });
})();
