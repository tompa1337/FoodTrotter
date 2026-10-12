// Konton och inloggning: scrypt-hashade lösenord och sessionscookies.

import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const SESSION_DAYS = 30;
export const COOKIE_NAME = 'vm_session';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function validateSignup({ username, displayName, password }) {
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username || '')) {
    return 'Användarnamnet ska vara 3–24 tecken: bokstäver a–z, siffror, punkt, bindestreck eller understreck.';
  }
  if (!displayName || displayName.trim().length < 1 || displayName.length > 40) {
    return 'Ange ett visningsnamn på högst 40 tecken.';
  }
  if (!password || password.length < 8) return 'Lösenordet måste vara minst 8 tecken.';
  return null;
}

export function makeAuth(repo, { secureCookies }) {
  const cookie = (value, maxAge) =>
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;

  return {
    /** Skapar en session och returnerar Set-Cookie-värdet. */
    startSession(userId) {
      const token = randomBytes(32).toString('base64url');
      const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
      repo.createSession(sha256(token), userId, expires);
      return cookie(token, SESSION_DAYS * 86_400);
    },
    endSession(token) {
      if (token) repo.deleteSession(sha256(token));
      return cookie('', 0);
    },
    userFromToken(token) {
      if (!token) return null;
      const id = repo.sessionUserId(sha256(token));
      return id ? repo.userById(id) : null;
    },
  };
}
