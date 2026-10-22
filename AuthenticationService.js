var AuthenticationService = (function () {
  function requestCode(email) {
    var normalizedEmail = TextUtil.normalizeEmail(email);
    if (!TextUtil.isValidEmail(normalizedEmail)) throw new Error('Informe um e-mail válido.');

    var rateKey = CONFIG.AUTH.OTP_RATE_PREFIX + CryptoUtil.sha256Hex(normalizedEmail);
    if (PerformanceCache.get(rateKey)) {
      return { ok: true, message: 'Se o e-mail estiver cadastrado, um novo código poderá ser solicitado em instantes.' };
    }

    var user = UserService.findByEmail(normalizedEmail);
    if (!user) {
      PerformanceCache.put(rateKey, '1', CONFIG.AUTH.OTP_REQUEST_COOLDOWN_SECONDS);
      return { ok: true, message: 'Se o e-mail estiver cadastrado, enviaremos um código de acesso.' };
    }

    var code = CryptoUtil.sixDigitCode();
    var now = Date.now();
    var otpKey = CONFIG.AUTH.OTP_STORAGE_PREFIX + CryptoUtil.sha256Hex(normalizedEmail);
    var record = {
      email: normalizedEmail,
      hash: CryptoUtil.sha256Hex(normalizedEmail + '|' + code),
      issuedAt: now,
      expiresAt: now + CONFIG.AUTH.OTP_TTL_SECONDS * 1000,
      attempts: 0
    };

    try {
      var quota = Number(MailApp.getRemainingDailyQuota());
      if (Number.isFinite(quota) && quota <= 0) throw new Error('Cota diária de e-mail esgotada.');

      MailApp.sendEmail({
        to: normalizedEmail,
        subject: 'Código de acesso — ' + CONFIG.APP_NAME + ' DEV',
        body: buildLoginCodeText_(user, code),
        name: CONFIG.APP_NAME,
        htmlBody: buildLoginCodeEmail_(user, code)
      });

      PerformanceCache.putJson(otpKey, record, CONFIG.AUTH.OTP_TTL_SECONDS);
      PerformanceCache.put(rateKey, '1', CONFIG.AUTH.OTP_REQUEST_COOLDOWN_SECONDS);
    } catch (error) {
      PerformanceCache.remove(otpKey);
      PerformanceCache.remove(rateKey);
      console.error('Falha ao enviar código para ' + normalizedEmail + ': ' + (error && error.message ? error.message : error));
      throw new Error('Não foi possível enviar o código de acesso. Tente novamente. Se o problema persistir, verifique a autorização e a cota de envio do Apps Script.');
    }

    return { ok: true, message: 'Código enviado. Verifique sua caixa de entrada e também a pasta de spam.' };
  }

  function verifyCode(email, code) {
    var normalizedEmail = TextUtil.normalizeEmail(email);
    var normalizedCode = String(code || '').replace(/\D/g, '');
    if (!TextUtil.isValidEmail(normalizedEmail) || !/^\d{6}$/.test(normalizedCode)) {
      throw new Error('Informe o e-mail e o código de 6 dígitos recebidos.');
    }

    return LockExecutor.withScriptLock(function () {
      var otpKey = CONFIG.AUTH.OTP_STORAGE_PREFIX + CryptoUtil.sha256Hex(normalizedEmail);
      var record = PerformanceCache.getJson(otpKey);
      if (!record || Number(record.expiresAt) <= Date.now()) {
        PerformanceCache.remove(otpKey);
        throw new Error('Código inválido ou expirado. Solicite um novo código.');
      }

      record.attempts = Number(record.attempts || 0) + 1;
      if (record.attempts > CONFIG.AUTH.OTP_MAX_ATTEMPTS) {
        PerformanceCache.remove(otpKey);
        throw new Error('Número máximo de tentativas excedido. Solicite um novo código.');
      }

      var expectedHash = CryptoUtil.sha256Hex(normalizedEmail + '|' + normalizedCode);
      if (expectedHash !== record.hash) {
        var remaining = Math.max(1, Math.ceil((Number(record.expiresAt) - Date.now()) / 1000));
        PerformanceCache.putJson(otpKey, record, remaining);
        throw new Error('Código inválido ou expirado.');
      }

      var user = UserService.findByEmail(normalizedEmail);
      if (!user) {
        PerformanceCache.remove(otpKey);
        throw new Error('Acesso não autorizado.');
      }

      PerformanceCache.remove(otpKey);
      var token = SessionService.create(normalizedEmail);
      return {
        ok: true,
        token: token,
        user: UserModel.publicIdentity(user),
        permissions: AuthorizationService.permissionsFor(user)
      };
    });
  }

  function buildLoginCodeText_(user, code) {
    return [
      CONFIG.INSTITUTION_NAME,
      CONFIG.APP_NAME + ' — ' + CONFIG.APP_MODE_LABEL,
      '',
      'Olá, ' + (user.name || user.email) + '.',
      '',
      'Seu código de acesso é: ' + code,
      '',
      'O código é válido por 10 minutos e pode ser usado uma única vez.',
      'Se você não solicitou este acesso, ignore esta mensagem.'
    ].join('\n');
  }

  function buildLoginCodeEmail_(user, code) {
    return '<div style="font-family:Arial,sans-serif;color:#1d2521;max-width:560px;margin:0 auto">' +
      '<div style="border-bottom:4px solid #146b3a;padding-bottom:12px;margin-bottom:20px">' +
        '<div style="font-size:13px;color:#0e4e2b;font-weight:700">' + TextUtil.escapeHtml(CONFIG.INSTITUTION_NAME) + '</div>' +
        '<h1 style="font-size:22px;margin:4px 0 0">' + TextUtil.escapeHtml(CONFIG.APP_NAME) + '</h1>' +
        '<div style="font-size:12px;color:#8a5b00;font-weight:700;margin-top:4px">' + TextUtil.escapeHtml(CONFIG.APP_MODE_LABEL) + '</div>' +
      '</div>' +
      '<p>Olá, <strong>' + TextUtil.escapeHtml(user.name || user.email) + '</strong>.</p>' +
      '<p>Use o código abaixo para entrar no ambiente de desenvolvimento:</p>' +
      '<div style="font-size:32px;letter-spacing:8px;font-weight:800;text-align:center;background:#e9f5ee;border:1px solid #bddbc8;border-radius:10px;padding:16px;margin:20px 0">' + TextUtil.escapeHtml(code) + '</div>' +
      '<p style="font-size:13px;color:#65716a">O código expira em 10 minutos e pode ser usado uma única vez. Se você não solicitou este acesso, ignore esta mensagem.</p>' +
    '</div>';
  }

  return Object.freeze({ requestCode: requestCode, verifyCode: verifyCode });
})();
