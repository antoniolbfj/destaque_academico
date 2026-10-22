function onOpen() {
  try { InstallerService.handleOpen(); } catch (error) { console.warn(error); }
  refreshTopPlusMenu_();
}

function refreshTopPlusMenu_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;

  var menu = SpreadsheetApp.getUi().createMenu('Destaque Acadêmico');
  var state = null;
  try { state = InstallerService.getState(); } catch (error3) {}
  if (state && state.installed) {
    menu.addItem('Verificar instalação', 'showInstallationStatus')
      .addItem('Orientações de implantação', 'showDeploymentGuide');
  } else {
    menu.addItem('Preparar Planilha Instaladora', 'prepareOfficialInstallerTemplate')
      .addItem('Instalar Destaque Acadêmico Top+', 'showInstaller');
  }
  menu.addToUi();
}

function doGet() {
  var runtime = InstallerService.runtimeStatus();
  if (!runtime.ready) {
    var detail = runtime.reason
      ? '<p style="font-size:12px;color:#7a8780"><strong>Diagnóstico:</strong> ' + TextUtil.escapeHtml(runtime.reason) + '</p>'
      : '';
    return HtmlService.createHtmlOutput(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{font-family:Arial,sans-serif;background:#f4f7f5;color:#23322b;display:grid;place-items:center;min-height:100vh;margin:0}.box{max-width:620px;background:#fff;border:1px solid #dce5e0;border-radius:12px;padding:28px;box-shadow:0 12px 36px rgba(0,0,0,.08)}h1{font-size:20px;color:#174c37}p{line-height:1.5;color:#637169}</style></head>' +
      '<body><div class="box"><h1>Destaque Acadêmico ainda não instalado</h1><p>Abra uma cópia da planilha instaladora e use <strong>Destaque Acadêmico &gt; Instalar Destaque Acadêmico Top+</strong>. O Aplicativo da Web será liberado automaticamente quando a instalação chegar ao estado <strong>READY</strong>.</p>' + detail + '</div></body></html>'
    ).setTitle(CONFIG.APP_NAME + ' — instalação pendente');
  }

  SchemaMigrationService.ensureCurrent();
  var template = HtmlService.createTemplateFromFile('Index');
  template.CONFIG = CONFIG;
  return template.evaluate()
    .setTitle(CONFIG.APP_NAME + ' — ' + CONFIG.APP_MODE_LABEL)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
