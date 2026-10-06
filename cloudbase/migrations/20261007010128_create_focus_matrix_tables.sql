-- Focus Matrix 云端 PostgreSQL 初始表结构
-- 从 cloud-site/db/schema.ts（D1/SQLite）迁移而来，语义保持一致。
-- 时间戳/修订号统一用 BIGINT（毫秒时间戳超出 INT32 范围）。

CREATE TABLE public.shared_plans (
  id              TEXT PRIMARY KEY,
  content         TEXT NOT NULL,
  view_token_hash TEXT NOT NULL,
  updated_at      BIGINT NOT NULL,
  editable        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.sync_state (
  id          TEXT PRIMARY KEY,
  content     TEXT NOT NULL,
  revision    BIGINT NOT NULL DEFAULT 0,
  updated_at  BIGINT NOT NULL,
  marks       TEXT NOT NULL DEFAULT '{}',
  last_commit TEXT NOT NULL DEFAULT ''
);

CREATE TABLE public.sync_versions (
  revision   BIGINT PRIMARY KEY,
  content    TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE public.sync_devices (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.sync_pairings (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL,
  consumed   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.sync_receipts (
  id         TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  revision   BIGINT NOT NULL
);

CREATE TABLE public.sync_changes (
  id       TEXT PRIMARY KEY,
  revision BIGINT NOT NULL,
  actor    TEXT NOT NULL,
  source   TEXT NOT NULL,
  "at"     BIGINT NOT NULL,
  changes  TEXT NOT NULL
);

-- 仅授权 service_role（服务端 API Key），不授权 anon/authenticated，
-- 避免公网匿名读写业务数据。客户端一律经云函数访问，不直连数据库。
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.shared_plans, public.sync_state, public.sync_versions,
     public.sync_devices, public.sync_pairings, public.sync_receipts,
     public.sync_changes
  TO service_role;
