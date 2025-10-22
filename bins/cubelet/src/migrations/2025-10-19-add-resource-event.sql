CREATE TABLE IF NOT EXISTS resource_event (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		resource_id INTEGER NOT NULL,
		happened_at TEXT NOT NULL,
		event_type TEXT NOT NULL,
		details TEXT
);