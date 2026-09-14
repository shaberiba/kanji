import { db } from './index.js';

const addStmt = db.prepare(`
  INSERT OR IGNORE INTO allowed_roles (guild_id, role_id, added_by, created_at)
  VALUES (?, ?, ?, ?)
`);

const removeStmt = db.prepare(
  'DELETE FROM allowed_roles WHERE guild_id = ? AND role_id = ?'
);

const listStmt = db.prepare(
  'SELECT * FROM allowed_roles WHERE guild_id = ? ORDER BY created_at ASC'
);

export function addAllowedRole(guildId, roleId, addedBy) {
  addStmt.run(guildId, roleId, addedBy, new Date().toISOString());
}

export function removeAllowedRole(guildId, roleId) {
  const result = removeStmt.run(guildId, roleId);
  return result.changes > 0;
}

export function listAllowedRoles(guildId) {
  return listStmt.all(guildId);
}
