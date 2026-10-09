export const passwordRecoverySchema = [
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36) BINARY NOT NULL,
    commerce_id CHAR(36) BINARY NOT NULL, audience VARCHAR(10) NOT NULL,
    password_fingerprint CHAR(64) NOT NULL, expires_at DATETIME(3) NOT NULL,
    INDEX ix_reset_user (user_id), INDEX ix_reset_expiry (expires_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS password_reset_limits (
    bucket CHAR(64) PRIMARY KEY, hits INT NOT NULL, expires_at DATETIME(3) NOT NULL,
    INDEX ix_reset_limit_expiry (expires_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS password_reset_requests (
    id CHAR(36) PRIMARY KEY, email VARCHAR(190) NOT NULL, slug VARCHAR(120) NOT NULL,
    audience VARCHAR(10) NOT NULL, attempts INT NOT NULL DEFAULT 0,
    available_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL,
    INDEX ix_reset_request_due (available_at)
  ) ENGINE=InnoDB`,
];
