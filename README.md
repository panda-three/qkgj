# 轻客管家 · 智能 CRM

> 面向互联网教育机构的智能 CRM。以「线索 → 商机 → 客户」为主线，
> 覆盖公海池、部门权限体系与课程资源管理。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 15（App Router）+ React 19 + TypeScript |
| 样式 | TailwindCSS v4（设计令牌见 `src/app/globals.css`） |
| 数据库 | PGlite（PostgreSQL 的 WASM 版本） |
| 鉴权 | jose（JWT + HttpOnly Cookie） |

## 快速开始

```bash
npm install                  # 首次需要，依赖已装好可跳过
npm run db:reset             # 建表 + 写入演示数据
npm run dev                  # 启动，访问 http://localhost:3100
```

### 常用命令

```bash
npm run dev          # 开发服务器（端口 3100）
npm run typecheck    # TypeScript 类型检查
npm run db:reset     # 重置数据库并写入演示数据
npm run db:verify    # 数据完整性检查
npm run test:e2e     # 41 项核心链路验证
npm run test:pglite  # 数据库能力自检
```

> **说明**：脚本全部走 `node node_modules/<pkg>/...` 的完整路径，
> 不依赖 `node_modules/.bin` 符号链接，在受限环境下也能执行。

## 演示账号

统一密码：`Qingke@2026`

| 工号 | 姓名 | 角色 | 数据范围 |
| --- | --- | --- | --- |
| A0001 | 张启明 | 超级管理员 | 全系统 |
| A0002 | 李文静 | 销售主管 | 本部门及下属 |
| A0003 | 王小雨 | 销售顾问 | 仅本人 + 公海 |
| A0004 | 陈志强 | 销售顾问 | 仅本人 + 公海 |
| A0005 | 刘思彤 | 销售顾问 | 仅本人 + 公海 |

登录支持工号或手机号。登录页左侧有角色卡片，点击可直接切换。

## 目录结构

```
src/
├── app/
│   ├── globals.css              ★ 设计系统（48 令牌 → @theme）
│   ├── login/page.tsx           登录页（还原原型双栏设计）
│   ├── (app)/layout.tsx         登录后布局
│   ├── (app)/dashboard/         数据看板（8 指标卡 + 五级漏斗）
│   └── api/auth/login/          登录接口（5 次锁定 30 分钟）
├── components/
│   ├── business/                StatusTag / StatCard
│   └── layout/                  Sidebar / Topbar
├── lib/
│   ├── constants/               ★ 业务常量唯一事实来源
│   ├── data-scope/scope.ts      ★ 数据权限 SQL 拼接
│   ├── auth/                    session（JWT）/ guard（权限）
│   ├── utils/                   cn / format
│   └── validators/              zod 校验规则
└── server/
    ├── db.ts                    ★ 数据库访问层
    ├── log.ts                   操作日志
    └── services/
        ├── convert.ts           转商机/转客户（原子操作）
        ├── pool.ts              公海池领取（并发安全）
        └── lead.ts              线索领域服务

scripts/
├── ddl.ts                       建表 DDL（20 张表）
├── db-init.ts                   建表 + 演示数据
├── e2e.ts                       ★ 41 项全链路验证
├── test-pglite.ts               数据库能力自检
└── verify.ts                    数据完整性检查

prototype/                       静态原型，视觉比对基准，不再修改
```

## 三条不可返工的地基决策

### 1. 数据库用 PGlite

`@electric-sql/pglite` 是 PostgreSQL 的 WASM 版本，以 npm 包形态运行，
数据存 `.pglite/` 目录。

**优势**：零系统安装、零外部下载、零权限要求，完整支持 PostgreSQL 语法。

**唯一限制**：不支持 `SELECT ... FOR UPDATE` 行锁。
**应对**：并发控制统一改用原子条件更新，效果与行锁等价：

```sql
UPDATE "Lead" SET owner_id = $1, status = 'FOLLOWING'
 WHERE id = $2 AND owner_id IS NULL AND status = 'TO_POOL'
RETURNING id
```

影响行数为 0 即说明已被他人领取。已通过并发测试验证。

切换回标准 PostgreSQL 时，只需替换 `src/server/db.ts` 一层实现。

### 2. 手机号部分唯一索引

```sql
CREATE UNIQUE INDEX uniq_lead_phone_active ON "Lead" ("phone")
  WHERE "status" NOT IN ('PSEUDO','CONVERTED') AND "isDeleted" = FALSE;
```

一条索引同时满足三个要求：手机号唯一、仅一条有效线索、伪线索后可重录。

⚠️ 列名必须与建表语句完全一致（`"isDeleted"` 不是 `"is_deleted"`），
PostgreSQL 双引号标识符区分大小写。

### 3. StatusChangeLog 每次流转都要写

看板转化率按状态跃迁时间统计（BR-D04），不是数据创建时间。
11 类流转动作每一步都必须写，漏一处看板就错一处——包括种子数据。

## 数据权限模型

可见数据 = (归属人 == 当前用户) OR (部门 ∈ 用户可见部门集合) OR (状态 == 公海)

| 角色 | 可见范围 |
| --- | --- |
| 超级管理员 | 全系统 |
| 销售主管 | 本部门 + 所有子孙部门 + 本人 + 公海 |
| 销售顾问 | 仅本人 + 公海 |

部门树用物化路径（`Dept.path`）实现，避免递归查询。
权限条件在 SQL 层拼接（`buildDataScope()`），禁止查全量后内存过滤；
详情接口用 `canAccessRecord()` 二次校验，防直接输入 ID 越权。

## 相关文档

- 《功能需求.md》—— PRD V1.0，40 条业务规则
- 《开发计划.md》—— 8 阶段开发计划
- 《启动指南.md》—— 环境说明与沙箱限制的排查记录
- `.workbuddy/memory/` —— 开发过程记录与踩坑笔记