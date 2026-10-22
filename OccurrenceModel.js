var OccurrenceModel = (function () {
  function normalize(data) {
    var source = data || {};
    var context = PermanentRecordModel.normalizeContext(source);
    return {
      id: TextUtil.text(source.id),
      regime: context.regime,
      year: context.year,
      semester: context.semester,
      ra: TextUtil.text(source.ra).toUpperCase(),
      name: TextUtil.text(source.name),
      effectiveFrom: PermanentRecordModel.normalizeDateOnly(source.effectiveFrom),
      effectiveTo: PermanentRecordModel.normalizeOptionalDateOnly(source.effectiveTo),
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
      packageId: TextUtil.text(source.packageId)
    };
  }

  function validate(data, options) {
    var opts = options || {};
    var record = normalize(data);
    if (opts.requireId && !record.id) throw new Error('Ocorrência inválida: ID não informado.');
    if (!record.ra) throw new Error('Informe o RA do estudante.');
    if (!record.name) throw new Error('Informe o nome do estudante.');
    if (record.effectiveTo && record.effectiveTo < record.effectiveFrom) {
      throw new Error('A data de fim da ocorrência não pode ser anterior à data de início.');
    }
    if (!record.justification) throw new Error('Informe a justificativa da desclassificação.');
    return record;
  }

  return Object.freeze({ normalize: normalize, validate: validate });
})();
