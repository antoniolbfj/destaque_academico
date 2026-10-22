const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function bounds(address) {
  const parts = address.split(':').map(cell => {
    const [, letters, row] = /^([A-Z]+)(\d+)$/.exec(cell);
    const col = [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
    return { row: Number(row), col };
  });
  return [parts[0].row, parts[0].col,
    (parts[1] || parts[0]).row - parts[0].row + 1,
    (parts[1] || parts[0]).col - parts[0].col + 1];
}

class Range {
  constructor(sheet, row, col, rows = 1, cols = 1) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }
  getValue() { return this.sheet.cells.get(`${this.row},${this.col}`) ?? ''; }
  getDisplayValue() { return String(this.getValue()); }
  getValues() {
    return Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.cols }, (_, c) => this.sheet.cells.get(`${this.row + r},${this.col + c}`) ?? ''));
  }
  setValue(value) { this.sheet.cells.set(`${this.row},${this.col}`, value); return this; }
  setValues(values) {
    values.forEach((row, r) => row.forEach((v, c) => this.sheet.cells.set(`${this.row + r},${this.col + c}`, v)));
    return this;
  }
  clearContent() {
    for (const key of this.sheet.cells.keys()) {
      const [r, c] = key.split(',').map(Number);
      if (r >= this.row && r < this.row + this.rows && c >= this.col && c < this.col + this.cols) this.sheet.cells.delete(key);
    }
    return this;
  }
  setRichTextValue(value) { return this.setValue(value.text); }
  breakApart() {
    this.sheet.merges = this.sheet.merges.filter(m => !this.overlaps(m));
    return this;
  }
  overlaps(other) {
    return this.row < other.row + other.rows && other.row < this.row + this.rows &&
      this.col < other.col + other.cols && other.col < this.col + this.cols;
  }
  merge() {
    for (const m of this.sheet.merges) {
      if (this.overlaps(m) && [this.row, this.col, this.rows, this.cols].join() !== [m.row, m.col, m.rows, m.cols].join()) {
        throw new Error('Tentativa de mesclar intervalos incompatíveis');
      }
    }
    this.sheet.merges.push(this);
    return this;
  }
}
for (const name of ['setBackground', 'setFontColor', 'setFontWeight', 'setFontSize',
  'setHorizontalAlignment', 'setVerticalAlignment', 'setWrap', 'setDataValidation']) {
  Range.prototype[name] = function () { return this; };
}

class Sheet {
  constructor(ss, name, id) {
    Object.assign(this, { ss, name, id, cells: new Map(), hidden: false, rows: 1000, cols: 26, merges: [] });
  }
  getName() { return this.name; }
  getSheetId() { return this.id; }
  setName(name) {
    if (this.ss.sheets.some(s => s !== this && s.name === name)) throw new Error('Nome de aba duplicado');
    this.name = name;
    return this;
  }
  getRange(...args) { return new Range(this, ...(typeof args[0] === 'string' ? bounds(args[0]) : args)); }
  getLastRow() { return Math.max(0, ...[...this.cells.keys()].map(k => Number(k.split(',')[0]))); }
  getLastColumn() { return Math.max(0, ...[...this.cells.keys()].map(k => Number(k.split(',')[1]))); }
  getMaxRows() { return this.rows; }
  getMaxColumns() { return this.cols; }
  insertRowsAfter(after, count) { this.rows += count; }
  insertColumnsAfter(after, count) { this.cols += count; }
  clear() { this.cells.clear(); return this; }
  showSheet() { this.hidden = false; return this; }
  hideSheet() {
    if (!this.ss.sheets.some(s => s !== this && !s.hidden)) throw new Error('A última aba visível não pode ser ocultada');
    this.hidden = true;
    return this;
  }
}
for (const name of ['clearConditionalFormatRules', 'setHiddenGridlines', 'setFrozenRows',
  'setColumnWidths', 'setColumnWidth', 'setRowHeight', 'setRowHeights', 'hideColumns']) {
  Sheet.prototype[name] = function () { return this; };
}

