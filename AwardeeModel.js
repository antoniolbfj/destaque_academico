var AwardeeModel = (function () {
  function normalizeOrigin_(value) {
    var origin = TextUtil.text(value).toUpperCase() || CONFIG.AWARDEE_ORIGINS.APURATION;
    var allowed = [CONFIG.AWARDEE_ORIGINS.APURATION, CONFIG.AWARDEE_ORIGINS.AWARDEES, CONFIG.AWARDEE_ORIGINS.MANUAL];
    if (allowed.indexOf(origin) < 0) throw new Error('Origem de concessão inválida.');
    return origin;
  }

  function normalizeContext_(source, origin) {
    if (origin === CONFIG.AWARDEE_ORIGINS.APURATION) return PermanentRecordModel.normalizeContext(source);
    var regime = TextUtil.text(source && source.regime).toUpperCase();
    if (regime) regime = PermanentRecordModel.normalizeRegime(regime);
    var year = source && source.year !== '' && source.year !== null && source.year !== undefined
      ? PermanentRecordModel.normalizeYear(source.year) : null;
    var semester = regime === 'SEMESTRAL'
      ? PermanentRecordModel.normalizeSemester(regime, source && source.semester) : null;
    return { regime: regime, year: year, semester: semester };
  }

  function normalize(data) {
    var source = data || {};
    var origin = normalizeOrigin_(source.origin);
    var context = normalizeContext_(source, origin);
    return {
      id: TextUtil.text(source.id),
      prizeId: TextUtil.text(source.prizeId),
      prize: TextUtil.text(source.prize),
      regime: context.regime,
      year: context.year,
      semester: context.semester,
      ra: TextUtil.text(source.ra).toUpperCase(),
      name: TextUtil.text(source.name),
      course: TextUtil.text(source.course),
      coursePeriod: TextUtil.text(source.coursePeriod),
      classGroup: TextUtil.text(source.classGroup),
      language: TextUtil.text(source.language),
      average: PermanentRecordModel.normalizeOptionalNumber(source.average, 'Média apurada'),
      frequency: PermanentRecordModel.normalizeOptionalNumber(source.frequency, 'Frequência'),
      classificationIndicator: TextUtil.text(source.classificationIndicator),
      classificationValue: PermanentRecordModel.normalizeOptionalNumber(source.classificationValue, 'Valor de classificação'),
      position: PermanentRecordModel.normalizeOptionalInteger(source.position, 'Posição'),
      justification: TextUtil.text(source.justification),
      status: PermanentRecordModel.normalizeStatus(source.status, CONFIG.RECORD_STATUS.UNDER_REVIEW),
      registeredAt: TextUtil.text(source.registeredAt),
      registeredByEmail: TextUtil.normalizeEmail(source.registeredByEmail),
      registeredByName: TextUtil.text(source.registeredByName),
      publishedAt: TextUtil.text(source.publishedAt),
      publishedByEmail: TextUtil.normalizeEmail(source.publishedByEmail),
      publishedByName: TextUtil.text(source.publishedByName),
      approvedAt: TextUtil.text(source.approvedAt),
      approvedByEmail: TextUtil.normalizeEmail(source.approvedByEmail),
      approvedByName: TextUtil.text(source.approvedByName),
      origin: origin,
      packageId: TextUtil.text(source.packageId),
      administrativeReference: TextUtil.text(source.administrativeReference)
    };
  }

  function validate(data, options) {
    var opts = options || {};
    var record = normalize(data);
    if (opts.requireId && !record.id) throw new Error('Premiação inválida: ID não informado.');
    if (!record.prizeId) throw new Error('Selecione o prêmio concedido.');
    if (!record.ra) throw new Error('Informe o RA do estudante.');
    if (!record.name) throw new Error('Informe o nome do estudante.');
    if (!record.justification) throw new Error('Informe a justificativa da premiação.');
    if (record.origin === CONFIG.AWARDEE_ORIGINS.APURATION && (!record.regime || !record.year)) {
      throw new Error('O contexto acadêmico da premiação não foi informado.');
    }
    if ((record.origin === CONFIG.AWARDEE_ORIGINS.AWARDEES || record.origin === CONFIG.AWARDEE_ORIGINS.MANUAL) && !record.year) {
      throw new Error('O ano de concessão da premiação não foi informado.');
    }
    return record;
  }

  return Object.freeze({ normalize: normalize, validate: validate });
})();
