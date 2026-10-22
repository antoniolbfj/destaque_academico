/**
 * Instalador idempotente do Destaque Acadêmico TOP+.
 *
 * Contratos principais:
 * - a planilha matriz oficial nunca é instalada;
 * - a cópia é identificada pelo ID físico herdado em intervalo nomeado;
 * - cada instalação vincula o Web App à própria cópia;
 * - instalações ativas nunca podem ser preparadas ou reinstaladas;
 * - etapas repetidas durante uma retomada não duplicam seeds;
 * - falhas parciais podem ser retomadas com segurança.
 */
var InstallerService = (function () {
  var STATES = Object.freeze({ NOT_INSTALLED: 'NOT_INSTALLED', INSTALLING: 'INSTALLING', READY: 'READY', FAILED: 'FAILED' });

  function cfg_() { return CONFIG.INSTALLATION || {}; }
  function props_() { return PropertiesService.getScriptProperties(); }
  function now_() { return new Date().toISOString(); }
  function normalize_(value, max) {
    var text = TextUtil.text(value);
    return max && text.length > max ? text.slice(0, max) : text;
  }

  function activeSpreadsheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Abra o instalador a partir da planilha vinculada ao projeto Apps Script.');
    return ss;
  }

  function ownerEmail_(ss) {
    var email = '';
    try {
      var owner = ss.getOwner();
      email = TextUtil.normalizeEmail(owner && owner.getEmail ? owner.getEmail() : '');
    } catch (error) {}
    if (!email) {
      try { email = TextUtil.normalizeEmail(Session.getEffectiveUser().getEmail()); } catch (error2) {}
    }
    if (!email) throw new Error('Não foi possível identificar o proprietário da planilha. Execute a instalação com a conta proprietária da cópia.');
    return email;
  }

  function namedValue_(ss, name) {
    if (!name) return '';
    var range = ss.getRangeByName(name);
    if (!range) return '';
    return TextUtil.text(range.getDisplayValue ? range.getDisplayValue() : range.getValue());
  }

  function setNamedRange_(ss, name, range) {
    ss.getNamedRanges().forEach(function (named) {
      if (named.getName() === name) named.remove();
    });
    ss.setNamedRange(name, range);
  }

  function templateId_(ss) { return namedValue_(ss, cfg_().TEMPLATE_ID_RANGE); }
  function isTemplate_(ss) {
    var template = templateId_(ss);
    return Boolean(template && String(ss.getId()) === String(template));
  }

  function stateCell_(ss) {
    var range = ss.getRangeByName(cfg_().STATE_RANGE);
    return range || null;
  }

  function readState_(ss) {
    var explicit = normalize_(props_().getProperty(cfg_().STATE_PROPERTY));
    if (Object.prototype.hasOwnProperty.call(STATES, explicit)) return explicit;
    var cell = stateCell_(ss);
    var cellValue = cell ? normalize_(cell.getDisplayValue ? cell.getDisplayValue() : cell.getValue()) : '';
    return Object.prototype.hasOwnProperty.call(STATES, cellValue) ? cellValue : STATES.NOT_INSTALLED;
  }

  function writeState_(ss, state) {
    if (!Object.prototype.hasOwnProperty.call(STATES, state)) throw new Error('Estado de instalação inválido.');
    props_().setProperty(cfg_().STATE_PROPERTY, state);
    var cell = stateCell_(ss);
    if (cell) cell.setValue(state);
    return state;
  }

  function readRun_() {
    var raw = props_().getProperty(cfg_().RUN_PROPERTY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (error) { return null; }
  }

  function writeRun_(run) {
    props_().setProperty(cfg_().RUN_PROPERTY, JSON.stringify(run));
  }

  function clearRun_() { props_().deleteProperty(cfg_().RUN_PROPERTY); }

  function runIsStale_(run) {
    if (!run) return false;
    var timestamp = Date.parse(run.lastActivityAt || run.startedAt || '');
    return !timestamp || (Date.now() - timestamp) > Number(cfg_().RUN_STALE_MS || 480000);
  }

  function recoverStaleRun_(ss) {
    var run = readRun_();
    if (readState_(ss) !== STATES.INSTALLING || !run || !runIsStale_(run)) return false;
    run.failedAt = now_();
    run.error = 'Execução anterior ficou sem atividade e foi marcada para retomada.';
    run.lastActivityAt = run.failedAt;
    writeRun_(run);
    writeState_(ss, STATES.FAILED);
    return true;
  }

  function installerSheet_(ss, create) {
    var name = cfg_().INSTALLER_SHEET_NAME || 'INSTALADORA';
    // Reconhece também a superfície das instalações anteriores à mudança de nome.
    var sheet = ss.getSheetByName(name) || ss.getSheetByName(cfg_().ACTIVE_SHEET_NAME || 'INSTALAÇÃO ATIVA') || ss.getSheetByName('INSTALAÇÃO');
    if (!sheet && create) sheet = ss.insertSheet(name, 0);
    return sheet || null;
  }

  function isProduction_(ss) {
    // Não deixe uma propriedade divergente ou uma cópia de produção apagar o
    // marcador READY antes da checagem de segurança.
    if (readState_(ss) === STATES.READY || namedValue_(ss, cfg_().STATE_RANGE) === STATES.READY) return true;
    try {
      if (cfg_().LEGACY_SCRIPT_ID && String(ScriptApp.getScriptId()) === String(cfg_().LEGACY_SCRIPT_ID)) return true;
    } catch (error) {}
    return false;
  }

  function assertNotProduction_(ss) {
    if (isProduction_(ss)) throw new Error('Operação bloqueada: esta planilha já possui uma instalação em produção. Não é permitido preparar a planilha ou instalar o sistema novamente.');
  }

  function assertCanPrepare_(ss) {
    assertNotProduction_(ss);
    if (readState_(ss) === STATES.INSTALLING) {
      throw new Error('Existe uma instalação em andamento. Conclua ou retome o assistente antes de preparar uma planilha instaladora.');
    }
  }

  function assertCanPrepare() {
    assertCanPrepare_(activeSpreadsheet_());
    return true;
  }

  function isPrepared_(ss) {
    return Boolean(templateId_(ss) && installerSheet_(ss, false) &&
      namedValue_(ss, cfg_().DISTRIBUTION_ID_RANGE) && namedValue_(ss, cfg_().SCHEMA_VERSION_RANGE) && stateCell_(ss));
  }

  function styleInstallerSheet_(ss, sheet) {
    sheet.clear();
    sheet.clearConditionalFormatRules();
    sheet.setHiddenGridlines(true);
    sheet.setFrozenRows(0);
    sheet.setColumnWidths(1, 8, 105);
    sheet.setColumnWidth(1, 130);
    sheet.setColumnWidth(8, 130);
    for (var r = 1; r <= 22; r++) sheet.setRowHeight(r, 28);
    sheet.setRowHeights(1, 3, 34);

    sheet.getRange('A1:H3').merge().setValue(CONFIG.APP_NAME)
      .setBackground('#0c5a36').setFontColor('#ffffff').setFontWeight('bold').setFontSize(22)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.getRange('A4:H4').merge().setValue('Bem-vindo ao Destaque Acadêmico Top+ · PLANILHA INSTALADORA')
      .setBackground('#e8f3ed').setFontColor('#174c37').setFontWeight('bold').setFontSize(10)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');

    var steps = [
      ['1', 'Clique em FAZER UMA CÓPIA para criar sua própria instalação no Google Drive.'],
      ['2', 'Abra a cópia criada. Não execute a instalação nesta matriz oficial.'],
      ['3', 'Na cópia, use o menu Destaque Acadêmico > Instalar Destaque Acadêmico Top+.'],
      ['4', 'Conclua o assistente e siga as orientações finais para publicar o Aplicativo da Web.']
    ];
    var startRow = 6;
    steps.forEach(function (item, index) {
      var row = startRow + index;
      sheet.getRange(row, 1).setValue(item[0]).setBackground('#e8f3ed').setFontColor('#0c5a36').setFontWeight('bold').setHorizontalAlignment('center');
      sheet.getRange(row, 2, 1, 7).merge().setValue(item[1]).setFontSize(10).setVerticalAlignment('middle');
    });

    sheet.getRange('A11:H12').merge().setValue('Esta é a matriz oficial. O sistema bloqueará qualquer tentativa de instalação antes que você faça uma cópia.')
      .setBackground('#fff6db').setFontColor('#705812').setFontWeight('bold').setWrap(true)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');

    var copyUrl = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(ss.getId()) + '/copy';
    var copyRange = sheet.getRange('A14:D15');
    copyRange.merge()
      .setBackground('#0c5a36').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    // Não use fórmula HYPERLINK/HIPERLINK aqui: nomes de função e separadores
    // dependem da localização da planilha. RichText mantém o instalador neutro ao locale.
    var copyLink = SpreadsheetApp.newRichTextValue()
      .setText('FAZER UMA CÓPIA')
      .setLinkUrl(copyUrl)
      .build();
    sheet.getRange('A14').setRichTextValue(copyLink);
    sheet.getRange('E14:H15').merge().setValue('Depois de abrir a cópia, use o menu “Destaque Acadêmico”.')
      .setBackground('#f5f8f6').setFontColor('#4d5f56').setFontSize(10).setWrap(true)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');

    sheet.getRange('A18:H20').merge().setValue('O Destaque Acadêmico Top+ organiza dados acadêmicos, aplica critérios de apuração e gerencia premiações. Esta matriz deve ser copiada antes da instalação; a base será criada somente na cópia.')
      .setBackground('#f7faf8').setFontColor('#66756d').setFontSize(9).setWrap(true)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');

    // Metadados herdados pela cópia. As colunas J:L ficam ocultas.
    sheet.getRange('J1').setValue('METADADO');
    sheet.getRange('J2').setValue(ss.getId());
    sheet.getRange('J3').setValue(cfg_().DISTRIBUTION_ID);
    sheet.getRange('J4').setValue(cfg_().SCHEMA_VERSION);
    sheet.getRange('J5').setValue(STATES.NOT_INSTALLED);
    setNamedRange_(ss, cfg_().TEMPLATE_ID_RANGE, sheet.getRange('J2'));
    setNamedRange_(ss, cfg_().DISTRIBUTION_ID_RANGE, sheet.getRange('J3'));
    setNamedRange_(ss, cfg_().SCHEMA_VERSION_RANGE, sheet.getRange('J4'));
    setNamedRange_(ss, cfg_().STATE_RANGE, sheet.getRange('J5'));
    sheet.hideColumns(10, 3);
  }

  function prepareOfficialTemplate() {
    var ss = activeSpreadsheet_();
    var lock = LockService.getScriptLock();
    lock.waitLock(CONFIG.PERFORMANCE.LOCK_TIMEOUT_MS);
    try {
      // Revalida após a confirmação do usuário e sob o mesmo lock do instalador.
      assertCanPrepare_(ss);
      // Uma aba nova evita herdar filtros, mesclagens, gráficos ou formatações
      // arbitrárias. Ela fica visível antes de excluir as demais abas.
      var sheet = ss.insertSheet();
      sheet.showSheet();
      ss.setActiveSheet(sheet);
      ss.getSheets().slice().forEach(function (other) {
        if (other.getSheetId() !== sheet.getSheetId()) ss.deleteSheet(other);
      });
      sheet.setName(cfg_().INSTALLER_SHEET_NAME || 'INSTALADORA');

      SpreadsheetGateway.clearBinding();
      props_().deleteProperty(cfg_().STATE_PROPERTY);
      props_().deleteProperty(cfg_().RUN_PROPERTY);
      props_().deleteProperty((CONFIG.PUBLIC_PORTAL || {}).CONFIG_PROPERTY || 'TOPPLUS_PUBLIC_AWARDEE_CONFIG_V1');
      try { ss.setSpreadsheetTimeZone(cfg_().TIMEZONE || 'America/Sao_Paulo'); } catch (error) {}
      try { ss.rename('DESTAQUE ACADÊMICO — INSTALADORA'); } catch (error2) {}
      styleInstallerSheet_(ss, sheet);
      SpreadsheetApp.flush();
      return getState();
    } finally {
      lock.releaseLock();
    }
  }

  function hasManagedSheets_(ss) {
    return InstallationSchema.managedNames().some(function (name) { return Boolean(ss.getSheetByName(name)); });
  }

  function assertPrepared_(ss) {
    var template = templateId_(ss);
    if (!isPrepared_(ss)) throw new Error('Esta planilha não foi preparada como instaladora. Use Preparar Planilha Instaladora e faça uma cópia antes de instalar.');
    return template;
  }

  function assertInstallableCopy_(ss) {
    var template = assertPrepared_(ss);
    if (String(ss.getId()) === String(template)) {
      throw new Error('Esta é a planilha original do instalador. Faça uma cópia no seu Google Drive e execute a instalação dentro da cópia.');
    }
    return true;
  }

  function reconcileCopiedInstallation_(ss) {
    if (isProduction_(ss) || !templateId_(ss) || isTemplate_(ss)) return false;
    var configured = SpreadsheetGateway.getConfiguredSpreadsheetId();
    if (configured && String(configured) !== String(ss.getId())) {
      // Segurança contra cópia de uma instalação já concluída: uma nova cópia
      // nunca pode continuar apontando para a base da instalação de origem.
      SpreadsheetGateway.clearBinding();
      props_().deleteProperty(cfg_().RUN_PROPERTY);
      writeState_(ss, STATES.NOT_INSTALLED);
      return true;
    }
    return false;
  }

  function activateInstallationSheet_(ss) {
    var sheet = installerSheet_(ss, false);
    if (!sheet) throw new Error('A aba da planilha instaladora não foi encontrada.');
    sheet.setName(cfg_().ACTIVE_SHEET_NAME || 'INSTALAÇÃO ATIVA');
    sheet.getRange('A4:H4').setValue('Bem-vindo ao Destaque Acadêmico Top+ · INSTALAÇÃO ATIVA');
    sheet.getRange('A6:H9').breakApart().clearContent().merge()
      .setValue('O Destaque Acadêmico Top+ organiza dados acadêmicos, aplica critérios de apuração e gerencia o reconhecimento e a premiação de estudantes. Esta planilha contém a base de dados da sua instalação.')
      .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('left')
      .setBackground('#f5f8f6').setFontColor('#4d5f56').setFontWeight('normal').setFontSize(11);
    sheet.getRange('A11:H12').setValue('Sua instalação está ativa. Bem-vindo! As tabelas da base de dados foram criadas e estão ocultas nesta planilha.')
      .setBackground('#e7f5ec').setFontColor('#165c39');
    sheet.getRange('A14:D15').clearContent().setValue('INSTALAÇÃO ATIVA').setBackground('#0c5a36').setFontColor('#ffffff');
    sheet.getRange('E14:H15').setValue('Use o menu Destaque Acadêmico para verificar a instalação e consultar as orientações de implantação.');
    sheet.getRange('A18:H20').setValue('Acesse o sistema pelo endereço do Aplicativo da Web após publicá-lo. Esta instalação está protegida contra uma nova preparação ou instalação.');
    sheet.showSheet();
    ss.setActiveSheet(sheet);
  }

  function completeInstallation_(ss) {
    hideManagedSheets_(ss);
    activateInstallationSheet_(ss);
    writeState_(ss, STATES.READY);
    clearRun_();
  }

  function updateInstallerSheetStatus_(ss) {
    var sheet = installerSheet_(ss, false);
    if (!sheet || !templateId_(ss)) return;
    var state = readState_(ss);
    if (isTemplate_(ss)) {
      sheet.getRange('A11:H12').setValue('Esta é a matriz oficial. O sistema bloqueará qualquer tentativa de instalação antes que você faça uma cópia.')
        .setBackground('#fff6db').setFontColor('#705812');
      return;
    }

    if (state === STATES.READY) {
      activateInstallationSheet_(ss);
      return;
    }

    var message = state === STATES.FAILED
      ? 'A instalação anterior foi interrompida. Esta cópia pode retomar o processo pelo menu Destaque Acadêmico > Instalar Destaque Acadêmico Top+.'
      : state === STATES.INSTALLING
        ? 'Existe uma instalação em andamento. Abra novamente o assistente para acompanhar ou retomar quando necessário.'
        : 'Cópia válida detectada. Agora use o menu Destaque Acadêmico > Instalar Destaque Acadêmico Top+.';
    sheet.getRange('A11:H12').setValue(message).setBackground(state === STATES.FAILED ? '#fff0ef' : '#e7f5ec').setFontColor(state === STATES.FAILED ? '#823b35' : '#165c39');
    sheet.getRange('A14:D15').clearContent().setValue('CÓPIA VALIDADA').setBackground('#0c5a36').setFontColor('#ffffff');
    sheet.getRange('E14:H15').setValue('Abra o menu “Destaque Acadêmico” e execute o assistente de instalação.');
  }

  function handleOpen() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    try {
      reconcileCopiedInstallation_(ss);
      if (templateId_(ss)) updateInstallerSheetStatus_(ss);
    } catch (error) {
      console.warn('Falha ao atualizar a superfície do instalador: ' + (error && error.message ? error.message : error));
    }
  }

  function installationPlan_() {
    return [
      { key: 'VALIDATE', label: 'Validar a cópia', detail: 'ID da matriz, estado, lock e fuso horário' },
      { key: 'BIND', label: 'Vincular a base', detail: 'Gravar o ID desta cópia para o Web App' },
      { key: 'SCHEMA', label: 'Criar estrutura', detail: 'Criar ou migrar as 11 abas da base' },
      { key: 'TABLES', label: 'Configurar tabelas', detail: 'Cabeçalhos, formatos e validações' },
      { key: 'DEFAULTS', label: 'Criar padrões', detail: 'Parâmetros, pacote semestral e regras' },
      { key: 'REPORTS', label: 'Preparar publicação', detail: 'Validar modelos de relatório e configurar a página pública' },
      { key: 'SUPERUSER', label: 'Criar Superusuário', detail: 'Proprietário da planilha como Superusuário' },
      { key: 'FINALIZE', label: 'Conferir e finalizar', detail: 'Integridade geral e estado READY' }
    ];
  }

  function getState() {
    var ss = activeSpreadsheet_();
    reconcileCopiedInstallation_(ss);
    if (readState_(ss) === STATES.INSTALLING) recoverStaleRun_(ss);
    var state = readState_(ss);
    var template = templateId_(ss);
    var run = readRun_();
    var isTemplate = Boolean(template && String(template) === String(ss.getId()));
    var production = isProduction_(ss);
    var prepared = isPrepared_(ss);
    return {
      appName: CONFIG.APP_NAME,
      version: CONFIG.BUILD_VERSION,
      schemaVersion: cfg_().SCHEMA_VERSION,
      distributionId: namedValue_(ss, cfg_().DISTRIBUTION_ID_RANGE) || cfg_().DISTRIBUTION_ID,
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      templatePrepared: prepared,
      templateId: template,
      isTemplate: isTemplate,
      state: state,
      installed: production,
      canPrepare: !production && state !== STATES.INSTALLING,
      installing: state === STATES.INSTALLING,
      canInstall: Boolean(prepared && !production && !isTemplate && (state === STATES.NOT_INSTALLED || state === STATES.FAILED)),
      ownerEmail: ownerEmail_(ss),
      copyUrl: isTemplate ? 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(ss.getId()) + '/copy' : '',
      nextStep: run ? Number(run.nextStep || 0) : 0,
      plan: installationPlan_(),
      databaseId: SpreadsheetGateway.getConfiguredSpreadsheetId()
    };
  }

  function validateConfig_(input, ss) {
    var superuserName = normalize_(input && input.superuserName, 160);
    if (!superuserName) throw new Error('Informe o nome do Superusuário.');
    return { superuserName: superuserName, ownerEmail: ownerEmail_(ss) };
  }

  function beginInstallation(input) {
    var ss = activeSpreadsheet_();
    var config = validateConfig_(input || {}, ss);
    var lock = LockService.getScriptLock();
    lock.waitLock(CONFIG.PERFORMANCE.LOCK_TIMEOUT_MS);
    try {
      assertNotProduction_(ss);
      assertInstallableCopy_(ss);
      reconcileCopiedInstallation_(ss);
      recoverStaleRun_(ss);
      var state = readState_(ss);
      if (state === STATES.INSTALLING) throw new Error('Já existe uma instalação em andamento. Aguarde alguns instantes ou reabra o assistente.');
      if (state === STATES.NOT_INSTALLED && hasManagedSheets_(ss)) {
        throw new Error('Esta cópia ainda não possui uma instalação reconhecida, mas já contém abas gerenciadas pelo sistema. Use uma cópia limpa do instalador para evitar perda de dados.');
      }

      var previous = readRun_();
      var resumeStep = state === STATES.FAILED && previous && String(previous.spreadsheetId) === String(ss.getId())
        ? Math.max(0, Math.min(installationPlan_().length - 1, Number(previous.nextStep || 0)))
        : 0;
      var run = {
        runId: 'TOPPLUS-' + Utilities.getUuid(),
        spreadsheetId: ss.getId(),
        config: config,
        startedAt: now_(),
        lastActivityAt: now_(),
        nextStep: resumeStep,
        distributionId: namedValue_(ss, cfg_().DISTRIBUTION_ID_RANGE) || cfg_().DISTRIBUTION_ID,
        resumed: resumeStep > 0
      };
      writeRun_(run);
      writeState_(ss, STATES.INSTALLING);
      updateInstallerSheetStatus_(ss);
      return { ok: true, done: false, runId: run.runId, nextStep: run.nextStep, resumed: run.resumed, plan: installationPlan_(), state: getState() };
    } finally {
      lock.releaseLock();
    }
  }

  function ensureSuperuser_(run) {
    var ownerEmail = TextUtil.normalizeEmail(run.config.ownerEmail);
    var users = UserDAO.list({ bypassCache: true }).filter(function (user) {
      return user.email !== ownerEmail && user.profile !== CONFIG.USER_PROFILES.SUPERUSER;
    });
    users.push(UserModel.validate({
      name: run.config.superuserName,
      profile: CONFIG.USER_PROFILES.SUPERUSER,
      email: ownerEmail
    }));
    users.sort(function (a, b) { return TextUtil.localeComparePt(a.name, b.name); });
    UserDAO.replaceAll(users);
    return { ownerEmail: ownerEmail, name: run.config.superuserName, totalUsers: users.length };
  }

  function validateDefaultSemestralCore_() {
    var parameters = ParameterDAO.list({ bypassCache: true });
    var packages = CriteriaPackageDAO.listPackages({ bypassCache: true });
    var rules = CriteriaPackageDAO.listRules({ bypassCache: true });
    var defaults = CONFIG.DEFAULT_SEMESTRAL_PACKAGE;
    var issues = [];

    function findParameter(id, matcher) {
      return parameters.find(function (p) { return p.id === id; }) ||
        parameters.find(matcher) || null;
    }

    var geField = findParameter(defaults.PARAM_GE_FIELD_ID, function (p) {
      return p.operator === '>=' && p.comparisonType === CONFIG.PARAMETER_COMPARISON_TYPES.FIELD;
    });
    var zero = findParameter(defaults.PARAM_ZERO_ID, function (p) {
      return p.operator === '=' && p.comparisonType === CONFIG.PARAMETER_COMPARISON_TYPES.VALUE && String(p.value) === '0';
    });
    var enrolled = findParameter(defaults.PARAM_ENROLLED_ID, function (p) {
      return p.operator === '=' && p.comparisonType === CONFIG.PARAMETER_COMPARISON_TYPES.VALUE && TextUtil.text(p.value).toUpperCase() === 'MATRICULADO';
    });
    var ignored = findParameter(defaults.PARAM_IGNORED_COMPONENTS_ID, function (p) {
      if (p.operator !== CONFIG.PARAMETER_OPERATORS.IGNORE || p.comparisonType !== CONFIG.PARAMETER_COMPARISON_TYPES.VALUE) return false;
      var configured = TextUtil.text(p.value).toUpperCase();
      return defaults.IGNORED_COMPONENTS.every(function (item) { return configured.indexOf(TextUtil.text(item).toUpperCase()) >= 0; });
    });

    if (!geField) issues.push('Parâmetro padrão “Maior ou igual a outro campo/indicador” não encontrado ou inválido.');
    if (!zero) issues.push('Parâmetro padrão “Igual a zero” não encontrado ou inválido.');
    if (!enrolled) issues.push('Parâmetro padrão “Movimento atual = Matriculado” não encontrado ou inválido.');
    if (!ignored) issues.push('Parâmetro padrão “Componentes curriculares desconsiderados” não encontrado ou inválido.');

    var activeSemestral = packages.filter(function (pkg) {
      return pkg.regime === DataImportModel.TYPES.SEMESTRAL && pkg.status === CONFIG.PARAMETER_STATUS.ACTIVE;
    });
    var defaultPackage = packages.find(function (pkg) { return pkg.id === defaults.PACKAGE_ID; }) ||
      packages.find(function (pkg) { return pkg.description === defaults.DESCRIPTION; }) || null;
    if (activeSemestral.length !== 1) issues.push('Deve existir exatamente um pacote SEMESTRAL ativo.');
    if (!defaultPackage) issues.push('O pacote semestral padrão não foi encontrado.');

    var defaultRules = defaultPackage ? rules.filter(function (rule) { return rule.packageId === defaultPackage.id; }) : [];
    function hasRule(field, parameter, comparisonField, order) {
      if (!parameter) return false;
      return defaultRules.some(function (rule) {
        return rule.field === field &&
          rule.parameterId === parameter.id &&
          TextUtil.text(rule.comparisonField) === TextUtil.text(comparisonField || '') &&
          Number(rule.order) === Number(order) &&
          TextUtil.text(rule.connector).toUpperCase() === 'E';
      });
    }
    if (defaultPackage) {
      if (!hasRule('DISCIPLINA', ignored, '', 1)) issues.push('Regra padrão de componentes curriculares desconsiderados não encontrada ou inválida.');
      if (!hasRule('MOVIMENTO_ATUAL', enrolled, '', 2)) issues.push('Regra padrão de movimento Matriculado não encontrada ou inválida.');
      if (!hasRule('DISCIPLINAS_CURSADAS_PERIODO', geField, 'MINIMO_50_MAIS_1', 3)) issues.push('Regra padrão de 50% + 1 não encontrada ou inválida.');
      if (!hasRule('NUMERO_REPROVACOES', zero, '', 4)) issues.push('Regra padrão de zero reprovações não encontrada ou inválida.');
    }

    return {
      ok: issues.length === 0,
      issues: issues,
      parameters: parameters.length,
      matchedParameters: [geField, zero, enrolled, ignored].filter(Boolean).length,
      activeSemestral: activeSemestral.length,
      defaultPackageId: defaultPackage ? defaultPackage.id : '',
      defaultRules: defaultRules.length
    };
  }

  function validateDefaultConfiguration_() {
    var core = validateDefaultSemestralCore_();
    var reportValidation = AwardeeReportService.validateDefaultModels();
    var publicValidation = PublicAwardeeService.validateConfiguration();
    var issues = core.issues.slice();
    if (!reportValidation.ok) issues = issues.concat(reportValidation.issues || []);
    if (!publicValidation.ok) issues = issues.concat(publicValidation.issues || []);
    return {
      ok: issues.length === 0,
      issues: issues,
      parameters: core.parameters,
      matchedParameters: core.matchedParameters,
      activeSemestral: core.activeSemestral,
      defaultPackageId: core.defaultPackageId,
      defaultRules: core.defaultRules,
      reportModels: reportValidation.count,
      publicFields: publicValidation.fieldCount
    };
  }

  function validateSuperuser_() {
    var ownerEmail = SpreadsheetGateway.getOwnerEmail();
    var users = UserDAO.list({ bypassCache: true });
    var owner = users.find(function (user) { return user.email === ownerEmail; }) || null;
    return {
      ok: Boolean(owner && owner.profile === CONFIG.USER_PROFILES.SUPERUSER),
      ownerEmail: ownerEmail,
      owner: owner
    };
  }

  function hideManagedSheets_(ss) {
    var installer = installerSheet_(ss, true);
    installer.showSheet();
    ss.setActiveSheet(installer);
    InstallationSchema.managedNames().forEach(function (name) {
      var sheet = ss.getSheetByName(name);
      if (sheet) sheet.hideSheet();
    });
  }

  function bindRuntimeToInstallationSpreadsheet_(ss) {
    if (!ss || !ss.getId) throw new Error('A planilha da instalação não está disponível.');
    var expectedId = String(ss.getId());
    SpreadsheetGateway.bindSpreadsheetId(expectedId);
    var runtime = SpreadsheetGateway.getSpreadsheet();
    var runtimeId = runtime && runtime.getId ? String(runtime.getId()) : '';
    if (!runtimeId || runtimeId !== expectedId) {
      throw new Error('A base operacional não está vinculada a esta cópia da planilha. Esperado: ' + expectedId + '; obtido: ' + (runtimeId || 'não identificado') + '.');
    }
    return runtime;
  }

  function ensureDatabaseStructureForRuntime_(ss) {
    // O instalador e os DAOs precisam enxergar exatamente a mesma planilha.
    // Reafirma o vínculo em toda etapa que depende das tabelas, o que também
    // permite retomar com segurança uma instalação parcial.
    var runtime = bindRuntimeToInstallationSpreadsheet_(ss);

    var schema = InstallationSchema.ensureAll(runtime);
    var validation = InstallationSchema.validateAll(runtime);
    if (!validation.ok) {
      throw new Error('A estrutura obrigatória da base está incompleta. ' + validation.issues.join(' '));
    }

    var missing = InstallationSchema.managedNames().filter(function (name) {
      return !runtime.getSheetByName(name);
    });
    if (missing.length) {
      throw new Error('A estrutura obrigatória não foi criada integralmente. Abas ausentes: ' + missing.join(', ') + '.');
    }

    // ensureAll reseta o gateway; reabre para que o cache de abas usado pelos
    // DAOs nas etapas seguintes parta da estrutura já criada.
    SpreadsheetGateway.reset();
    var reopened = SpreadsheetGateway.getSpreadsheet();
    if (String(reopened.getId()) !== String(ss.getId())) {
      throw new Error('A base operacional mudou durante a instalação. Reabra o assistente.');
    }
    return { schema: schema, validation: validation, spreadsheetId: reopened.getId() };
  }

  function finalValidation_(ss) {
    // Toda validação que usa DAOs começa reafirmando o vínculo com a cópia.
    // Isso evita que uma execução posterior do assistente herde um ID de base
    // diferente daquele em que a instalação foi iniciada.
    bindRuntimeToInstallationSpreadsheet_(ss);
    var schema = InstallationSchema.validateAll(ss);
    var defaults = validateDefaultConfiguration_();
    var superuser = validateSuperuser_();
    var configuredId = SpreadsheetGateway.getConfiguredSpreadsheetId();
    var runtimeId = '';
    var bindingDiagnostics = SpreadsheetGateway.getBindingDiagnostics();
    try { runtimeId = SpreadsheetGateway.getSpreadsheet().getId(); } catch (error) {}
    var issues = [];
    if (!schema.ok) issues = issues.concat(schema.issues);
    if (!defaults.ok) issues = issues.concat(defaults.issues);
    if (!superuser.ok) issues.push('O proprietário da planilha não está registrado como Superusuário.');
    if (String(configuredId) !== String(ss.getId()) || String(runtimeId) !== String(ss.getId())) issues.push('O Web App não está vinculado à própria cópia da planilha.');
    if (bindingDiagnostics.documentPropertyDatabaseId && String(bindingDiagnostics.documentPropertyDatabaseId) !== String(ss.getId())) issues.push('O vínculo documental do Web App não aponta para esta cópia.');
    if (bindingDiagnostics.scriptPropertyDatabaseId && String(bindingDiagnostics.scriptPropertyDatabaseId) !== String(ss.getId())) issues.push('O vínculo de script do Web App não aponta para esta cópia.');
    return {
      ok: issues.length === 0,
      issues: issues,
      metrics: {
        sheets: schema.total,
        parameters: defaults.parameters,
        activeSemestral: defaults.activeSemestral,
        defaultRules: defaults.defaultRules,
        reportModels: defaults.reportModels,
        publicFields: defaults.publicFields,
        ownerEmail: superuser.ownerEmail,
        databaseId: configuredId,
        bindingConsistent: bindingDiagnostics.consistent
      }
    };
  }

  function executeStep_(ss, run, stepIndex) {
    switch (stepIndex) {
      case 0:
        assertInstallableCopy_(ss);
        try { ss.setSpreadsheetTimeZone(cfg_().TIMEZONE || 'America/Sao_Paulo'); } catch (error) {}
        return { detail: 'Cópia validada e pronta para receber o sistema.', metrics: ['ID da cópia: ' + ss.getId(), 'Fuso horário: ' + ss.getSpreadsheetTimeZone()] };
      case 1:
        SpreadsheetGateway.bindSpreadsheetId(ss.getId());
        if (String(SpreadsheetGateway.getSpreadsheet().getId()) !== String(ss.getId())) throw new Error('O vínculo da base não aponta para esta cópia.');
        return { detail: 'Base vinculada exclusivamente a esta cópia.', metrics: ['TOPPLUS_DATABASE_SPREADSHEET_ID = ' + ss.getId()] };
      case 2:
        var prepared = ensureDatabaseStructureForRuntime_(ss);
        hideManagedSheets_(ss);
        return { detail: 'Estrutura criada/migrada e validada na base operacional.', metrics: ['Abas criadas: ' + prepared.schema.created, 'Abas migradas: ' + prepared.schema.migrated, 'Abas validadas: ' + prepared.validation.total, 'Base: ' + prepared.spreadsheetId, 'Abas técnicas mantidas ocultas'] };
      case 3:
        var checked = ensureDatabaseStructureForRuntime_(ss);
        return { detail: 'Cabeçalhos, formatos, validações e vínculo da base foram conferidos.', metrics: [checked.validation.total + ' abas válidas', 'Base operacional confirmada: ' + checked.spreadsheetId] };
      case 4:
        // Defesa idempotente para retomadas: se uma execução anterior deixou a
        // estrutura incompleta, repara antes de qualquer DAO acessar PARÂMETROS.
        var readyForDefaults = ensureDatabaseStructureForRuntime_(ss);
        var seeded = SchemaMigrationService.ensureDefaultSemestralPackageUnlocked();
        // Leitura de retorno obrigatória: não avançar se o Google Sheets tiver
        // reinterpretado algum valor persistido (por exemplo, '=' como fórmula).
        var defaultsCheck = validateDefaultSemestralCore_();
        if (!defaultsCheck.ok) {
          throw new Error('Falha ao validar a configuração padrão após a gravação. ' + defaultsCheck.issues.join(' '));
        }
        return { detail: seeded.seeded ? 'Configuração padrão criada e validada.' : (seeded.reason || 'Configuração padrão existente e validada.'), metrics: [readyForDefaults.validation.total + ' abas confirmadas antes dos padrões', defaultsCheck.matchedParameters + ' parâmetros padrão validados', defaultsCheck.defaultRules + ' regras do pacote validadas', 'Pacote: ' + (seeded.packageId || CONFIG.DEFAULT_SEMESTRAL_PACKAGE.PACKAGE_ID)] };
      case 5:
        var readyForPublication = ensureDatabaseStructureForRuntime_(ss);
        var models = AwardeeReportService.validateDefaultModels();
        if (!models.ok) throw new Error(models.issues.join(' '));
        var publicSeed = PublicAwardeeService.ensureDefaultConfiguration();
        var publicCheck = PublicAwardeeService.validateConfiguration();
        if (!publicCheck.ok) throw new Error(publicCheck.issues.join(' '));
        return { detail: 'Modelos de relatório e página pública preparados.', metrics: [readyForPublication.validation.total + ' abas reconfirmadas', 'Base operacional: ' + readyForPublication.spreadsheetId, models.count + ' modelos compartilhados', publicCheck.fieldCount + ' campos públicos padrão', publicSeed.created ? 'Configuração pública criada' : 'Configuração pública existente preservada'] };
      case 6:
        var readyForUser = ensureDatabaseStructureForRuntime_(ss);
        var user = ensureSuperuser_(run);
        return { detail: 'Proprietário registrado como Superusuário.', metrics: [readyForUser.validation.total + ' abas reconfirmadas', 'Base operacional: ' + readyForUser.spreadsheetId, user.name, user.ownerEmail] };
      case 7:
        // A etapa final também reafirma o vínculo e a estrutura antes de qualquer DAO.
        var readyForFinalize = ensureDatabaseStructureForRuntime_(ss);
        // Reaplica migrações defensivas sob o lock já adquirido, sem lock aninhado.
        SchemaMigrationService.ensureCurrentUnlocked();
        var finalCheck = finalValidation_(ss);
        if (!finalCheck.ok) throw new Error(finalCheck.issues.join(' '));
        completeInstallation_(ss);
        return { detail: 'Instalação concluída e verificada. O sistema está pronto para implantação.', metrics: [finalCheck.metrics.sheets + ' abas', finalCheck.metrics.parameters + ' parâmetros', finalCheck.metrics.reportModels + ' modelos de relatório', finalCheck.metrics.publicFields + ' campos públicos configurados'], final: true, validation: finalCheck };
      default:
        throw new Error('Etapa de instalação inválida.');
    }
  }

  function runInstallationStep(runId) {
    var ss = activeSpreadsheet_();
    var lock = LockService.getScriptLock();
    lock.waitLock(CONFIG.PERFORMANCE.LOCK_TIMEOUT_MS);
    try {
      assertNotProduction_(ss);
      assertInstallableCopy_(ss);
      var state = readState_(ss);
      var run = readRun_();
      if (!run || String(run.runId) !== String(runId || '')) throw new Error('A sessão de instalação não é mais válida. Reabra o assistente.');
      if (String(run.spreadsheetId) !== String(ss.getId())) throw new Error('A instalação foi iniciada em outra planilha.');
      if (state !== STATES.INSTALLING) throw new Error('A instalação não está em estado de execução. Reabra o assistente para retomar.');

      // Cada clique/avanço do assistente é uma nova execução do Apps Script.
      // Reafirmar o ID em toda chamada impede qualquer deriva entre a planilha
      // ativa do instalador e a base usada pelos DAOs nas etapas seguintes.
      bindRuntimeToInstallationSpreadsheet_(ss);

      var plan = installationPlan_();
      var stepIndex = Number(run.nextStep || 0);
      if (stepIndex >= plan.length) {
        var completed = finalValidation_(ss);
        if (!completed.ok) throw new Error(completed.issues.join(' '));
        completeInstallation_(ss);
        return { ok: true, done: true, state: getState(), validation: completed };
      }

      var result;
      try {
        result = executeStep_(ss, run, stepIndex);
      } catch (error) {
        run.error = error && error.message ? error.message : String(error);
        run.failedAt = now_();
        run.lastActivityAt = run.failedAt;
        writeRun_(run);
        writeState_(ss, STATES.FAILED);
        updateInstallerSheetStatus_(ss);
        throw error;
      }

      if (result && result.final) {
        return { ok: true, done: true, stepIndex: stepIndex, step: plan[stepIndex], detail: result.detail, metrics: result.metrics || [], state: getState(), validation: result.validation };
      }

      run.nextStep = stepIndex + 1;
      run.lastActivityAt = now_();
      writeRun_(run);
      return {
        ok: true,
        done: false,
        runId: run.runId,
        stepIndex: stepIndex,
        nextStep: run.nextStep,
        step: plan[stepIndex],
        detail: result.detail,
        metrics: result.metrics || [],
        progress: Math.round((run.nextStep / plan.length) * 100)
      };
    } finally {
      lock.releaseLock();
    }
  }

  function verifyInstallation() {
    var ss = activeSpreadsheet_();
    var lock = LockService.getScriptLock();
    lock.waitLock(CONFIG.PERFORMANCE.LOCK_TIMEOUT_MS);
    try {
      assertInstallableCopy_(ss);
      if (readState_(ss) !== STATES.READY) throw new Error('A instalação ainda não foi concluída.');
      var prepared = ensureDatabaseStructureForRuntime_(ss);
      var schema = prepared.schema;
      SchemaMigrationService.ensureCurrentUnlocked();
      PublicAwardeeService.ensureDefaultConfiguration();
      var check = finalValidation_(ss);
      if (!check.ok) throw new Error(check.issues.join(' '));
      hideManagedSheets_(ss);
      updateInstallerSheetStatus_(ss);
      return { ok: true, validation: check, schema: schema, state: getState(), detail: 'Verificação idempotente concluída sem duplicações.' };
    } finally {
      lock.releaseLock();
    }
  }

  function runtimeDatabaseStatus_() {
    try {
      var diagnostics = SpreadsheetGateway.getBindingDiagnostics();
      var ss = SpreadsheetGateway.getSpreadsheet();
      var missing = InstallationSchema.managedNames().filter(function (name) {
        return !ss.getSheetByName(name);
      });
      return {
        ok: missing.length === 0,
        spreadsheetId: ss.getId(),
        missingSheets: missing,
        reason: missing.length ? 'Estrutura incompleta: ' + missing.join(', ') : '',
        binding: diagnostics
      };
    } catch (error) {
      return {
        ok: false,
        spreadsheetId: '',
        missingSheets: [],
        reason: error && error.message ? error.message : String(error)
      };
    }
  }

  function isLegacyProject_() {
    if (!cfg_().ALLOW_LEGACY_RUNTIME_FALLBACK) return false;
    try {
      return String(ScriptApp.getScriptId() || '') === String(cfg_().LEGACY_SCRIPT_ID || '');
    } catch (error) {
      return false;
    }
  }

  function runtimeStatus() {
    var explicitState = normalize_(props_().getProperty(cfg_().STATE_PROPERTY));

    // Um estado explícito da instalação sempre prevalece sobre a compatibilidade
    // do projeto legado. Em especial, NOT_INSTALLED / INSTALLING / FAILED nunca
    // podem abrir o sistema operacional antes da criação integral do schema.
    if (explicitState && explicitState !== STATES.READY) {
      return {
        ready: false,
        state: explicitState,
        legacy: false,
        reason: 'Instalação ainda não concluída (' + explicitState + ').',
        missingSheets: []
      };
    }

    if (explicitState === STATES.READY) {
      var installedStatus = runtimeDatabaseStatus_();
      return {
        ready: installedStatus.ok,
        state: STATES.READY,
        legacy: false,
        reason: installedStatus.ok ? '' : installedStatus.reason,
        spreadsheetId: installedStatus.spreadsheetId,
        missingSheets: installedStatus.missingSheets
      };
    }

    // Compatibilidade somente para a base histórica, que não possuía
    // estado do instalador. O Script ID, sozinho, deixou de ser suficiente:
    // a estrutura física obrigatória também precisa existir.
    if (isLegacyProject_()) {
      var legacyStatus = runtimeDatabaseStatus_();
      return {
        ready: legacyStatus.ok,
        state: legacyStatus.ok ? 'LEGACY_COMPAT' : STATES.NOT_INSTALLED,
        legacy: true,
        reason: legacyStatus.ok ? '' : legacyStatus.reason,
        spreadsheetId: legacyStatus.spreadsheetId,
        missingSheets: legacyStatus.missingSheets
      };
    }

    return {
      ready: false,
      state: STATES.NOT_INSTALLED,
      legacy: false,
      reason: 'O Destaque Acadêmico ainda não foi instalado neste projeto.',
      missingSheets: []
    };
  }

  function runtimeReady() {
    return runtimeStatus().ready === true;
  }

  function deploymentGuide() {
    return {
      title: 'Publicar o Destaque Acadêmico TOP+',
      steps: [
        { title: 'Abrir o Apps Script', text: 'Na planilha instalada, acesse Extensões > Apps Script.' },
        { title: 'Criar nova implantação', text: 'No editor, clique em Implantar > Nova implantação e escolha o tipo App da Web.' },
        { title: 'Configurar o App da Web', text: 'Descrição: Destaque Acadêmico TOP+. Executar como: Eu (usuário que está implantando). Acesso: Qualquer pessoa, conforme permitido pela política do domínio.' },
        { title: 'Autorizar e guardar a URL', text: 'Conclua a autorização, copie a URL /exec e abra em nova aba. Confirme primeiro a página pública de premiados e, depois, teste a Área restrita. Essa URL é o endereço do sistema.' }
      ],
      manifest: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }
    };
  }

  return Object.freeze({
    STATES: STATES,
    assertCanPrepare: assertCanPrepare,
    prepareOfficialTemplate: prepareOfficialTemplate,
    handleOpen: handleOpen,
    getState: getState,
    beginInstallation: beginInstallation,
    runInstallationStep: runInstallationStep,
    verifyInstallation: verifyInstallation,
    runtimeReady: runtimeReady,
    runtimeStatus: runtimeStatus,
    deploymentGuide: deploymentGuide,
    updateInstallerSheetStatus: function () { var ss = activeSpreadsheet_(); updateInstallerSheetStatus_(ss); return getState(); }
  });
})();