function harness({ state, cellState, binding = '', sheetNames = ['Dados', 'Outra aba'], scriptId = 'test-script' } = {}) {
  const properties = new Map();
  const named = new Map();
  const menus = [];
  const alerts = [];
  const dialogs = [];
  let nextSheetId = 0;
  let locked = false;
  let dbId = binding;
  let users = [];
  let failReports = false;
  let uuid = 0;
  const ss = {
    id: 'original', name: 'Planilha inicial', sheets: [],
    getId() { return this.id; }, getName() { return this.name; },
    getOwner() { return { getEmail: () => 'owner@example.com' }; },
    getSheets() { return this.sheets.slice(); },
    getSheetByName(name) { return this.sheets.find(s => s.name === name) || null; },
    insertSheet(name = `Nova aba ${nextSheetId + 1}`) {
      if (this.getSheetByName(name)) throw new Error('Nome de aba duplicado');
      const sheet = new Sheet(this, name, ++nextSheetId);
      this.sheets.push(sheet);
      return sheet;
    },
    deleteSheet(sheet) {
      assert.ok(this.sheets.some(s => s !== sheet && !s.hidden), 'preserva uma aba visível');
      this.sheets = this.sheets.filter(s => s !== sheet);
      for (const [name, range] of named) if (range.sheet === sheet) named.delete(name);
    },
    setActiveSheet(sheet) { this.active = sheet; return sheet; },
    rename(name) { this.name = name; },
    setSpreadsheetTimeZone(zone) { this.zone = zone; },
    getSpreadsheetTimeZone() { return this.zone; },
    setNamedRange(name, range) { named.set(name, range); },
    getRangeByName(name) { return named.get(name) || null; },
    getNamedRanges() { return [...named.keys()].map(name => ({ getName: () => name, remove: () => named.delete(name) })); }
  };
  sheetNames.forEach(name => ss.insertSheet(name));
  ss.sheets[0].getRange('A1').setValue('Conteúdo anterior que deve ser substituído');
  const ui = {
    ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' }, Button: { YES: 'YES', NO: 'NO' }, answer: 'YES',
    alert(...args) { alerts.push(args); return this.answer; },
    showModalDialog(output, title) { dialogs.push({ output, title }); },
    createMenu(title) {
      const menu = { title, items: [], addItem(label, handler) { this.items.push({ label, handler }); return this; }, addToUi() { menus.push(this); } };
      return menu;
    }
  };
  const context = vm.createContext({
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss, getUi: () => ui, flush() {},
      newRichTextValue() {
        return { setText(text) { this.text = text; return this; }, setLinkUrl(url) { this.url = url; return this; }, build() { return this; } };
      },
      newDataValidation() { return { requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } }; }
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) ?? null,
      setProperty: (key, value) => properties.set(key, value),
      deleteProperty: key => properties.delete(key)
    }) },
    LockService: { getScriptLock: () => ({
      waitLock() { assert.equal(locked, false, 'sem aquisição aninhada de lock'); locked = true; },
      releaseLock() { assert.equal(locked, true); locked = false; }
    }) },
    Utilities: { getUuid: () => `uuid-${++uuid}` },
    ScriptApp: { getScriptId: () => scriptId },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    HtmlService: { createTemplateFromFile: () => ({ evaluate() { return { setWidth() { return this; }, setHeight() { return this; } }; } }) }
  });
  const load = name => vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
  load('Config.js');
  load('Infrastructure.js');
  load('DataImportModel.js');
  load('InstallationSchema.js');
  load('UserModel.js');
  const config = context.CONFIG;
  const defaults = config.DEFAULT_SEMESTRAL_PACKAGE;
  const params = [
    { id: defaults.PARAM_GE_FIELD_ID, operator: '>=', comparisonType: config.PARAMETER_COMPARISON_TYPES.FIELD },
    { id: defaults.PARAM_ZERO_ID, operator: '=', comparisonType: config.PARAMETER_COMPARISON_TYPES.VALUE, value: '0' },
    { id: defaults.PARAM_ENROLLED_ID, operator: '=', comparisonType: config.PARAMETER_COMPARISON_TYPES.VALUE, value: 'MATRICULADO' },
    { id: defaults.PARAM_IGNORED_COMPONENTS_ID, operator: config.PARAMETER_OPERATORS.IGNORE, comparisonType: config.PARAMETER_COMPARISON_TYPES.VALUE, value: defaults.IGNORED_COMPONENTS.join(';') }
  ];
  Object.assign(context, {
    SpreadsheetGateway: {
      clearBinding() { dbId = ''; }, bindSpreadsheetId(id) { dbId = id; },
      getConfiguredSpreadsheetId: () => dbId,
      getSpreadsheet() { assert.equal(dbId, ss.id); return ss; }, reset() {},
      getOwnerEmail: () => 'owner@example.com',
      getBindingDiagnostics: () => ({ documentPropertyDatabaseId: dbId, scriptPropertyDatabaseId: dbId, consistent: true })
    },
    ParameterDAO: { list: () => params },
    CriteriaPackageDAO: {
      listPackages: () => [{ id: defaults.PACKAGE_ID, regime: 'SEMESTRAL', status: config.PARAMETER_STATUS.ACTIVE }],
      listRules: () => ['DISCIPLINA', 'MOVIMENTO_ATUAL', 'DISCIPLINAS_CURSADAS_PERIODO', 'NUMERO_REPROVACOES'].map((field, i) => ({
        packageId: defaults.PACKAGE_ID, field, parameterId: [params[3].id, params[2].id, params[0].id, params[1].id][i],
        comparisonField: i === 2 ? 'MINIMO_50_MAIS_1' : '', order: i + 1, connector: 'E'
      }))
    },
    UserDAO: { list: () => users, replaceAll(value) { users = value; } },
    SchemaMigrationService: { ensureDefaultSemestralPackageUnlocked: () => ({ seeded: true }), ensureCurrentUnlocked() {} },
    AwardeeReportService: { validateDefaultModels: () => ({ ok: !failReports, count: 2, issues: failReports ? ['Falha de relatório simulada'] : [] }) },
    PublicAwardeeService: { ensureDefaultConfiguration: () => ({ created: true }), validateConfiguration: () => ({ ok: true, fieldCount: 8 }) }
  });
  load('InstallerService.js');
  load('InstallerController.js');
  load('Code.js');
  if (state) properties.set(config.INSTALLATION.STATE_PROPERTY, state);
  if (cellState) {
    const range = ss.sheets[0].getRange('J5').setValue(cellState);
    ss.setNamedRange(config.INSTALLATION.STATE_RANGE, range);
  }
  return {
    context, ss, properties, named, menus, alerts, dialogs, ui,
    service: context.InstallerService, config,
    binding: () => dbId,
    failReports(value) { failReports = value; },
    snapshot: () => JSON.stringify({ sheets: ss.sheets.map(s => ({ name: s.name, cells: [...s.cells], hidden: s.hidden })), properties: [...properties], binding: dbId })
  };
}

