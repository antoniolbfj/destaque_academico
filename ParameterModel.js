var ParameterModel = (function () {
  var OPERATORS = Object.freeze(['=', '!=', '>=', '<=', '>', '<', 'CONTÉM', 'NÃO CONTÉM', CONFIG.PARAMETER_OPERATORS.IGNORE]);
  var COMPARISON_TYPES = Object.freeze([
    CONFIG.PARAMETER_COMPARISON_TYPES.VALUE,
    CONFIG.PARAMETER_COMPARISON_TYPES.FIELD
  ]);

  function literalText_(value) {
    var text = value === null || value === undefined ? '' : String(value).trim();
    // Defesa adicional: alguns caminhos de leitura/exportação podem preservar o
    // apóstrofo usado para forçar texto em Sheets. Para valores iniciados por
    // '=', ele é apenas um marcador de armazenamento e não parte do parâmetro.
    if (text.indexOf("'=") === 0) text = text.substring(1);
    return text;
  }

  function normalize(data) {
    var source = data || {};
    return {
      id: TextUtil.text(source.id),
      description: TextUtil.text(source.description),
      operator: literalText_(source.operator).toUpperCase(),
      comparisonType: TextUtil.text(source.comparisonType).toUpperCase(),
      value: literalText_(source.value),
      status: TextUtil.text(source.status).toUpperCase()
    };
  }

  function validate(data, options) {
    var opts = options || {};
    var p = normalize(data);
    if (opts.requireId && !p.id) throw new Error('Parâmetro inválido: ID não informado.');
    if (!p.description) throw new Error('Informe a descrição do parâmetro.');
    if (OPERATORS.indexOf(p.operator) < 0) throw new Error('Operador do parâmetro inválido.');
    if (COMPARISON_TYPES.indexOf(p.comparisonType) < 0) throw new Error('Tipo de comparação do parâmetro inválido.');
    if (p.operator === CONFIG.PARAMETER_OPERATORS.IGNORE && p.comparisonType !== CONFIG.PARAMETER_COMPARISON_TYPES.VALUE) {
      throw new Error('O parâmetro IGNORAR deve usar comparação por VALOR.');
    }
    if (p.comparisonType === CONFIG.PARAMETER_COMPARISON_TYPES.VALUE && p.value === '') {
      throw new Error('Informe o valor fixo do parâmetro.');
    }
    if ([CONFIG.PARAMETER_STATUS.ACTIVE, CONFIG.PARAMETER_STATUS.INACTIVE].indexOf(p.status) < 0) {
      throw new Error('Situação do parâmetro inválida.');
    }
    return p;
  }

  return Object.freeze({ OPERATORS: OPERATORS, normalize: normalize, validate: validate });
})();
