/** Funções públicas do instalador chamadas pelo menu e pela interface HTML. */
function prepareOfficialInstallerTemplate() {
  InstallerService.assertCanPrepare();
  var ui = SpreadsheetApp.getUi();
  var choice = ui.alert('Preparar Planilha Instaladora', 'Esta operação apaga o conteúdo da planilha e exclui todas as abas existentes, mantendo somente uma nova aba INSTALADORA. Deseja continuar?', ui.ButtonSet.YES_NO);
  if (choice !== ui.Button.YES) return;
  var state = InstallerService.prepareOfficialTemplate();
  refreshTopPlusMenu_();
  ui.alert('Planilha instaladora preparada', 'A aba INSTALADORA está pronta. Faça uma cópia desta planilha antes de executar Instalar Destaque Acadêmico Top+.', ui.ButtonSet.OK);
  return state;
}

function showInstaller() {
  var state = InstallerService.getState();
  if (state.installed) {
    SpreadsheetApp.getUi().alert('Instalação bloqueada', 'Esta planilha já possui uma instalação em produção. Uma nova instalação não é permitida.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  if (!state.templatePrepared) {
    SpreadsheetApp.getUi().alert('Planilha não preparada', 'Use Preparar Planilha Instaladora e faça uma cópia antes de instalar o sistema.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  if (state.isTemplate) {
    SpreadsheetApp.getUi().alert('Instalação bloqueada', 'Esta é a planilha instaladora original. Clique em FAZER UMA CÓPIA na aba INSTALADORA e execute o instalador dentro da cópia.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  showInstallerDialog_(state, 'INSTALL');
}

function showInstallationStatus() {
  var state = InstallerService.getState();
  if (!state.installed) {
    SpreadsheetApp.getUi().alert('Instalação pendente', 'Conclua a instalação antes de verificar uma instalação ativa.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  showInstallerDialog_(state, 'INSTALL');
}

function showInstallerDialog_(state, mode) {
  var template = HtmlService.createTemplateFromFile('InstallerUi');
  template.initialMode = mode;
  template.ownerEmail = state.ownerEmail || 'Não identificado';
  template.buildVersion = state.version || CONFIG.BUILD_VERSION || '';
  template.schemaVersion = state.schemaVersion || (CONFIG.INSTALLATION || {}).SCHEMA_VERSION || '';
  template.installationState = state.state || 'NOT_INSTALLED';
  template.initialInstalled = state.installed ? 'true' : 'false';
  SpreadsheetApp.getUi().showModalDialog(template.evaluate().setWidth(920).setHeight(760), CONFIG.APP_NAME + (mode === 'GUIDE' ? ' — implantação' : ' — instalação'));
}

function showDeploymentGuide() {
  var state = InstallerService.getState();
  if (!state.installed) {
    SpreadsheetApp.getUi().alert('Instalação pendente', 'Conclua a instalação antes de publicar o Aplicativo da Web.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  showInstallerDialog_(state, 'GUIDE');
}

function getInstallerBootstrap() {
  return {
    state: InstallerService.getState(),
    guide: InstallerService.deploymentGuide()
  };
}

function getInstallerState() {
  return InstallerService.getState();
}

function beginTopPlusInstallation(payload) {
  return InstallerService.beginInstallation(payload || {});
}

function runTopPlusInstallationStep(runId) {
  var result = InstallerService.runInstallationStep(runId);
  if (result.done) {
    try { refreshTopPlusMenu_(); } catch (error) { console.warn(error); }
  }
  return result;
}

function verifyTopPlusInstallation() {
  return InstallerService.verifyInstallation();
}

function getTopPlusDeploymentGuide() {
  return InstallerService.deploymentGuide();
}