function installerCopy() {
  const h = harness();
  h.service.prepareOfficialTemplate();
  h.ss.id = 'copy'; // Uma cópia herda os valores dos intervalos, mas possui outro ID.
  return h;
}

function finish(h, result = h.service.beginInstallation({ superuserName: 'Responsável' })) {
  const runId = result.runId;
  for (let i = 0; i < 8 && !result.done; i++) result = h.service.runInstallationStep(runId);
  assert.equal(result.done, true);
  return result;
}

test('menu aparece mesmo em uma planilha sem metadados de instalação', () => {
  const h = harness();
  h.context.onOpen();
  assert.deepEqual(h.menus.at(-1).items.map(i => i.label), ['Preparar Planilha Instaladora', 'Instalar Destaque Acadêmico Top+']);
});

test('preparação substitui abas com conteúdo por uma única INSTALADORA e pode ser repetida', () => {
  const h = harness({ sheetNames: ['Dados', 'INSTALADORA', 'PRÊMIOS'] });
  h.ss.sheets[1].getRange('B4').setValue('Conteúdo extra');
  for (let i = 0; i < 2; i++) {
    const state = h.service.prepareOfficialTemplate();
    assert.deepEqual(h.ss.sheets.map(s => s.name), ['INSTALADORA']);
    assert.equal(h.ss.active.hidden, false);
    assert.equal(state.isTemplate, true);
    assert.equal(state.canInstall, false);
    assert.match(h.ss.active.getRange('A4').getValue(), /Bem-vindo/);
    assert.match(h.ss.active.getRange('A11').getValue(), /faça uma cópia/);
    assert.equal(h.ss.active.getRange('A14').getValue(), 'FAZER UMA CÓPIA');
    assert.equal(h.ss.active.getRange('J2').getValue(), 'original');
    assert.equal(h.ss.active.getRange('J5').getValue(), 'NOT_INSTALLED');
    assert.equal(h.binding(), '');
    assert.equal(h.ss.sheets.some(s => s.getRange('A1').getValue().includes('Conteúdo anterior')), false);
  }
});

