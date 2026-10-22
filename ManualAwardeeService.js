/** CRUD administrativo para premiações extraordinárias registradas fora da Mesa de Apuração. */
var ManualAwardeeService = (function () {
  function activeExtraordinaryPrizes_() {
    return PrizeDAO.list().filter(function (p) {
      return p.status === CONFIG.PRIZE_STATUS.ACTIVE && p.category === CONFIG.PRIZE_CATEGORIES.EXTRAORDINARY;
    });
  }

  function manualRecords_() {
    return AwardeeDAO.list().filter(function (r) { return r.origin === CONFIG.AWARDEE_ORIGINS.MANUAL; });
  }

  function sort_(rows) {
    return rows.sort(function (a, b) {
      return Number(b.year || 0) - Number(a.year || 0) ||
        String(b.registeredAt || '').localeCompare(String(a.registeredAt || '')) ||
        TextUtil.localeComparePt(a.name, b.name);
    });
  }

  function publicRecord_(r) {
    return {
      id: r.id, prizeId: r.prizeId, prize: r.prize, origin: r.origin,
      regime: r.regime, year: r.year, semester: r.semester,
      ra: r.ra, name: r.name, course: r.course, coursePeriod: r.coursePeriod,
      classGroup: r.classGroup, language: r.language, average: r.average, frequency: r.frequency,
      classificationIndicator: r.classificationIndicator, classificationValue: r.classificationValue,
      position: r.position, justification: r.justification, status: r.status,
      registeredAt: r.registeredAt, registeredByEmail: r.registeredByEmail, registeredByName: r.registeredByName,
      publishedAt: r.publishedAt, publishedByEmail: r.publishedByEmail, publishedByName: r.publishedByName,
      approvedAt: r.approvedAt, approvedByEmail: r.approvedByEmail, approvedByName: r.approvedByName,
      administrativeReference: r.administrativeReference || ''
    };
  }

  function getWorkspace(actor) {
    AuthorizationService.requireManageRecords(actor);
    var records = sort_(manualRecords_()).map(publicRecord_);
    return {
      actor: UserModel.publicIdentity(actor),
      records: records,
      prizes: activeExtraordinaryPrizes_(),
      statuses: [CONFIG.RECORD_STATUS.UNDER_REVIEW, CONFIG.RECORD_STATUS.PUBLISHED, CONFIG.RECORD_STATUS.APPROVED],
      regimes: PermanentRecordModel.REGIMES.slice(),
      counts: {
        total: records.length,
        underReview: records.filter(function (r) { return r.status === CONFIG.RECORD_STATUS.UNDER_REVIEW; }).length,
        published: records.filter(function (r) { return r.status === CONFIG.RECORD_STATUS.PUBLISHED; }).length,
        approved: records.filter(function (r) { return r.status === CONFIG.RECORD_STATUS.APPROVED; }).length
      }
    };
  }

  function lookupInAwardees_(ra) {
    var rows = AwardeeDAO.list().filter(function (r) { return r.ra === ra; });
    if (!rows.length) return null;
    rows.sort(function (a, b) { return String(b.registeredAt || '').localeCompare(String(a.registeredAt || '')); });
    var r = rows[0];
    return { ra: ra, name: r.name, course: r.course, coursePeriod: r.coursePeriod, classGroup: r.classGroup, source: 'PREMIADOS' };
  }

  function lookupInDataset_(type, ra) {
    var rows = DataImportDAO.readTarget(type);
    var idx = DataImportModel.targetIndexMap(type);
    var nameKey = type === DataImportModel.TYPES.ANNUAL ? 'NOME COMPLETO' : 'Nome';
    var courseKey = type === DataImportModel.TYPES.ANNUAL ? 'CURSO' : 'Curso';
    var periodKey = type === DataImportModel.TYPES.ANNUAL ? 'PERÍODO' : 'Período';
    var classKey = type === DataImportModel.TYPES.ANNUAL ? 'TURMA' : null;
    for (var i = 0; i < rows.length; i++) {
      if (DataImportModel.normalizeRa(rows[i][idx.RA]) !== ra) continue;
      return {
        ra: ra,
        name: TextUtil.text(rows[i][idx[nameKey]]),
        course: TextUtil.text(rows[i][idx[courseKey]]),
        coursePeriod: idx[periodKey] === undefined ? '' : TextUtil.text(rows[i][idx[periodKey]]),
        classGroup: classKey && idx[classKey] !== undefined ? TextUtil.text(rows[i][idx[classKey]]) : '',
        source: type
      };
    }
    return null;
  }

  function lookupStudent(actor, raValue) {
    AuthorizationService.requireManageRecords(actor);
    var ra = DataImportModel.normalizeRa(raValue);
    if (!ra) throw new Error('Informe o RA para localizar o estudante.');
    var found = lookupInAwardees_(ra);
    if (found) return { found: true, student: found };
    var types = [DataImportModel.TYPES.ANNUAL, DataImportModel.TYPES.SEMESTRAL, DataImportModel.TYPES.CENID];
    for (var i = 0; i < types.length; i++) {
      found = lookupInDataset_(types[i], ra);
      if (found) return { found: true, student: found };
    }
    return { found: false, student: { ra: ra, name: '', course: '', coursePeriod: '', classGroup: '', source: '' } };
  }

  function prizeById_(id) {
    var prize = activeExtraordinaryPrizes_().find(function (p) { return p.id === TextUtil.text(id); }) || null;
    if (!prize) throw new Error('O cadastro manual só pode usar prêmios EXTRAORDINÁRIOS ativos.');
    return prize;
  }

  function assertStatusTransition_(existing, target) {
    if (!existing) return;
    if (existing.status === CONFIG.RECORD_STATUS.APPROVED && target !== CONFIG.RECORD_STATUS.APPROVED) {
      throw new Error('Uma premiação manual HOMOLOGADA é histórica e não pode ser reaberta.');
    }
    if (existing.status === CONFIG.RECORD_STATUS.PUBLISHED && target === CONFIG.RECORD_STATUS.UNDER_REVIEW) {
      throw new Error('Uma premiação manual PUBLICADA não pode retornar para EM APURAÇÃO.');
    }
  }

  function sameEditableData_(existing, incoming) {
    var fields = ['prizeId','regime','year','semester','ra','name','course','coursePeriod','classGroup','language','justification','administrativeReference'];
    return fields.every(function (key) { return String(existing[key] === null || existing[key] === undefined ? '' : existing[key]) === String(incoming[key] === null || incoming[key] === undefined ? '' : incoming[key]); });
  }

  function applyAudit_(record, existing, actor, targetStatus) {
    var now = PermanentRecordModel.nowIso();
    record.registeredAt = existing ? existing.registeredAt : now;
    record.registeredByEmail = existing ? existing.registeredByEmail : actor.email;
    record.registeredByName = existing ? existing.registeredByName : actor.name;
    record.publishedAt = existing ? existing.publishedAt : '';
    record.publishedByEmail = existing ? existing.publishedByEmail : '';
    record.publishedByName = existing ? existing.publishedByName : '';
    record.approvedAt = existing ? existing.approvedAt : '';
    record.approvedByEmail = existing ? existing.approvedByEmail : '';
    record.approvedByName = existing ? existing.approvedByName : '';

    if (targetStatus === CONFIG.RECORD_STATUS.PUBLISHED && !record.publishedAt) {
      record.publishedAt = now; record.publishedByEmail = actor.email; record.publishedByName = actor.name;
    }
    if (targetStatus === CONFIG.RECORD_STATUS.APPROVED) {
      if (!record.publishedAt) {
        record.publishedAt = now; record.publishedByEmail = actor.email; record.publishedByName = actor.name;
      }
      if (!record.approvedAt) {
        record.approvedAt = now; record.approvedByEmail = actor.email; record.approvedByName = actor.name;
      }
    }
    return record;
  }

  function save(actor, payload) {
    AuthorizationService.requireManageRecords(actor);
    if (!payload || typeof payload !== 'object') throw new Error('Dados da premiação manual não informados.');

    return LockExecutor.withScriptLock(function () {
      var id = TextUtil.text(payload.id);
      var existing = id ? AwardeeDAO.findById(id, { bypassCache: true }) : null;
      if (id && (!existing || existing.origin !== CONFIG.AWARDEE_ORIGINS.MANUAL)) throw new Error('A premiação manual selecionada não foi encontrada.');

      var prize = prizeById_(payload.prizeId);
      var targetStatus = PermanentRecordModel.normalizeStatus(payload.status, CONFIG.RECORD_STATUS.UNDER_REVIEW);
      assertStatusTransition_(existing, targetStatus);

      var candidate = AwardeeModel.validate({
        id: id || Utilities.getUuid(), prizeId: prize.id, prize: prize.description,
        origin: CONFIG.AWARDEE_ORIGINS.MANUAL,
        regime: payload.regime, year: payload.year, semester: payload.semester,
        ra: payload.ra, name: payload.name, course: payload.course, coursePeriod: payload.coursePeriod,
        classGroup: payload.classGroup, language: payload.language,
        average: null, frequency: null, classificationIndicator: '', classificationValue: null, position: null,
        justification: payload.justification, status: targetStatus,
        registeredAt: '', registeredByEmail: '', registeredByName: '', publishedAt: '', publishedByEmail: '', publishedByName: '',
        approvedAt: '', approvedByEmail: '', approvedByName: '', packageId: '', administrativeReference: payload.administrativeReference
      }, { requireId: true });

      if (!candidate.regime) throw new Error('Informe o regime acadêmico associado à premiação extraordinária.');
      if (existing && existing.status !== CONFIG.RECORD_STATUS.UNDER_REVIEW && !sameEditableData_(existing, candidate)) {
        throw new Error('Após a publicação, os dados da premiação tornam-se imutáveis. Só é permitido avançar a situação administrativa.');
      }

      var all = AwardeeDAO.list({ bypassCache: true });
      var duplicate = all.some(function (r) {
        return r.id !== candidate.id && r.origin === CONFIG.AWARDEE_ORIGINS.MANUAL && r.ra === candidate.ra &&
          r.prizeId === candidate.prizeId && Number(r.year) === Number(candidate.year);
      });
      if (duplicate) throw new Error('Já existe esse prêmio extraordinário para o estudante no ano informado.');

      applyAudit_(candidate, existing, actor, targetStatus);
      AwardeeDAO.save(candidate);
      return getWorkspace(actor);
    });
  }

  function remove(actor, recordId) {
    AuthorizationService.requireManageRecords(actor);
    var id = TextUtil.text(recordId);
    if (!id) throw new Error('Premiação manual inválida.');
    return LockExecutor.withScriptLock(function () {
      var existing = AwardeeDAO.findById(id, { bypassCache: true });
      if (!existing || existing.origin !== CONFIG.AWARDEE_ORIGINS.MANUAL) throw new Error('A premiação manual não foi encontrada.');
      if (existing.status !== CONFIG.RECORD_STATUS.UNDER_REVIEW) throw new Error('Somente premiações manuais EM APURAÇÃO podem ser excluídas. Registros publicados ou homologados são históricos.');
      AwardeeDAO.remove(id);
      return getWorkspace(actor);
    });
  }

  return Object.freeze({ getWorkspace: getWorkspace, lookupStudent: lookupStudent, save: save, remove: remove });
})();
