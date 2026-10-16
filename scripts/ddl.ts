/**
 * 建表脚本（PGlite / PostgreSQL 通用 DDL）
 *
 * 运行：npm run db:init
 * 等价于 prisma migrate，但走 PGlite 直连 SQL，
 * 好处是能精确控制部分唯一索引、CHECK 约束等 Prisma 表达不了的约束。
 */

export const DDL = `
-- ==========================================================================
-- 1. 组织与权限
-- ==========================================================================

CREATE TABLE IF NOT EXISTS "Dept" (
  "id"        TEXT PRIMARY KEY,
  "code"      TEXT NOT NULL UNIQUE,
  "name"      TEXT NOT NULL,
  "path"      TEXT NOT NULL DEFAULT '/',
  "parentId"  TEXT,
  "leaderId"  TEXT,
  "sortNo"    INTEGER NOT NULL DEFAULT 0,
  "status"    TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_dept_parent" ON "Dept" ("parentId", "sortNo");
CREATE INDEX IF NOT EXISTS "idx_dept_path"   ON "Dept" ("path");

CREATE TABLE IF NOT EXISTS "User" (
  "id"            TEXT PRIMARY KEY,
  "employeeNo"    TEXT NOT NULL UNIQUE,
  "name"          TEXT NOT NULL,
  "phone"         TEXT,
  "deptId"        TEXT NOT NULL REFERENCES "Dept"("id"),
  "role"          TEXT NOT NULL CHECK ("role" IN ('SUPER_ADMIN','SALES_MANAGER','SALES')),
  "status"        TEXT NOT NULL DEFAULT 'ACTIVE',
  "passwordHash"  TEXT NOT NULL,
  "mustChangePwd" BOOLEAN NOT NULL DEFAULT TRUE,
  "failCount"     INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"   TIMESTAMPTZ,
  "lastLoginAt"   TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_user_dept" ON "User" ("deptId","role","status");

CREATE TABLE IF NOT EXISTS "RolePerm" (
  "id"        TEXT PRIMARY KEY,
  "role"      TEXT NOT NULL,
  "permKey"   TEXT NOT NULL,
  "allowed"   BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("role","permKey")
);

CREATE TABLE IF NOT EXISTS "SystemConfig" (
  "id"        TEXT PRIMARY KEY,
  "key"       TEXT NOT NULL UNIQUE,
  "value"     TEXT NOT NULL,
  "scope"     TEXT NOT NULL DEFAULT 'ALL',
  "desc"      TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================================================
-- 2. 业务主表
-- ==========================================================================

CREATE TABLE IF NOT EXISTS "Course" (
  "id"            TEXT PRIMARY KEY,
  "code"          TEXT NOT NULL UNIQUE,
  "name"          TEXT NOT NULL,
  "category"      TEXT NOT NULL,
  "mode"          TEXT NOT NULL,
  "price"         DOUBLE PRECISION NOT NULL CHECK ("price" > 0),
  "cost"          DOUBLE PRECISION,
  "status"        TEXT NOT NULL DEFAULT 'OFF',
  "consultantIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "description"   TEXT,
  "startDate"     TIMESTAMPTZ,
  "coverIndex"    INTEGER NOT NULL DEFAULT 0,
  "version"       INTEGER NOT NULL DEFAULT 0,
  "isDeleted"     BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Channel" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL UNIQUE,
  "type"      TEXT NOT NULL,
  "cost"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ownerId"   TEXT,
  "status"    TEXT NOT NULL DEFAULT 'ACTIVE',
  "remark"    TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Lead" (
  "id"              TEXT PRIMARY KEY,
  "code"            TEXT NOT NULL UNIQUE,
  "name"            TEXT NOT NULL,
  "phone"           TEXT NOT NULL,
  "gender"          TEXT,
  "sourceChannelId" TEXT REFERENCES "Channel"("id"),
  "intentCourseId"  TEXT REFERENCES "Course"("id"),
  "status"          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK ("status" IN ('PENDING','FOLLOWING','PSEUDO','TO_POOL','CONVERTED')),
  "remark"          TEXT,

  "ownerId" TEXT,
  "deptId"  TEXT,

  "followCount"   INTEGER NOT NULL DEFAULT 0,
  "lastFollowAt"  TIMESTAMPTZ,
  "nextFollowAt"  TIMESTAMPTZ,
  "claimedAt"     TIMESTAMPTZ,

  "convertedAt"     TIMESTAMPTZ,
  "convertedOppId"  TEXT UNIQUE,
  "conversionDays"  INTEGER,

  "version"   INTEGER NOT NULL DEFAULT 0,
  "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 顾问默认视图 / 主管视图 / 待办扫描
CREATE INDEX IF NOT EXISTS "idx_lead_owner_status" ON "Lead" ("ownerId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_lead_dept_status"  ON "Lead" ("deptId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_lead_next_follow"   ON "Lead" ("status","nextFollowAt");
CREATE INDEX IF NOT EXISTS "idx_lead_claimed"       ON "Lead" ("status","claimedAt");
CREATE INDEX IF NOT EXISTS "idx_lead_channel"       ON "Lead" ("sourceChannelId");

-- ★ 地基决策 1：手机号部分唯一索引
-- 同时满足：BR-L01 手机号唯一 / BR-L03 仅一条有效线索 / 已存在伪线索时允许重录
-- 注意：列名必须与建表语句完全一致（PostgreSQL 区分大小写，双引号标识符不会自动转小写）
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_lead_phone_active"
  ON "Lead" ("phone")
  WHERE "status" NOT IN ('PSEUDO','CONVERTED') AND "isDeleted" = FALSE;

CREATE TABLE IF NOT EXISTS "Opportunity" (
  "id"        TEXT PRIMARY KEY,
  "code"      TEXT NOT NULL UNIQUE,
  "name"      TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "phone"     TEXT NOT NULL,
  "courseId"  TEXT REFERENCES "Course"("id"),

  "amount"            DOUBLE PRECISION NOT NULL CHECK ("amount" > 0),
  "expectedCloseDate" TIMESTAMPTZ,

  "stage"          TEXT NOT NULL DEFAULT 'FOLLOWING'
                   CHECK ("stage" IN ('FOLLOWING','NEGOTIATING','WON','LOST')),
  "stageEnteredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  "ownerId" TEXT,
  "deptId"  TEXT,

  "sourceChannelId" TEXT REFERENCES "Channel"("id"),
  "sourceLeadId"    TEXT REFERENCES "Lead"("id"),

  "description" TEXT,
  "nextAction"  TEXT,
  "nextFollowAt" TIMESTAMPTZ,

  "wonAt"      TIMESTAMPTZ,
  "wonAmount"  DOUBLE PRECISION,
  "wonDate"    TIMESTAMPTZ,
  "lostReason" TEXT,
  "lostRemark" TEXT,

  "claimedAt"  TIMESTAMPTZ,
  "version"    INTEGER NOT NULL DEFAULT 0,
  "isDeleted"  BOOLEAN NOT NULL DEFAULT FALSE,
  "deletedAt"  TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "fk_opp_lead" FOREIGN KEY ("sourceLeadId") REFERENCES "Lead"("id")
);

CREATE INDEX IF NOT EXISTS "idx_opp_owner_stage" ON "Opportunity" ("ownerId","stage");
CREATE INDEX IF NOT EXISTS "idx_opp_dept_stage"  ON "Opportunity" ("deptId","stage");
CREATE INDEX IF NOT EXISTS "idx_opp_close_date"   ON "Opportunity" ("expectedCloseDate");
CREATE INDEX IF NOT EXISTS "idx_opp_stage_time"   ON "Opportunity" ("stageEnteredAt");
CREATE INDEX IF NOT EXISTS "idx_opp_source_lead"  ON "Opportunity" ("sourceLeadId");

CREATE TABLE IF NOT EXISTS "Customer" (
  "id"    TEXT PRIMARY KEY,
  "code"  TEXT NOT NULL UNIQUE,
  "name"  TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "gender" TEXT,

  "courseId" TEXT REFERENCES "Course"("id"),
  "amount"   DOUBLE PRECISION NOT NULL,
  "dealDate" TIMESTAMPTZ NOT NULL,

  "status" TEXT NOT NULL DEFAULT 'ACTIVE'
           CHECK ("status" IN ('ACTIVE','PAUSED','COMPLETED','REFUNDED','LOST')),

  "ownerId" TEXT,
  "deptId"  TEXT,

  "sourceChannelId" TEXT REFERENCES "Channel"("id"),
  "sourceOppId"     TEXT UNIQUE,

  "serviceStartDate"  TIMESTAMPTZ,
  "serviceExpireDate" TIMESTAMPTZ,
  "archivedAt"        TIMESTAMPTZ,

  "version"   INTEGER NOT NULL DEFAULT 0,
  "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_cust_owner_status" ON "Customer" ("ownerId","status");
CREATE INDEX IF NOT EXISTS "idx_cust_dept_status"  ON "Customer" ("deptId","status");
CREATE INDEX IF NOT EXISTS "idx_cust_expire"       ON "Customer" ("serviceExpireDate");
CREATE INDEX IF NOT EXISTS "idx_cust_phone_name"   ON "Customer" ("phone","name");

CREATE TABLE IF NOT EXISTS "Activity" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "startAt"       TIMESTAMPTZ NOT NULL,
  "endAt"         TIMESTAMPTZ,
  "location"      TEXT,
  "capacity"      INTEGER NOT NULL DEFAULT 0,
  "enrolledCount" INTEGER NOT NULL DEFAULT 0,
  "courseId"      TEXT REFERENCES "Course"("id"),
  "channelIds"    JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status"        TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "isDeleted"     BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_activity_status" ON "Activity" ("status","startAt");

-- ==========================================================================
-- 3. 过程记录表（全部仅追加，不可编辑不可删除）
-- ==========================================================================

CREATE TABLE IF NOT EXISTS "FollowUp" (
  "id"            TEXT PRIMARY KEY,
  "bizType"       TEXT NOT NULL,
  "bizId"         TEXT NOT NULL,
  "method"        TEXT NOT NULL,
  "result"        TEXT,
  "content"       TEXT NOT NULL,
  "nextPlan"      TEXT,
  "nextFollowAt"  TIMESTAMPTZ,
  "createdById"   TEXT REFERENCES "User"("id"),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_fu_biz"   ON "FollowUp" ("bizType","bizId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_fu_creator" ON "FollowUp" ("createdById");
CREATE INDEX IF NOT EXISTS "idx_fu_next"  ON "FollowUp" ("nextFollowAt");

CREATE TABLE IF NOT EXISTS "ServiceRecord" (
  "id"          TEXT PRIMARY KEY,
  "customerId"  TEXT NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE,
  "type"        TEXT NOT NULL,
  "serviceDate" TIMESTAMPTZ NOT NULL,
  "duration"    INTEGER,
  "staffId"     TEXT,
  "content"     TEXT NOT NULL,
  "rating"      INTEGER CHECK ("rating" BETWEEN 1 AND 5),
  "abnormal"    BOOLEAN NOT NULL DEFAULT FALSE,
  "createdById" TEXT REFERENCES "User"("id"),
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_svc_customer" ON "ServiceRecord" ("customerId","serviceDate" DESC);

-- ★ 地基决策 2：状态变更日志是看板统计的唯一依据
-- BR-D04：转化以状态跃迁时间为准，非数据创建时间
-- 11 类流转动作每一步都要写，漏一处看板就错一处
CREATE TABLE IF NOT EXISTS "StatusChangeLog" (
  "id"          TEXT PRIMARY KEY,
  "bizType"     TEXT NOT NULL,
  "bizId"       TEXT NOT NULL,
  "fromStatus"  TEXT,
  "toStatus"    TEXT NOT NULL,
  "action"      TEXT NOT NULL,
  "remark"      TEXT,
  "changedById" TEXT REFERENCES "User"("id"),
  "changedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_scl_biz"  ON "StatusChangeLog" ("bizType","bizId","changedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_scl_time" ON "StatusChangeLog" ("changedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_scl_stat" ON "StatusChangeLog" ("bizType","toStatus","changedAt" DESC);

CREATE TABLE IF NOT EXISTS "OwnershipHistory" (
  "id"          TEXT PRIMARY KEY,
  "bizType"     TEXT NOT NULL,
  "bizId"       TEXT NOT NULL,
  "fromOwnerId" TEXT,
  "toOwnerId"   TEXT,
  "action"      TEXT NOT NULL,
  "reason"      TEXT,
  "remark"      TEXT,
  "changedById" TEXT REFERENCES "User"("id"),
  "changedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_own_biz" ON "OwnershipHistory" ("bizType","bizId","changedAt" DESC);

CREATE TABLE IF NOT EXISTS "AmountHistory" (
  "id"          TEXT PRIMARY KEY,
  "oppId"       TEXT NOT NULL REFERENCES "Opportunity"("id") ON DELETE CASCADE,
  "fromAmount"  DOUBLE PRECISION,
  "toAmount"    DOUBLE PRECISION NOT NULL,
  "reason"      TEXT,
  "changedById" TEXT REFERENCES "User"("id"),
  "changedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_amt_opp" ON "AmountHistory" ("oppId","changedAt" DESC);

CREATE TABLE IF NOT EXISTS "PriceHistory" (
  "id"          TEXT PRIMARY KEY,
  "courseId"    TEXT NOT NULL REFERENCES "Course"("id") ON DELETE CASCADE,
  "fromPrice"   DOUBLE PRECISION,
  "toPrice"     DOUBLE PRECISION NOT NULL,
  "reason"      TEXT,
  "changedById" TEXT REFERENCES "User"("id"),
  "changedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_price_course" ON "PriceHistory" ("courseId","changedAt" DESC);

-- 操作日志：不可删改，仅追加
CREATE TABLE IF NOT EXISTS "OperationLog" (
  "id"             TEXT PRIMARY KEY,
  "operatorId"     TEXT,
  "operatorDeptId" TEXT,
  "operatorName"   TEXT NOT NULL,
  "action"         TEXT NOT NULL,
  "targetType"     TEXT,
  "targetId"       TEXT,
  "summary"        TEXT,
  "before"         JSONB,
  "after"          JSONB,
  "ip"             TEXT,
  "ua"             TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_olog_time"     ON "OperationLog" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_olog_operator" ON "OperationLog" ("operatorId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_olog_target"   ON "OperationLog" ("targetType","targetId");
CREATE INDEX IF NOT EXISTS "idx_olog_action"   ON "OperationLog" ("action","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "Attachment" (
  "id"            TEXT PRIMARY KEY,
  "bizType"       TEXT NOT NULL,
  "bizId"         TEXT NOT NULL,
  "filename"      TEXT NOT NULL,
  "size"          INTEGER NOT NULL,
  "mime"          TEXT NOT NULL,
  "url"           TEXT NOT NULL,
  "leadId"        TEXT REFERENCES "Lead"("id"),
  "followUpId"    TEXT REFERENCES "FollowUp"("id"),
  "opportunityId" TEXT REFERENCES "Opportunity"("id"),
  "customerId"    TEXT REFERENCES "Customer"("id"),
  "uploadedById"  TEXT REFERENCES "User"("id"),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_attach_biz" ON "Attachment" ("bizType","bizId");

CREATE TABLE IF NOT EXISTS "Todo" (
  "id"        TEXT PRIMARY KEY,
  "bizType"   TEXT NOT NULL,
  "bizId"     TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "dueAt"     TIMESTAMPTZ NOT NULL,
  "doneAt"    TIMESTAMPTZ,
  "ownerId"   TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_todo_owner" ON "Todo" ("ownerId","doneAt","dueAt");

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT,
  "link"      TEXT,
  "readAt"    TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_notify_user" ON "Notification" ("userId","readAt","createdAt" DESC);

-- ==========================================================================
-- 4. 反向关联补约束
-- ==========================================================================

ALTER TABLE "Lead"
  DROP CONSTRAINT IF EXISTS "fk_lead_converted_opp";
ALTER TABLE "Lead"
  ADD CONSTRAINT "fk_lead_converted_opp"
  FOREIGN KEY ("convertedOppId") REFERENCES "Opportunity"("id");

ALTER TABLE "Customer"
  DROP CONSTRAINT IF EXISTS "fk_cust_source_opp";
ALTER TABLE "Customer"
  ADD CONSTRAINT "fk_cust_source_opp"
  FOREIGN KEY ("sourceOppId") REFERENCES "Opportunity"("id");

-- ==========================================================================
-- 5. 演示数据清空顺序（供 db:reset 使用）
-- ==========================================================================
`;