test('cancelar a confirmação de preparação preserva todos os dados', () => {
  const h = harness();
  h.ui.answer = h.ui.Button.NO;
  const before = h.snapshot();
  h.context.prepareOfficialInstallerTemplate();
  assert.equal(h.snapshot(), before);
  assert.equal(h.alerts[0][2], h.ui.ButtonSet.YES_NO);
});

for (const setup of [
  { state: 'READY' },
  { cellState: 'READY' },
  { state: 'NOT_INSTALLED', cellState: 'READY' },
  { state: 'READY', cellState: 'NOT_INSTALLED' },
  { scriptId: '1yoTmcuybocx4hMx203iOj2RGsYffAbWovPKDg6A_YjG3DBGF1va0qPAe' }
]) {
  test(`produção bloqueia preparação e instalação sem alterar dados: ${JSON.stringify(setup)}`, () => {
    const h = harness(setup);
    const before = h.snapshot();
    assert.throws(() => h.service.prepareOfficialTemplate(), /produção/);
    assert.throws(() => h.context.prepareOfficialInstallerTemplate(), /produção/);
    assert.throws(() => h.service.beginInstallation({ superuserName: 'Responsável' }), /produção/);
    assert.throws(() => h.service.runInstallationStep('invalid'), /produção/);
    h.context.showInstaller();
    assert.equal(h.dialogs.length, 0);
    assert.equal(h.snapshot(), before);
  });
}

test('assistente e serviço recusam planilha sem preparação e matriz original', () => {
  const h = harness();
  assert.throws(() => h.service.beginInstallation({ superuserName: 'Responsável' }), /não foi preparada/);
  h.context.showInstaller();
  assert.equal(h.dialogs.length, 0);
  h.service.prepareOfficialTemplate();
  assert.throws(() => h.service.beginInstallation({ superuserName: 'Responsável' }), /original/);
  h.context.showInstaller();
  assert.equal(h.dialogs.length, 0);
  assert.match(h.alerts.at(-1)[1], /FAZER UMA CÓPIA/);
});

test('remover metadados ou a superfície invalida a preparação da cópia', () => {
  for (const missing of ['TEMPLATE_ID_RANGE', 'DISTRIBUTION_ID_RANGE', 'SCHEMA_VERSION_RANGE', 'STATE_RANGE', 'sheet']) {
    const h = installerCopy();
    if (missing === 'sheet') h.ss.sheets[0].setName('Outra');
    else h.named.delete(h.config.INSTALLATION[missing]);
    assert.throws(() => h.service.beginInstallation({ superuserName: 'Responsável' }), /não foi preparada/);
  }
});

