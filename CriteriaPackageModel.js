var CriteriaPackageModel = (function () {
  function normalizePackage(data) {
    var source = data || {};
    var regime = TextUtil.text(source.regime).toUpperCase();
    if (regime && PermanentRecordModel.REGIMES.indexOf(regime) < 0) regime = '';
    return {
      id: TextUtil.text(source.id),
      description: TextUtil.text(source.description),
      regime: regime,
      status: TextUtil.text(source.status).toUpperCase()
    };
  }

  function validatePackage(data, options) {
    var opts = options || {};
    var p = normalizePackage(data);
    if (opts.requireId && !p.id) throw new Error('Pacote de parâmetros inválido: ID não informado.');
    if (!p.description) throw new Error('Informe a descrição do pacote de parâmetros.');
    if (!p.regime) throw new Error('Informe o tipo/regime do pacote de parâmetros.');
    if ([CONFIG.PARAMETER_STATUS.ACTIVE, CONFIG.PARAMETER_STATUS.INACTIVE].indexOf(p.status) < 0) {
      throw new Error('Situação do pacote inválida.');
    }
    return p;
  }

  function normalizeRule(data) {
    var source = data || {};
    return {
      id: TextUtil.text(source.id),
      packageId: TextUtil.text(source.packageId),
      order: Number(source.order),
      connector: TextUtil.text(source.connector || 'E').toUpperCase(),
      field: TextUtil.text(source.field).toUpperCase(),
      parameterId: TextUtil.text(source.parameterId),
      comparisonField: TextUtil.text(source.comparisonField).toUpperCase()
    };
  }

  function validateRule(data, options) {
    var opts = options || {};
    var r = normalizeRule(data);
    if (opts.requireId && !r.id) throw new Error('Regra inválida: ID não informado.');
    if (!r.packageId) throw new Error('Regra sem pacote associado.');
    if (!Number.isInteger(r.order) || r.order < 1) throw new Error('Ordem da regra inválida.');
    if (['E', 'OU'].indexOf(r.connector) < 0) throw new Error('Conector da regra inválido.');
    if (!r.field) throw new Error('Selecione o campo/indicador da regra.');
    if (!r.parameterId) throw new Error('Selecione o parâmetro da regra.');
    return r;
  }

  return Object.freeze({
    normalizePackage: normalizePackage,
    validatePackage: validatePackage,
    normalizeRule: normalizeRule,
    validateRule: validateRule
  });
})();
