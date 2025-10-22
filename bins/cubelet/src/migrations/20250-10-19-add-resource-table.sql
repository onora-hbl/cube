CREATE TABLE IF NOT EXISTS resource (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		type TEXT NOT NULL,
		labels TEXT,
		scheduled_on TEXT,
		resource_version INTEGER DEFAULT 1,
		generation INTEGER DEFAULT 1,
		spec TEXT
);