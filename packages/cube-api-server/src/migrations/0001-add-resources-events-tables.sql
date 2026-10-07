CREATE TABLE resources (
  id TEXT,
  kind TEXT,
  name TEXT,
  metadatas TEXT,
  spec TEXT,
  status TEXT,
  PRIMARY KEY (id)
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  involved_kind TEXT,
  involved_id TEXT,
  type TEXT,
  reason TEXT,
  message TEXT,
  created_at INTEGER
);
