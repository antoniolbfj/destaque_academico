/**
 * Motor puro da Mesa de Apuração.
 * Transforma linhas aluno x disciplina em uma visão consolidada por RA.
 * Não persiste dados e não decide quem deve ser premiado.
 */
var ApurationEngine = (function () {
  function normalizeText_(value) {
    return TextUtil.text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  }

  function excludedList_(options) {
    var source = options && Array.isArray(options.excludedComponents) ? options.excludedComponents : [];
    var seen = {};
    return source.map(normalizeText_).filter(function (item) {
      if (!item || seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }

  function isExcluded_(subject, excludedComponents) {
    var value = normalizeText_(subject);
    if (!value) return false;
    return (excludedComponents || []).some(function (prefix) {
      return value === prefix || value.indexOf(prefix + ' ') === 0 || value.indexOf(prefix + ' -') === 0;
    });
  }

  function number_(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    var raw = TextUtil.text(value).replace(/\s/g, '');
    if (!raw) return null;
    if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+,\d+$/.test(raw)) raw = raw.replace(',', '.');
    var n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function date_(value) {
    if (value instanceof Date && !isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    var raw = TextUtil.text(value);
    if (!raw) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(raw);
    if (m) return new Date(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    var parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  function daysBetween_(a, b) {
    return Math.floor((b.getTime() - a.getTime()) / 86400000);
  }

  function enrollmentDate_(value) {
    if (value instanceof Date && !isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    var raw = TextUtil.text(value);
    var iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(raw);
    var brazilian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
    // Compatibilidade com m/d/yy usado pelo leitor XLS nas importações antigas.
    var legacy = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(raw);
    if (!iso && !brazilian && !legacy) return null;
    var year = iso ? Number(iso[1]) : (brazilian ? Number(brazilian[3]) : 2000 + Number(legacy[3]));
    var month = Number(iso ? iso[2] : (brazilian ? brazilian[2] : legacy[1]));
    var day = Number(iso ? iso[3] : (brazilian ? brazilian[1] : legacy[2]));
    var date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  function semestralCoursePeriod(firstEnrollment, lastEnrollment) {
    var first = enrollmentDate_(firstEnrollment);
    var last = enrollmentDate_(lastEnrollment);
    if (!first || !last || last < first) return null;
    // Janeiro a junho e julho a dezembro; ingresso já é o primeiro período.
    return (last.getFullYear() - first.getFullYear()) * 2 +
      Math.floor(last.getMonth() / 6) - Math.floor(first.getMonth() / 6) + 1;
  }

  function semestralCoursePeriodMap(rows) {
    var idx = DataImportModel.targetIndexMap(DataImportModel.TYPES.SEMESTRAL);
    var dates = {};
    (rows || []).forEach(function (row) {
      var ra = DataImportModel.normalizeRa(row[idx.RA]);
      if (!ra) return;
      var item = dates[ra] || (dates[ra] = { first: null, last: null });
      var first = enrollmentDate_(row[idx['Data da matrícula']]);
      var last = enrollmentDate_(row[idx['Data da última matricula']]);
      if (first && (!item.first || first < item.first)) item.first = first;
      if (last && (!item.last || last > item.last)) item.last = last;
    });
    var periods = {};
    Object.keys(dates).forEach(function (ra) { periods[ra] = semestralCoursePeriod(dates[ra].first, dates[ra].last); });
    return periods;
  }

  function average_(values) {
    var nums = (values || []).filter(function (v) { return v !== null && v !== undefined && Number.isFinite(Number(v)); }).map(Number);
    if (!nums.length) return null;
    return nums.reduce(function (sum, v) { return sum + v; }, 0) / nums.length;
  }

  function matrixMap(matrixRows) {
    var map = {};
    (matrixRows || []).forEach(function (row) {
      var course = TextUtil.text(row[0]);
      var period = Number(row[1]);
      var count = number_(row[2]);
      if (!course || !Number.isInteger(period) || count === null) return;
      map[normalizeText_(course) + '|' + period] = count;
    });
    return map;
  }

  function expectedDisciplines_(matrix, course, period) {
    var value = matrix[normalizeText_(course) + '|' + Number(period)];
    return value === undefined ? null : Number(value);
  }

  /**
   * Regime anual: a estratégia é nativa do sistema.
   * Para cada trimestre, calcula a média das notas das disciplinas do estudante.
   */
  function aggregateAnnual(rows) {
    var idx = DataImportModel.targetIndexMap(DataImportModel.TYPES.ANNUAL);
    var byRa = {};
    (rows || []).forEach(function (row) {
      var ra = DataImportModel.normalizeRa(row[idx.RA]);
      if (!ra) return;
      var item = byRa[ra] || (byRa[ra] = {
        RA: ra, NOME: TextUtil.text(row[idx['NOME COMPLETO']]), CURSO: TextUtil.text(row[idx.CURSO]),
        PERIODO_CURSO: row[idx['PERÍODO']], TURMA: TextUtil.text(row[idx.TURMA]),
        FREQUENCIA_GLOBAL: number_(row[idx['FREQUÊNCIA GLOBAL (%)']]),
        DISCIPLINAS: 0, T1: [], T2: [], T3: []
      });
      item.DISCIPLINAS++;
      var a = number_(row[idx['SOMATÓRIO 1º TRIMESTRE']]);
      var b = number_(row[idx['SOMATÓRIO 2º TRIMESTRE']]);
      var c = number_(row[idx['SOMATÓRIO 3º TRIMESTRE']]);
      if (a !== null) item.T1.push(a);
      if (b !== null) item.T2.push(b);
      if (c !== null) item.T3.push(c);
    });
    return Object.keys(byRa).map(function (ra) {
      var i = byRa[ra];
      return {
        RA: i.RA, NOME: i.NOME, CURSO: i.CURSO, PERIODO_CURSO: i.PERIODO_CURSO, TURMA: i.TURMA,
        FREQUENCIA_GLOBAL: i.FREQUENCIA_GLOBAL, NUMERO_DISCIPLINAS: i.DISCIPLINAS,
        MEDIA_1_TRIMESTRE: average_(i.T1), MEDIA_2_TRIMESTRE: average_(i.T2), MEDIA_3_TRIMESTRE: average_(i.T3)
      };
    });
  }

  function aggregateSemestral(rows, matrixRows, referenceDate, options) {
    var idx = DataImportModel.targetIndexMap(DataImportModel.TYPES.SEMESTRAL);
    var matrix = matrixMap(matrixRows);
    var excludedComponents = excludedList_(options);
    var ref = date_(referenceDate);
    if (!ref) throw new Error('Informe uma data de referência válida para a apuração semestral.');
    var byRa = {};
    var coursePeriods = semestralCoursePeriodMap(rows);

    (rows || []).forEach(function (row) {
      var ra = DataImportModel.normalizeRa(row[idx.RA]);
      if (!ra) return;
      var item = byRa[ra] || (byRa[ra] = {
        RA: ra, NOME: TextUtil.text(row[idx.Nome]), CURSO: TextUtil.text(row[idx.Curso]),
        MOVIMENTO_ATUAL: TextUtil.text(row[idx['Movimento atual']]), firstEnrollment: null, rows: []
      });
      var enrollment = date_(row[idx['Data da matrícula']]);
      if (enrollment && (!item.firstEnrollment || enrollment < item.firstEnrollment)) item.firstEnrollment = enrollment;
      if (!item.NOME) item.NOME = TextUtil.text(row[idx.Nome]);
      if (!item.CURSO) item.CURSO = TextUtil.text(row[idx.Curso]);
      if (!item.MOVIMENTO_ATUAL) item.MOVIMENTO_ATUAL = TextUtil.text(row[idx['Movimento atual']]);
      item.rows.push(row);
    });

    return Object.keys(byRa).map(function (ra) {
      var item = byRa[ra];
      var semesters = item.firstEnrollment ? Math.max(1, Math.round(daysBetween_(item.firstEnrollment, ref) / 185.5)) : null;
      var expected = semesters === null ? null : expectedDisciplines_(matrix, item.CURSO, semesters);
      var considered = [];
      var failures = 0;
      var approved = 0;
      var sum = 0;

      item.rows.forEach(function (row) {
        var situation = normalizeText_(row[idx['Situação']]);
        var result = normalizeText_(row[idx.Resultado]);
        var period = number_(row[idx['Período']]);
        var subject = TextUtil.text(row[idx.Disciplina]);
        var excluded = isExcluded_(subject, excludedComponents);
        var isTaken = situation === 'CURSADA';
        if (isTaken && !excluded && (result === 'REPROVADO' || result === 'REPROVADO POR INFREQUENCIA')) failures++;
        if (isTaken && !excluded && semesters !== null && Number(period) === Number(semesters)) {
          var grade = number_(row[idx['Total da nota']]);
          considered.push({ subject: subject, grade: grade, result: result });
          if (result === 'APROVADO') approved++;
          if (grade !== null) sum += grade;
        }
      });

      var taken = considered.length;
      var minimum = expected === null ? null : (expected / 2 + 1);
      return {
        RA: item.RA, NOME: item.NOME, CURSO: item.CURSO, MOVIMENTO_ATUAL: item.MOVIMENTO_ATUAL,
        PERIODO_CURSO: coursePeriods[ra],
        SEMESTRES_CURSADOS: semesters, DISCIPLINAS_PREVISTAS: expected,
        DISCIPLINAS_CURSADAS_PERIODO: taken, MINIMO_50_MAIS_1: minimum,
        DISCIPLINAS_APROVADAS_PERIODO: approved, NUMERO_REPROVACOES: failures,
        SOMATORIO_NOTAS_PERIODO: taken ? sum : 0, MEDIA_NOTAS_PERIODO: taken ? sum / taken : null,
        NUMERO_DISCIPLINAS: item.rows.length
      };
    });
  }

  function languageFromCourse_(course) {
    var c = normalizeText_(course);
    if (c.indexOf('INGLES') >= 0) return 'Inglês';
    if (c.indexOf('ESPANHOL') >= 0) return 'Espanhol';
    if (c.indexOf('FRANCES') >= 0) return 'Francês';
    return TextUtil.text(course);
  }

  function aggregateCenid(rows) {
    var idx = DataImportModel.targetIndexMap(DataImportModel.TYPES.CENID);
    var byRa = {};
    (rows || []).forEach(function (row) {
      var ra = DataImportModel.normalizeRa(row[idx.RA]);
      if (!ra) return;
      var item = byRa[ra] || (byRa[ra] = {
        RA: ra, NOME: TextUtil.text(row[idx.Nome]), CURSO: TextUtil.text(row[idx.Curso]),
        MOVIMENTO_ATUAL: TextUtil.text(row[idx['Movimento atual']]), PERIODO_CURSO: row[idx['Período']],
        grades: [], failures: 0, count: 0
      });
      item.count++;
      if (normalizeText_(row[idx['Situação']]) === 'CURSADA') {
        var grade = number_(row[idx['Total da nota']]);
        if (grade !== null) item.grades.push(grade);
        var result = normalizeText_(row[idx.Resultado]);
        if (result === 'REPROVADO' || result === 'REPROVADO POR INFREQUENCIA') item.failures++;
      }
    });
    return Object.keys(byRa).map(function (ra) {
      var i = byRa[ra];
      return {
        RA: i.RA, NOME: i.NOME, CURSO: i.CURSO, IDIOMA: languageFromCourse_(i.CURSO),
        MOVIMENTO_ATUAL: i.MOVIMENTO_ATUAL, PERIODO_CURSO: i.PERIODO_CURSO,
        MEDIA_NOTAS: average_(i.grades), NUMERO_REPROVACOES: i.failures, NUMERO_DISCIPLINAS: i.count
      };
    });
  }

  function aggregate(type, rows, matrixRows, referenceDate, options) {
    if (type === DataImportModel.TYPES.ANNUAL) return aggregateAnnual(rows);
    if (type === DataImportModel.TYPES.SEMESTRAL) return aggregateSemestral(rows, matrixRows || [], referenceDate, options || {});
    if (type === DataImportModel.TYPES.CENID) return aggregateCenid(rows);
    throw new Error('Tipo de conjunto não suportado pela Mesa de Apuração.');
  }

  function defaultReferenceDate(context) {
    var year = Number(context && context.year);
    if (!Number.isInteger(year)) return '';
    if (context && context.dataType === DataImportModel.TYPES.SEMESTRAL) {
      return context.semester === 1 ? year + '-07-31' : year + '-12-31';
    }
    var today = new Date();
    var m = String(today.getMonth() + 1).padStart(2, '0');
    var d = String(today.getDate()).padStart(2, '0');
    return today.getFullYear() + '-' + m + '-' + d;
  }

  return Object.freeze({
    aggregate: aggregate,
    aggregateAnnual: aggregateAnnual,
    aggregateSemestral: aggregateSemestral,
    aggregateCenid: aggregateCenid,
    matrixMap: matrixMap,
    semestralCoursePeriod: semestralCoursePeriod,
    semestralCoursePeriodMap: semestralCoursePeriodMap,
    defaultReferenceDate: defaultReferenceDate
  });
})();
