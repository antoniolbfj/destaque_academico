var ApurationService = (function () {
  function normalizeContext_(payload) {
    var source = payload || {};
    var type = TextUtil.text(source.dataType).toUpperCase();
    var schema = DataImportModel.schema(type);
    var year = DataImportModel.normalizeYear(source.year);
    var semester = source.semester === '' || source.semester === null || source.semester === undefined ? null : Number(source.semester);
    if (schema.requiresSemester && semester !== 1 && semester !== 2) throw new Error('Informe o semestre.');
    return { dataType: type, regime: type, year: year, semester: schema.requiresSemester ? semester : null };
  }

  function activePrizeList_() {
    return PrizeDAO.list().filter(function (p) {
      return p.status === CONFIG.PRIZE_STATUS.ACTIVE && p.category === CONFIG.PRIZE_CATEGORIES.REGULAR;
    });
  }

  function occurrenceStatusMap_(context, referenceDate) {
    var map = {};
    OccurrenceDAO.list().filter(function (r) { return PermanentRecordModel.matchesContext(r, context); }).forEach(function (r) {
      if (!map[r.ra]) map[r.ra] = { all: [], active: [] };
      map[r.ra].all.push(r);
      if (RecordLifecycleService.occurrenceActive(r, referenceDate)) map[r.ra].active.push(r);
    });
    return map;
  }

  function awardMap_(context) {
    var map = {};
    // A Mesa regular enxerga somente concessões originadas nela própria.
    // Prêmios complementares e extraordinários não podem bloquear nem alterar
    // o estado visual da apuração acadêmica regular.
    AwardeeDAO.list().filter(function (r) {
      return r.origin === CONFIG.AWARDEE_ORIGINS.APURATION && PermanentRecordModel.matchesContext(r, context);
    }).forEach(function (r) {
      if (!map[r.ra]) map[r.ra] = [];
      map[r.ra].push(r);
    });
    return map;
  }

  function publicStudent_(student, context, referenceDate, packageData, awardMap, occurrenceMap, position) {
    var criteria = packageData && packageData.package
      ? CriteriaEngine.evaluate(student, packageData.package.rules || [], packageData.parameters || [])
      : { active: false, passed: false, passedCount: 0, ruleCount: 0, details: [] };
    var awards = awardMap[student.RA] || [];
    var occurrences = occurrenceMap[student.RA] || { all: [], active: [] };
    var status = occurrences.active.length ? 'INELEGÍVEL' : (awards.length ? 'PREMIADO' : 'EM APURAÇÃO');
    return {
      position: position,
      ra: student.RA,
      name: student.NOME,
      course: student.CURSO,
      movement: student.MOVIMENTO_ATUAL || '',
      coursePeriod: student.PERIODO_CURSO === undefined ? '' : student.PERIODO_CURSO,
      classGroup: student.TURMA || '',
      language: student.IDIOMA || '',
      frequency: student.FREQUENCIA_GLOBAL === undefined ? null : student.FREQUENCIA_GLOBAL,
      subjectCount: student.NUMERO_DISCIPLINAS || 0,
      semestersCompleted: student.SEMESTRES_CURSADOS === undefined ? null : student.SEMESTRES_CURSADOS,
      expectedDisciplines: student.DISCIPLINAS_PREVISTAS === undefined ? null : student.DISCIPLINAS_PREVISTAS,
      takenDisciplines: student.DISCIPLINAS_CURSADAS_PERIODO === undefined ? null : student.DISCIPLINAS_CURSADAS_PERIODO,
      minimum50Plus1: student.MINIMO_50_MAIS_1 === undefined ? null : student.MINIMO_50_MAIS_1,
      approvedDisciplines: student.DISCIPLINAS_APROVADAS_PERIODO === undefined ? null : student.DISCIPLINAS_APROVADAS_PERIODO,
      failures: student.NUMERO_REPROVACOES === undefined ? null : student.NUMERO_REPROVACOES,
      gradeSum: student.SOMATORIO_NOTAS_PERIODO === undefined ? null : student.SOMATORIO_NOTAS_PERIODO,
      average: student.MEDIA_NOTAS_PERIODO !== undefined ? student.MEDIA_NOTAS_PERIODO :
        (student.MEDIA_NOTAS !== undefined ? student.MEDIA_NOTAS : null),
      trimester1Average: student.MEDIA_1_TRIMESTRE === undefined ? null : student.MEDIA_1_TRIMESTRE,
      trimester2Average: student.MEDIA_2_TRIMESTRE === undefined ? null : student.MEDIA_2_TRIMESTRE,
      trimester3Average: student.MEDIA_3_TRIMESTRE === undefined ? null : student.MEDIA_3_TRIMESTRE,
      criteriaActive: criteria.active,
      criteriaPassed: criteria.active ? criteria.passed : null,
      criteriaPassedCount: criteria.passedCount,
      criteriaRuleCount: criteria.ruleCount,
      criteriaDetails: criteria.details,
      status: status,
      awards: awards.map(function (a) { return {
        id: a.id, prizeId: a.prizeId, prize: a.prize, status: a.status, average: a.average, frequency: a.frequency,
        classificationIndicator: a.classificationIndicator, classificationValue: a.classificationValue,
        position: a.position, justification: a.justification, packageId: a.packageId || ''
      }; }),
      occurrences: occurrences.all.map(function (o) {
        return { id: o.id, effectiveFrom: o.effectiveFrom, effectiveTo: o.effectiveTo, justification: o.justification, status: o.status,
          packageId: o.packageId || '', activeAtReferenceDate: RecordLifecycleService.occurrenceActive(o, referenceDate) };
      })
    };
  }

  function packageFor_(context, packageId) {
    // Anual possui estratégia nativa (média das notas por trimestre) e não usa pacote.
    if (context.regime === DataImportModel.TYPES.ANNUAL) {
      return { package: null, packages: [], parameters: [], fields: CriteriaCatalog.list(context.regime) };
    }

    var active = ParameterService.activePackages(context.regime);
    var packages = active.packages || [];
    var id = TextUtil.text(packageId);
    var selected = id ? packages.find(function (p) { return p.id === id; }) || null : null;

    if (context.regime === DataImportModel.TYPES.SEMESTRAL) {
      if (!packages.length) {
        throw new Error('Não existe pacote de parâmetros SEMESTRAL ativo. Ative um pacote antes de iniciar a apuração.');
      }
      if (packages.length > 1) {
        throw new Error('Foram encontrados dois ou mais pacotes SEMESTRAIS ativos. Regularize os pacotes antes de continuar.');
      }
      selected = selected || packages[0];
      if (id && selected.id !== id) throw new Error('O pacote de parâmetros selecionado não está ativo para a apuração semestral.');
    } else if (!selected && packages.length === 1) {
      selected = packages[0];
    }

    return { package: selected, packages: packages, parameters: active.parameters || [], fields: active.fields || [] };
  }

  function getBootstrap(actor) {
    AuthorizationService.requireManageRecords(actor);
    return {
      actor: UserModel.publicIdentity(actor),
      transitionJob: LifecycleBatchService.activeProgress(actor),
      dataSets: ApurationDAO.listDataSets(),
      prizes: activePrizeList_(),
      regimes: PermanentRecordModel.REGIMES.slice()
    };
  }

  function getWorkspace(actor, payload) {
    AuthorizationService.requireManageRecords(actor);
    var context = normalizeContext_(payload);
    var referenceDate = TextUtil.text(payload && payload.referenceDate) || ApurationEngine.defaultReferenceDate(context);
    if (referenceDate) PermanentRecordModel.normalizeDateOnly(referenceDate);

    var packageData = packageFor_(context, payload && payload.packageId);
    var runtimeConfig = ParameterService.runtimeConfig(packageData);
    var rows = ApurationDAO.readContext(context);
    var matrixRows = context.dataType === DataImportModel.TYPES.SEMESTRAL ? ApurationDAO.readMatrixRows() : [];
    var students = ApurationEngine.aggregate(context.dataType, rows, matrixRows, referenceDate, runtimeConfig);
    var awards = awardMap_(context);
    var occurrences = occurrenceStatusMap_(context, referenceDate);
    var lifecycle = RecordLifecycleService.statusSummary(context);

    students.sort(function (a, b) {
      var am = a.MEDIA_NOTAS_PERIODO !== undefined ? a.MEDIA_NOTAS_PERIODO :
        (a.MEDIA_NOTAS !== undefined ? a.MEDIA_NOTAS : (a.MEDIA_1_TRIMESTRE !== undefined ? a.MEDIA_1_TRIMESTRE : -Infinity));
      var bm = b.MEDIA_NOTAS_PERIODO !== undefined ? b.MEDIA_NOTAS_PERIODO :
        (b.MEDIA_NOTAS !== undefined ? b.MEDIA_NOTAS : (b.MEDIA_1_TRIMESTRE !== undefined ? b.MEDIA_1_TRIMESTRE : -Infinity));
      return Number(bm === null ? -Infinity : bm) - Number(am === null ? -Infinity : am) || TextUtil.localeComparePt(a.NOME, b.NOME);
    });

    return {
      context: context,
      dataSet: {
        key: context.dataType + '|' + context.year + '|' + (context.semester || ''),
        label: context.dataType === 'SEMESTRAL' ? context.dataType + ' — ' + context.year + '/' + context.semester : context.dataType + ' — ' + context.year,
        rowCount: rows.length,
        raCount: students.length
      },
      referenceDate: referenceDate,
      lifecycle: lifecycle,
      prizes: activePrizeList_(),
      criteria: {
        selectedPackageId: packageData.package ? packageData.package.id : '',
        selectedPackage: packageData.package,
        packages: packageData.packages,
        fields: packageData.fields
      },
      students: students.map(function (student, index) {
        return publicStudent_(student, context, referenceDate, packageData, awards, occurrences, index + 1);
      }),
      excludedComponents: runtimeConfig.excludedComponents || []
    };
  }

  function getStudentDetails(actor, payload) {
    AuthorizationService.requireManageRecords(actor);
    var context = normalizeContext_(payload);
    var ra = TextUtil.text(payload && payload.ra).toUpperCase();
    if (!ra) throw new Error('RA não informado.');
    var rows = ApurationDAO.studentDetails(context, ra);
    var schema = DataImportModel.schema(context.dataType);
    var serializableRows = rows.map(function (row) {
      return row.map(function (value) {
        if (value instanceof Date && !isNaN(value.getTime())) {
          return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy');
        }
        return value;
      });
    });
    return { headers: schema.targetHeaders.slice(), rows: serializableRows };
  }

  function saveDecisions(actor, payload) {
    var result = RecordLifecycleService.saveBatch(actor, payload);
    return { result: result, workspace: getWorkspace(actor, payload) };
  }

  function transition(actor, payload) {
    var next = TextUtil.text(payload && payload.nextStatus).toUpperCase();
    return { result: RecordLifecycleService.transition(actor, payload, next), workspace: null };
  }

  function processTransition(actor, jobId) {
    var result = LifecycleBatchService.process(actor, jobId);
    return { result: result, workspace: result.done && result.nextStatus === CONFIG.RECORD_STATUS.PUBLISHED
      ? getWorkspace(actor, result.workspaceContext) : null };
  }

  return Object.freeze({
    getBootstrap: getBootstrap,
    getWorkspace: getWorkspace,
    getStudentDetails: getStudentDetails,
    saveDecisions: saveDecisions,
    transition: transition,
    processTransition: processTransition
  });
})();
