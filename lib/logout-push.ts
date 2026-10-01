// Enrollment takes user SHARE first. Logout must wait on that user BEFORE revoking devices,
// so a committed concurrent registration is visible to the following DELETE statement.
// Expired/PIN-gated sessions may still log out; explicit endpoint ownership is checked below.
export const logoutUserLockSql = `SELECT u.id FROM horacerta.users u JOIN horacerta.sessions s ON s.user_id=u.id
 WHERE s.token_hash=$1 FOR UPDATE OF u`;

// Explicit endpoints require a live owner session; exact registration provenance remains revocable after expiry.
export const logoutPushSql = `DELETE FROM horacerta.push_subscriptions p WHERE p.session_hash=$1
 OR (p.endpoint=$2 AND EXISTS(SELECT 1 FROM horacerta.sessions s JOIN horacerta.users u ON u.id=s.user_id
  AND u.credential_version=s.credential_version WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp()
  AND u.active AND u.id=p.user_id))`;
