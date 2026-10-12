// Databas: Nodes inbyggda SQLite (node:sqlite, Node 22.5+). Ingen installation behövs.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cooks (
      id           INTEGER PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      country_code TEXT NOT NULL,
      cooked_on    TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, country_code, cooked_on)
    );
    CREATE INDEX IF NOT EXISTS cooks_user ON cooks(user_id);
  `);
  return db;
}

export function makeRepo(db) {
  const q = {
    createUser: db.prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare('SELECT id, username, display_name, created_at FROM users WHERE id = ?'),
    allUsers: db.prepare('SELECT id, username, display_name FROM users'),
    createSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    session: db.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')"),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')"),
    addCook: db.prepare('INSERT OR IGNORE INTO cooks (user_id, country_code, cooked_on) VALUES (?, ?, ?)'),
    deleteCook: db.prepare('DELETE FROM cooks WHERE id = ? AND user_id = ?'),
    cooksByUser: db.prepare('SELECT id, country_code, cooked_on FROM cooks WHERE user_id = ? ORDER BY cooked_on DESC, id DESC'),
    allCooks: db.prepare('SELECT user_id, country_code, cooked_on FROM cooks'),
  };

  return {
    createUser: (username, displayName, hash) => Number(q.createUser.run(username, displayName, hash).lastInsertRowid),
    userByName: (username) => q.userByName.get(username),
    userById: (id) => q.userById.get(id),
    allUsers: () => q.allUsers.all(),
    createSession: (tokenHash, userId, expiresAt) => q.createSession.run(tokenHash, userId, expiresAt),
    sessionUserId: (tokenHash) => q.session.get(tokenHash)?.user_id ?? null,
    deleteSession: (tokenHash) => q.deleteSession.run(tokenHash),
    purgeSessions: () => q.purgeSessions.run(),
    addCook: (userId, code, date) => q.addCook.run(userId, code, date).changes > 0,
    deleteCook: (id, userId) => q.deleteCook.run(id, userId).changes > 0,
    cooksByUser: (userId) => q.cooksByUser.all(userId),
    allCooks: () => q.allCooks.all(),
  };
}
