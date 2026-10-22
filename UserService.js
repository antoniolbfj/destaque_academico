var UserService = (function () {
  function findByEmail(email) {
    var normalizedEmail = TextUtil.normalizeEmail(email);
    if (!normalizedEmail) return null;
    var users = UserDAO.list();
    var found = users.find(function (item) { return item.email === normalizedEmail; }) || null;
    var ownerEmail = SpreadsheetGateway.getOwnerEmail();

    if (ownerEmail && normalizedEmail === ownerEmail) {
      return {
        name: found && found.name ? found.name : normalizedEmail,
        profile: CONFIG.USER_PROFILES.SUPERUSER,
        email: normalizedEmail,
        isOwner: true
      };
    }
    return found;
  }

  function getAdminContext(actor) {
    AuthorizationService.requireManageUsers(actor);
    var rows = UserDAO.list();
    var ownerEmail = SpreadsheetGateway.getOwnerEmail();
    var ownerFound = rows.some(function (item) { return item.email === ownerEmail; });

    if (!ownerFound && ownerEmail) {
      rows.push({ name: ownerEmail, profile: CONFIG.USER_PROFILES.SUPERUSER, email: ownerEmail, isOwner: true });
    }

    rows.forEach(function (item) {
      item.isOwner = Boolean(ownerEmail && item.email === ownerEmail);
      if (item.isOwner) item.profile = CONFIG.USER_PROFILES.SUPERUSER;
    });

    function priority(profile) {
      if (profile === CONFIG.USER_PROFILES.SUPERUSER) return 0;
      if (profile === CONFIG.USER_PROFILES.ADMIN) return 1;
      return 2;
    }

    rows.sort(function (a, b) {
      return priority(a.profile) - priority(b.profile) ||
        TextUtil.localeComparePt(a.name, b.name) ||
        TextUtil.localeComparePt(a.email, b.email);
    });

    return {
      actor: UserModel.publicIdentity(actor),
      users: rows,
      profiles: [CONFIG.USER_PROFILES.ADMIN, CONFIG.USER_PROFILES.CGAE_SUPERVISOR],
      ownerEmail: ownerEmail,
      canEditOwner: AuthorizationService.isSuperuser(actor)
    };
  }

  function save(actor, payload) {
    AuthorizationService.requireManageUsers(actor);
    if (!payload || typeof payload !== 'object') throw new Error('Dados do usuário não informados.');

    return LockExecutor.withScriptLock(function () {
      var originalEmail = TextUtil.normalizeEmail(payload.originalEmail || '');
      var ownerEmail = SpreadsheetGateway.getOwnerEmail();
      var candidate = UserModel.validate({
        name: payload.name,
        email: payload.email,
        profile: payload.profile
      });

      var targetIsOwner = Boolean((originalEmail && originalEmail === ownerEmail) || candidate.email === ownerEmail);
      if (targetIsOwner && !AuthorizationService.isSuperuser(actor)) {
        throw new Error('Somente o Superusuário pode alterar o registro do proprietário da planilha.');
      }
      if (targetIsOwner) {
        if (candidate.email !== ownerEmail || candidate.profile !== CONFIG.USER_PROFILES.SUPERUSER) {
          throw new Error('O proprietário da planilha deve permanecer com o perfil Superusuário e com o e-mail da conta proprietária.');
        }
      } else if (candidate.profile === CONFIG.USER_PROFILES.SUPERUSER) {
        throw new Error('O perfil Superusuário é reservado ao proprietário da planilha.');
      }

      var users = UserDAO.list({ bypassCache: true });
      var targetIndex = -1;
      var duplicateIndex = -1;
      users.forEach(function (user, index) {
        if (originalEmail && user.email === originalEmail) targetIndex = index;
        if (user.email === candidate.email) duplicateIndex = index;
      });

      if (originalEmail && targetIndex < 0 && !targetIsOwner) {
        throw new Error('O usuário selecionado não foi encontrado. Atualize a lista e tente novamente.');
      }
      if ((!originalEmail && duplicateIndex >= 0) || (originalEmail && duplicateIndex >= 0 && duplicateIndex !== targetIndex)) {
        throw new Error('Já existe um usuário cadastrado com este e-mail.');
      }

      candidate.profile = targetIsOwner ? CONFIG.USER_PROFILES.SUPERUSER : candidate.profile;
      candidate.isOwner = targetIsOwner;
      if (targetIndex >= 0) users[targetIndex] = candidate;
      else users.push(candidate);

      UserDAO.replaceAll(users);
      return getAdminContext(actor);
    });
  }

  function remove(actor, email) {
    AuthorizationService.requireManageUsers(actor);
    var normalizedEmail = TextUtil.normalizeEmail(email);
    if (!TextUtil.isValidEmail(normalizedEmail)) throw new Error('Usuário inválido.');

    return LockExecutor.withScriptLock(function () {
      var ownerEmail = SpreadsheetGateway.getOwnerEmail();
      if (ownerEmail && normalizedEmail === ownerEmail) {
        throw new Error('O Superusuário proprietário da planilha não pode ser excluído.');
      }

      var users = UserDAO.list({ bypassCache: true });
      var filtered = users.filter(function (user) { return user.email !== normalizedEmail; });
      if (filtered.length === users.length) throw new Error('O usuário selecionado não foi encontrado.');

      UserDAO.replaceAll(filtered);
      return getAdminContext(actor);
    });
  }

  return Object.freeze({ findByEmail: findByEmail, getAdminContext: getAdminContext, save: save, remove: remove });
})();
