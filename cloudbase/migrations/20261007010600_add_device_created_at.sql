-- Focus Matrix 云端 PostgreSQL 增量迁移
-- 为设备表补 created_at，用于按绑定时间排序展示设备列表。

ALTER TABLE public.sync_devices
  ADD COLUMN created_at BIGINT NOT NULL DEFAULT 0;
