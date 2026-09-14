import { db } from './index.js';

const upsertStmt = db.prepare(`
  INSERT INTO facebook_tokens (
    page_id, page_name, page_access_token, long_lived_user_token,
    token_status, token_obtained_at, token_last_verified_at, updated_at
  ) VALUES (
    @pageId, @pageName, @pageAccessToken, @longLivedUserToken,
    @tokenStatus, @tokenObtainedAt, @tokenLastVerifiedAt, @updatedAt
  )
  ON CONFLICT(page_id) DO UPDATE SET
    page_name = excluded.page_name,
    page_access_token = excluded.page_access_token,
    long_lived_user_token = excluded.long_lived_user_token,
    token_status = excluded.token_status,
    token_obtained_at = excluded.token_obtained_at,
    updated_at = excluded.updated_at
`);

const getStmt = db.prepare('SELECT * FROM facebook_tokens WHERE page_id = ?');

const setStatusStmt = db.prepare(`
  UPDATE facebook_tokens
  SET token_status = ?, token_last_verified_at = ?, updated_at = ?
  WHERE page_id = ?
`);

export function saveFacebookToken({
  pageId,
  pageName,
  pageAccessToken,
  longLivedUserToken,
}) {
  const now = new Date().toISOString();
  upsertStmt.run({
    pageId,
    pageName: pageName ?? null,
    pageAccessToken,
    longLivedUserToken: longLivedUserToken ?? null,
    tokenStatus: 'valid',
    tokenObtainedAt: now,
    tokenLastVerifiedAt: now,
    updatedAt: now,
  });
}

export function getFacebookToken(pageId) {
  return getStmt.get(pageId) ?? null;
}

export function markTokenStatus(pageId, status) {
  const now = new Date().toISOString();
  setStatusStmt.run(status, now, now, pageId);
}
