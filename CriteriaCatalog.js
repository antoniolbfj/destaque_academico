var CriteriaCatalog = (function () {
  var FIELDS = Object.freeze([
    { key: 'RA', label: 'RA', type: 'TEXT', regimes: ['ANUAL','SEMESTRAL','CENID'], kind: 'COLUMN', source: 'RA' },
    { key: 'NOME', label: 'Nome', type: 'TEXT', regimes: ['ANUAL','SEMESTRAL','CENID'], kind: 'COLUMN', source: 'Nome' },
    { key: 'CURSO', label: 'Curso/PPC', type: 'TEXT', regimes: ['ANUAL','SEMESTRAL','CENID'], kind: 'COLUMN', source: 'Curso' },
    { key: 'DISCIPLINA', label: 'Componente curricular', type: 'TEXT', regimes: ['SEMESTRAL'], kind: 'COMPONENT', source: 'Disciplina' },
    { key: 'MOVIMENTO_ATUAL', label: 'Movimento atual', type: 'TEXT', regimes: ['SEMESTRAL','CENID'], kind: 'COLUMN', source: 'Movimento atual' },
    { key: 'PERIODO', label: 'Período do componente', type: 'NUMBER', regimes: ['SEMESTRAL','CENID'], kind: 'COLUMN', source: 'Período' },
    { key: 'SEMESTRES_CURSADOS', label: 'Semestres cursados', type: 'NUMBER', regimes: ['SEMESTRAL'], kind: 'INDICATOR', source: 'Data da matrícula + data de referência' },
    { key: 'DISCIPLINAS_PREVISTAS', label: 'Disciplinas previstas no período', type: 'NUMBER', regimes: ['SEMESTRAL'], kind: 'INDICATOR', source: 'MATRIZES: Curso/PPC + Semestres cursados' },
    { key: 'DISCIPLINAS_CURSADAS_PERIODO', label: 'Disciplinas cursadas do período', type: 'NUMBER', regimes: ['SEMESTRAL'], kind: 'INDICATOR', source: 'SEMESTRAL: Situação + Período + Disciplina' },
    { key: 'MINIMO_50_MAIS_1', label: 'Mínimo 50% + 1', type: 'NUMBER', regimes: ['SEMESTRAL'], kind: 'INDICATOR', source: 'Disciplinas previstas ÷ 2 + 1' },
    { key: 'DISCIPLINAS_APROVADAS_PERIODO', label: 'Disciplinas aprovadas do período', type: 'NUMBER', regimes: ['SEMESTRAL'], kind: 'INDICATOR', source: 'SEMESTRAL: Resultado = Aprovado' },
    { key: 'NUMERO_REPROVACOES', label: 'Número de reprovações', type: 'NUMBER', regimes: ['SEMESTRAL','CENID'], kind: 'INDICATOR', source: 'SEMESTRAL/CENID: Resultado' },
    { key: 'SOMATORIO_NOTAS_PERIODO', label: 'Somatório das notas do período', type: 'NUMBER', regimes: ['SEMESTRAL'], kind: 'INDICATOR', source: 'SEMESTRAL: Total da nota' },
    { key: 'MEDIA_NOTAS_PERIODO', label: 'Média das notas do período', type: 'NUMBER', regimes: ['SEMESTRAL'], kind: 'INDICATOR', source: 'Somatório ÷ disciplinas cursadas' },
    { key: 'MEDIA_NOTAS', label: 'Média das notas', type: 'NUMBER', regimes: ['CENID'], kind: 'INDICATOR', source: 'CENID: Total da nota' },
    { key: 'FREQUENCIA_GLOBAL', label: 'Frequência global (%)', type: 'NUMBER', regimes: ['ANUAL'], kind: 'COLUMN', source: 'FREQUÊNCIA GLOBAL (%)' },
    { key: 'MEDIA_1_TRIMESTRE', label: 'Média do 1º trimestre', type: 'NUMBER', regimes: ['ANUAL'], kind: 'INDICATOR', source: 'SOMATÓRIO 1º TRIMESTRE' },
    { key: 'MEDIA_2_TRIMESTRE', label: 'Média do 2º trimestre', type: 'NUMBER', regimes: ['ANUAL'], kind: 'INDICATOR', source: 'SOMATÓRIO 2º TRIMESTRE' },
    { key: 'MEDIA_3_TRIMESTRE', label: 'Média do 3º trimestre', type: 'NUMBER', regimes: ['ANUAL'], kind: 'INDICATOR', source: 'SOMATÓRIO 3º TRIMESTRE' }
  ]);

  function list(regime) {
    var r = TextUtil.text(regime).toUpperCase();
    return FIELDS.filter(function (field) {
      return !r || field.regimes.indexOf(r) >= 0;
    }).map(function (field) { return JSON.parse(JSON.stringify(field)); });
  }

  function find(key) {
    var normalized = TextUtil.text(key).toUpperCase();
    return FIELDS.find(function (field) { return field.key === normalized; }) || null;
  }

  function requireField(key, regime) {
    var field = find(key);
    if (!field) throw new Error('O campo/indicador "' + TextUtil.text(key) + '" não existe no catálogo.');
    if (regime && field.regimes.indexOf(TextUtil.text(regime).toUpperCase()) < 0) {
      throw new Error('O campo/indicador "' + field.label + '" não está disponível para o regime informado.');
    }
    return field;
  }

  return Object.freeze({ list: list, find: find, requireField: requireField });
})();
