CREATE TABLE IF NOT EXISTS pods (
		uuid TEXT PRIMARY KEY,
		node_uuid TEXT REFERENCES nodes(uuid),
		metadata_json TEXT NOT NULL,
		spec_json TEXT NOT NULL,
		status_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pods_events (
		uuid TEXT PRIMARY KEY,
		pod_uuid TEXT REFERENCES pods(uuid),
		event_type TEXT NOT NULL,
		reason TEXT,
		message TEXT,
		timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);