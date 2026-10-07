CREATE TABLE cluster_state (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO cluster_state (key, value) VALUES ('resource_version', 0);
