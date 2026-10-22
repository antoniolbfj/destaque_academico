/** Serviço de leitura para o construtor flexível de relatórios de premiados. */
var AwardeeReportService = (function () {
  function fieldDefinitions_() {
    return [
      { key: 'idPremiacao', db: CONFIG.AWARDEE_HEADERS.ID, label: 'ID da premiação', group: 'Técnico', type: 'text' },
      { key: 'idPremio', db: CONFIG.AWARDEE_HEADERS.PRIZE_ID, label: 'ID do prêmio', group: 'Técnico', type: 'text' },
      { key: 'premio', db: CONFIG.AWARDEE_HEADERS.PRIZE, label: 'Prêmio', group: 'Premiação', type: 'text' },
      { key: 'categoria', db: CONFIG.PRIZE_HEADERS.CATEGORY, label: 'Categoria do prêmio', group: 'Premiação', type: 'enum' },
      { key: 'regime', db: CONFIG.AWARDEE_HEADERS.REGIME, label: 'Regime', group: 'Contexto acadêmico', type: 'enum' },
      { key: 'ano', db: CONFIG.AWARDEE_HEADERS.YEAR, label: 'Ano', group: 'Contexto acadêmico', type: 'number' },
      { key: 'semestre', db: CONFIG.AWARDEE_HEADERS.SEMESTER, label: 'Semestre', group: 'Contexto acadêmico', type: 'text' },
      { key: 'ra', db: CONFIG.AWARDEE_HEADERS.RA, label: 'RA', group: 'Estudante', type: 'text' },
      { key: 'nome', db: CONFIG.AWARDEE_HEADERS.NAME, label: 'Nome', group: 'Estudante', type: 'text' },
      { key: 'curso', db: CONFIG.AWARDEE_HEADERS.COURSE, label: 'Curso', group: 'Estudante', type: 'text' },
      { key: 'periodo', db: CONFIG.AWARDEE_HEADERS.COURSE_PERIOD, label: 'Período', group: 'Contexto acadêmico', type: 'text' },
      { key: 'turma', db: CONFIG.AWARDEE_HEADERS.CLASS_GROUP, label: 'Turma', group: 'Contexto acadêmico', type: 'text' },
      { key: 'idioma', db: CONFIG.AWARDEE_HEADERS.LANGUAGE, label: 'Idioma', group: 'Contexto acadêmico', type: 'text' },
      { key: 'media', db: CONFIG.AWARDEE_HEADERS.AVERAGE, label: 'Média apurada', group: 'Desempenho', type: 'number' },
      { key: 'frequencia', db: CONFIG.AWARDEE_HEADERS.FREQUENCY, label: 'Frequência', group: 'Desempenho', type: 'number' },
      { key: 'indicador', db: CONFIG.AWARDEE_HEADERS.CLASSIFICATION_INDICATOR, label: 'Indicador de classificação', group: 'Desempenho', type: 'text' },
      { key: 'valor', db: CONFIG.AWARDEE_HEADERS.CLASSIFICATION_VALUE, label: 'Valor de classificação', group: 'Desempenho', type: 'number' },
      { key: 'posicao', db: CONFIG.AWARDEE_HEADERS.POSITION, label: 'Posição', group: 'Desempenho', type: 'number' },
      { key: 'justificativa', db: CONFIG.AWARDEE_HEADERS.JUSTIFICATION, label: 'Justificativa', group: 'Premiação', type: 'text' },
      { key: 'situacao', db: CONFIG.AWARDEE_HEADERS.STATUS, label: 'Situação', group: 'Premiação', type: 'enum' },
      { key: 'registradoEm', db: CONFIG.AWARDEE_HEADERS.REGISTERED_AT, label: 'Registrado em', group: 'Auditoria', type: 'date' },
      { key: 'registradoPorEmail', db: CONFIG.AWARDEE_HEADERS.REGISTERED_BY_EMAIL, label: 'Registrado por — e-mail', group: 'Auditoria', type: 'text' },
      { key: 'registradoPorNome', db: CONFIG.AWARDEE_HEADERS.REGISTERED_BY_NAME, label: 'Registrado por — nome', group: 'Auditoria', type: 'text' },
      { key: 'publicadoEm', db: CONFIG.AWARDEE_HEADERS.PUBLISHED_AT, label: 'Publicado em', group: 'Auditoria', type: 'date' },
      { key: 'publicadoPorEmail', db: CONFIG.AWARDEE_HEADERS.PUBLISHED_BY_EMAIL, label: 'Publicado por — e-mail', group: 'Auditoria', type: 'text' },
      { key: 'publicadoPorNome', db: CONFIG.AWARDEE_HEADERS.PUBLISHED_BY_NAME, label: 'Publicado por — nome', group: 'Auditoria', type: 'text' },
      { key: 'homologadoEm', db: CONFIG.AWARDEE_HEADERS.APPROVED_AT, label: 'Homologado em', group: 'Auditoria', type: 'date' },
      { key: 'homologadoPorEmail', db: CONFIG.AWARDEE_HEADERS.APPROVED_BY_EMAIL, label: 'Homologado por — e-mail', group: 'Auditoria', type: 'text' },
      { key: 'homologadoPorNome', db: CONFIG.AWARDEE_HEADERS.APPROVED_BY_NAME, label: 'Homologado por — nome', group: 'Auditoria', type: 'text' },
      { key: 'origem', db: CONFIG.AWARDEE_HEADERS.ORIGIN, label: 'Origem da concessão', group: 'Premiação', type: 'enum' },
      { key: 'idPacote', db: CONFIG.AWARDEE_HEADERS.PACKAGE_ID, label: 'ID do pacote de parâmetros', group: 'Técnico', type: 'text' },
      { key: 'referencia', db: CONFIG.AWARDEE_HEADERS.ADMIN_REFERENCE, label: 'Referência administrativa', group: 'Premiação', type: 'text' }
    ];
  }

  function defaultModels_() {
    return [
      {
        id: 'padrao_completo',
        name: 'Modelo padrão — Relatório geral completo',
        description: 'Visão ampla dos premiados, com contexto, desempenho, situação e auditoria.',
        standard: true,
        config: {
          reportName: 'Relatório geral de premiados — completo',
          fields: ['nome','ra','curso','periodo','premio','categoria','regime','ano','semestre','situacao','media','frequencia','posicao','origem','justificativa','registradoEm','publicadoEm','homologadoEm','referencia'],
          filters: [], group1: 'ano', group2: 'categoria', showGroupRows: true,
          sort1: 'ano', dir1: 'desc', sort2: 'nome', dir2: 'asc', raw: false, showTitle: true, repeatHeader: true
        }
      },
      {
        id: 'homologados_ano',
        name: 'Premiados homologados por ano',
        description: 'Premiações homologadas agrupadas por ano e curso.',
        standard: true,
        config: {
          reportName: 'Premiados homologados por ano',
          fields: ['nome','ra','curso','premio','categoria','regime','ano','semestre','situacao','homologadoEm'],
          filters: [{ field: 'situacao', operator: '=', value: CONFIG.RECORD_STATUS.APPROVED }],
          group1: 'ano', group2: 'curso', showGroupRows: true,
          sort1: 'ano', dir1: 'desc', sort2: 'nome', dir2: 'asc', raw: false, showTitle: true, repeatHeader: true
        }
      },
      {
        id: 'extraordinarios',
        name: 'Prêmios extraordinários',
        description: 'Premiações excepcionais registradas manualmente, incluindo justificativa e referência administrativa.',
        standard: true,
        config: {
          reportName: 'Prêmios extraordinários',
          fields: ['nome','ra','curso','premio','categoria','ano','regime','semestre','situacao','justificativa','referencia','registradoEm','registradoPorNome','origem'],
          filters: [{ field: 'categoria', operator: '=', value: CONFIG.PRIZE_CATEGORIES.EXTRAORDINARY }],
          group1: 'ano', group2: 'situacao', showGroupRows: true,
          sort1: 'ano', dir1: 'desc', sort2: 'nome', dir2: 'asc', raw: false, showTitle: true, repeatHeader: true
        }
      },
      {
        id: 'auditoria',
        name: 'Espelho de auditoria',
        description: 'Todos os campos do registro, com cabeçalhos técnicos da base.',
        standard: true,
        config: {
          reportName: 'Espelho de auditoria de premiados',
          fields: fieldDefinitions_().map(function (field) { return field.key; }),
          filters: [], group1: 'origem', group2: '', showGroupRows: true,
          sort1: 'registradoEm', dir1: 'desc', sort2: 'nome', dir2: 'asc', raw: true, showTitle: true, repeatHeader: true
        }
      }
    ];
  }

  function mapRecord_(record, prizeMap) {
    var prize = prizeMap[record.prizeId] || null;
    return {
      idPremiacao: record.id,
      idPremio: record.prizeId,
      premio: record.prize,
      categoria: prize ? prize.category : '',
      regime: record.regime,
      ano: record.year,
      semestre: record.semester,
      ra: record.ra,
      nome: record.name,
      curso: record.course,
      periodo: record.coursePeriod,
      turma: record.classGroup,
      idioma: record.language,
      media: record.average,
      frequencia: record.frequency,
      indicador: record.classificationIndicator,
      valor: record.classificationValue,
      posicao: record.position,
      justificativa: record.justification,
      situacao: record.status,
      registradoEm: record.registeredAt,
      registradoPorEmail: record.registeredByEmail,
      registradoPorNome: record.registeredByName,
      publicadoEm: record.publishedAt,
      publicadoPorEmail: record.publishedByEmail,
      publicadoPorNome: record.publishedByName,
      homologadoEm: record.approvedAt,
      homologadoPorEmail: record.approvedByEmail,
      homologadoPorNome: record.approvedByName,
      origem: record.origin,
      idPacote: record.packageId,
      referencia: record.administrativeReference
    };
  }

  function getDefaultModels() {
    return defaultModels_().map(function (model) {
      return JSON.parse(JSON.stringify(model));
    });
  }

  function validateDefaultModels() {
    var fields = fieldDefinitions_();
    var fieldMap = {};
    fields.forEach(function (field) { fieldMap[field.key] = true; });
    var models = defaultModels_();
    var issues = [];
    if (models.length !== 4) issues.push('O catálogo deve disponibilizar exatamente quatro modelos padrão de relatório.');
    var ids = {};
    models.forEach(function (model) {
      if (!model.id || ids[model.id]) issues.push('Existe modelo de relatório sem ID ou com ID duplicado.');
      ids[model.id] = true;
      var config = model.config || {};
      (config.fields || []).forEach(function (key) {
        if (!fieldMap[key]) issues.push('O modelo "' + model.name + '" usa o campo inexistente "' + key + '".');
      });
      (config.filters || []).forEach(function (filter) {
        if (!fieldMap[filter.field]) issues.push('O modelo "' + model.name + '" usa filtro sobre campo inexistente "' + filter.field + '".');
      });
      [config.group1, config.group2, config.sort1, config.sort2].filter(Boolean).forEach(function (key) {
        if (!fieldMap[key]) issues.push('O modelo "' + model.name + '" referencia o campo inexistente "' + key + '".');
      });
    });
    return { ok: issues.length === 0, issues: issues, count: models.length, models: getDefaultModels() };
  }

  function getWorkspace(actor) {
    AuthorizationService.requireManageRecords(actor);
    var prizes = PrizeDAO.list({ bypassCache: true });
    var prizeMap = {};
    prizes.forEach(function (prize) { prizeMap[prize.id] = prize; });
    var records = AwardeeDAO.list({ bypassCache: true }).map(function (record) { return mapRecord_(record, prizeMap); });
    records.sort(function (a, b) {
      return Number(b.ano || 0) - Number(a.ano || 0) || TextUtil.localeComparePt(a.nome, b.nome) || TextUtil.localeComparePt(a.premio, b.premio);
    });
    return {
      actor: UserModel.publicIdentity(actor),
      generatedAt: PermanentRecordModel.nowIso(),
      fields: fieldDefinitions_(),
      models: getDefaultModels(),
      records: records,
      totalRecords: records.length
    };
  }

  return Object.freeze({ getWorkspace: getWorkspace, getDefaultModels: getDefaultModels, validateDefaultModels: validateDefaultModels });
})();