test('cópia preparada abre o assistente e conclui as oito etapas com base oculta e instalação ativa', () => {
  const h = installerCopy();
  h.context.showInstaller();
  assert.equal(h.dialogs.length, 1);
  const result = finish(h);
  assert.equal(result.state.installed, true);
  assert.equal(h.ss.sheets.length, 12);
  assert.equal(h.ss.getSheetByName('INSTALADORA'), null);
  assert.equal(h.ss.active.name, 'INSTALAÇÃO ATIVA');
  assert.equal(h.ss.sheets.filter(s => !s.hidden).length, 1);
  for (const name of h.context.InstallationSchema.managedNames()) assert.equal(h.ss.getSheetByName(name).hidden, true);
  assert.equal(h.context.InstallationSchema.validateAll(h.ss).ok, true);
  assert.equal(h.binding(), 'copy');
  assert.equal(h.ss.active.getRange('J2').getValue(), 'original');
  assert.equal(h.ss.active.getRange('J5').getValue(), 'READY');
  assert.match(h.ss.active.getRange('A6').getValue(), /dados acadêmicos/);
  assert.match(h.ss.active.getRange('A11').getValue(), /instalação está ativa/);
  assert.equal(h.ss.active.getRange('A14').getValue(), 'INSTALAÇÃO ATIVA');
  assert.equal(h.properties.has(h.config.INSTALLATION.RUN_PROPERTY), false);
  assert.throws(() => h.service.beginInstallation({ superuserName: 'Outro responsável' }), /produção/);
  assert.throws(() => h.service.prepareOfficialTemplate(), /produção/);
  h.context.onOpen();
  assert.deepEqual(h.menus.at(-1).items.map(i => i.handler), ['showInstallationStatus', 'showDeploymentGuide']);
  assert.equal(h.ss.sheets.length, 12, 'reabrir não recria abas');
});

test('instalação em andamento não pode ser apagada pela preparação', () => {
  const h = installerCopy();
  h.service.beginInstallation({ superuserName: 'Responsável' });
  const before = h.snapshot();
  assert.throws(() => h.service.prepareOfficialTemplate(), /em andamento/);
  assert.equal(h.snapshot(), before);
});

test('falha parcial mantém INSTALADORA e permite retomar até a ativação', () => {
  const h = installerCopy();
  const begin = h.service.beginInstallation({ superuserName: 'Responsável' });
  for (let i = 0; i < 5; i++) h.service.runInstallationStep(begin.runId);
  h.failReports(true);
  assert.throws(() => h.service.runInstallationStep(begin.runId), /Falha de relatório/);
  assert.equal(h.service.getState().state, 'FAILED');
  assert.ok(h.ss.getSheetByName('INSTALADORA'));
  assert.equal(h.ss.getSheetByName('INSTALAÇÃO ATIVA'), null);
  h.failReports(false);
  const resume = h.service.beginInstallation({ superuserName: 'Responsável' });
  assert.equal(resume.resumed, true);
  assert.equal(resume.nextStep, 5);
  finish(h, resume);
  assert.equal(h.ss.sheets.length, 12);
  assert.equal(h.ss.active.name, 'INSTALAÇÃO ATIVA');
});

test('cópia de produção não perde o bloqueio ao reconciliar um vínculo herdado', () => {
  const h = installerCopy();
  finish(h);
  h.ss.id = 'copy-of-production';
  const before = h.snapshot();
  const state = h.service.getState();
  assert.equal(state.installed, true);
  assert.equal(state.canPrepare, false);
  assert.equal(state.canInstall, false);
  assert.equal(h.snapshot(), before);
});

test('instalação anterior com aba INSTALAÇÃO continua verificável e ganha o novo nome', () => {
  const h = installerCopy();
  finish(h);
  h.ss.active.setName('INSTALAÇÃO');
  h.context.onOpen();
  assert.equal(h.ss.active.name, 'INSTALAÇÃO ATIVA');
  h.context.showInstallationStatus();
  assert.equal(h.dialogs.length, 1);
  assert.equal(h.service.verifyInstallation().ok, true);
});

test('controller atualiza o menu imediatamente quando a última etapa termina', () => {
  const h = installerCopy();
  const begin = h.context.beginTopPlusInstallation({ superuserName: 'Responsável' });
  for (let i = 0; i < 8; i++) h.context.runTopPlusInstallationStep(begin.runId);
  assert.deepEqual(h.menus.at(-1).items.map(i => i.handler), ['showInstallationStatus', 'showDeploymentGuide']);
});
