CREATE TABLE rounds (
  id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT NOT NULL,
  started_at INTEGER NOT NULL
);

CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT NOT NULL UNIQUE REFERENCES rounds(id),
  score INTEGER NOT NULL CHECK (score >= 0),
  served_orders INTEGER NOT NULL CHECK (served_orders >= 0)
);

CREATE INDEX scores_rank ON scores (score DESC, id ASC);
