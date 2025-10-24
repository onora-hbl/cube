CREATE TABLE IF NOT EXISTS resources (
		uuid TEXT PRIMARY KEY,
		node_uuid TEXT REFERENCES nodes(uuid),
		resource_type TEXT NOT NULL,
		name TEXT NOT NULL,
		labels_json TEXT,
		spec_json TEXT NOT NULL,
		resource_version INTEGER NOT NULL,
		generation INTEGER NOT NULL,
		creation_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		status TEXT NOT NULL,
		reason TEXT,
		message TEXT
);

CREATE TABLE IF NOT EXISTS resources_events (
		uuid TEXT PRIMARY KEY,
		resource_uuid TEXT REFERENCES resources(uuid),
		event_type TEXT NOT NULL,
		reason TEXT,
		message TEXT,
		timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);