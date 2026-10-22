/** Controller público de autenticação. */
function requestLoginCode(email) {
  return AuthenticationService.requestCode(email);
}

function verifyLoginCode(email, code) {
  return AuthenticationService.verifyCode(email, code);
}

function logoutSession(authToken) {
  SessionService.remove(authToken);
  return { ok: true };
}
