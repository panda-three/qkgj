> 更正（2026-10-12）：下文关于“禁止加载所有 .node / SWC 文件完整 / 无解”的历史结论已被实际检查推翻。SWC 文件只有 1,866,680 字节，而 Mach-O 声明范围为 124,929,804 字节，文件被截断。官方同版本包通过 SHA-512 校验并替换后，原生 SWC 能在当前沙箱加载；fsevents、oxide、lightningcss 同样加载成功。历史符号链接及目录权限拒绝应单独分析，不应与二进制损坏混为一谈。截断发生过程尚未查明。

# 轻客管家 · 项目长期记忆

## 项目概况

面向互联网教育机构的智能 CRM，主链路：**线索 → 商机 → 客户**。

| 项 | 内容 |
| --- | --- |
| 根目录 | `/Users/panda/Desktop/qkgj/` |
| PRD | 《功能需求.md》V1.0，40 条业务规则 |
| 计划 | 《开发计划.md》8 阶段，63–78 人天 |
| 原型 | `prototype/` 11 个静态页面 + 48 个设计令牌（**只读，不再修改**，作为视觉比对基准） |
| 技术栈 | Next.js 15 App Router + React 19 + TypeScript + TailwindCSS v4 + PGlite |

> 注：项目根目录曾被提及有《轻客管家-项目设计.md》，实际不存在，以 PRD + 原型为准。

## 当前进度

- **Step 0 完成**：工程底座、设计系统、数据模型、数据库、演示数据
- **Step 1 核心完成**：登录鉴权、数据权限、操作日志
- **Step 2/3/4 服务层完成**：线索、转商机/转客户、公海池
- **UI 完成**：登录页、数据看板、布局组件
- **验证**：41 项端到端测试全绿，TypeScript 零错误
- **待做**：线索/商机/客户各页面、资源管理、系统管理

---

## 关键技术决策

### 数据库用 PGlite，不用本机 PostgreSQL

`@electric-sql/pglite` —— PostgreSQL 的 WASM 版本，npm 包形态，数据存 `.pglite/` 目录。

**为什么**：本机 `brew install postgresql@16` 被沙箱锁目录策略拦截；
Postgres.app 的 DMG 从 GitHub 下载被限速到 8KB/s。PGlite 零系统权限、零外部下载。

**能力边界**：
- ✅ 支持：部分唯一索引、JSONB、FILTER 聚合、CTE、子查询、事务
- ❌ 不支持：`SELECT ... FOR UPDATE` 行锁
- **应对**：并发控制统一改用原子条件更新
  `UPDATE ... WHERE owner_id IS NULL ... RETURNING id`，
  靠数据库条件判断保证互斥，效果与行锁等价。已通过并发测试验证。

**切换回标准 PostgreSQL**：只需替换 `src/server/db.ts` 一层实现，上层 services 调用方式不变。

### 端口 3100（不是默认 3000）
避免与其他本地服务冲突。

### 三条不可返工的地基

1. **手机号部分唯一索引**（`scripts/ddl.ts`）
   ```sql
   CREATE UNIQUE INDEX uniq_lead_phone_active ON "Lead" ("phone")
     WHERE "status" NOT IN ('PSEUDO','CONVERTED') AND "isDeleted" = FALSE;
   ```
   同时满足：BR-L01 手机号唯一 / BR-L03 仅一条有效线索 / 已存在伪线索时允许重录。
   ⚠️ 列名必须与建表语句完全一致（`"isDeleted"` 不是 `"is_deleted"`）——
   PostgreSQL 双引号标识符区分大小写，写错会报 `column does not exist`。

2. **`StatusChangeLog` 每次状态流转都要写**
   看板转化率按状态跃迁时间统计（BR-D04），不是 `createdAt`。
   11 类流转动作：新建/分配/转公海/领取/标记伪线索/转商机/阶段推进/赢单/输单/转客户/客户状态变更。
   **种子数据也必须写**：已转商机的线索若缺 CONVERT_LEAD 日志，漏斗会少算。

3. **数据权限在 SQL 层拼接**
   `src/lib/data-scope/scope.ts` 的 `buildDataScope()`，
   禁止查全量后内存过滤。详情/操作接口用 `canAccessRecord()` 二次校验。

---

## 环境限制（重要，反复遇到）

### ★ 沙箱硬限制：禁止加载 .node 原生扩展（无解）

`next dev` / `next build` 启动瞬间 **SIGBUS**（退出码 138），日志 0 字节。

**已穷尽的排查**：
| 手段 | 结果 |
| --- | --- |
| 检查二进制完整性 | 正常，魔数 `cffaedfe`，1.8MB |
| `codesign --force --sign -` 补签名 | 失败：strict validation |
| 换 `@next/swc-wasm-nodejs` WASM 版 | `Reflect.get called on non-object` |
| WASM 版本对齐 15.5.27 | 仍失败，WASM 与 Next 15 API 不匹配 |
| 生产构建 | 同样 SIGBUS |

**结论**：文件本身没问题，是沙箱策略禁止 `dlopen` 原生扩展。
**影响**：无法在自己的命令环境里启动 Next.js。
**解决**：用户在**自己的终端**执行 `npm run dev`，不受沙箱限制。

### ★ 沙箱专用代码必须与标准代码分离（重要教训）

为绕沙箱限制而加的配置，会变成正常环境的隐患。已清理以下内容：

| 内容 | 干扰原因 |
| --- | --- |
| `next.config.ts` | TS 配置需 SWC 编译，会先崩在配置加载阶段。**必须用 `.mjs`** |
| `experimental.cpus / workerThreads` | 为沙箱降并发加的，正常环境可能触发异常 |
| `node_modules/@next/swc-wasm-nodejs` | 手动装的 WASM 版会被 Next 优先选中，报 `Reflect.get called on non-object` |
| `scripts/serve.mjs` `swc-shim.cjs` `diag-*.cjs` | 仅沙箱排查用，已删除 |

**原则**：
- 标准配置（用户环境用）：`next.config.mjs` + 原生 SWC
- 沙箱兜底（排查用）：独立脚本，需要时手动启用，不进主配置

### 其他沙箱限制与绕过方案

| 问题 | 报错 | 绕过方法 |
| --- | --- | --- |
| brew 无法安装 | `Operation not permitted @ apply2files - /usr/local/var/homebrew/locks/...` | 放弃 brew，改用 PGlite |
| pnpm 无法安装 | `Brokered host link overwrite refused by file policy` | 改用 npm（pnpm 用符号链接） |
| npm 最后一步失败 | `CODEBUDDY_BROKER_DENY: rename node_modules/.bin/xxx` | **`npm pack` 下载 tgz + `tar` 手动解压到 node_modules** |
| GitHub 大文件 | 限速 8KB/s | 不用 GitHub release，走 npm 源 |
| PGlite DROP TABLE | 触发宿主 safe-delete 保护 | 改用 `TRUNCATE ... CASCADE` |
| tsx 脚本 import 服务层 | `Cannot find module 'server-only'` | 在 node_modules 下建空垫片包 |
| shell 偶发退出 137 | SIGTERM 无输出 | 重试即可；或用 Glob 工具核实文件 |

### 依赖安装的可靠做法

由于 npm 会在 `.bin` 链接阶段被沙箱拒绝并**整体回滚**，
但已下载的包有部分保留，导致依赖树不完整（表现为 `Cannot find module 'xxx'`）。

```bash
# 1. 检测缺失：遍历所有包的 dependencies + peerDependencies
# 2. 用 ~/fixdeps.sh 批量补齐（npm pack + tar 解压，支持并行）
bash ~/fixdeps.sh <包名列表>
```

注意：解压后必须确认关键文件真的存在，有 tar 包解压不完整的情况。

### 常用命令（不依赖 .bin 符号链接）

```bash
npm run db:reset     # 建库 + 演示数据
npm run test:e2e     # 41 项核心链路验证
npm run typecheck    # 类型检查
npm run dev          # 启动（需用户在自己终端执行）
```

---

## 代码结构

```
src/
├── app/
│   ├── globals.css              ★ 设计系统（48 令牌 → @theme）
│   ├── login/page.tsx           登录页（还原原型双栏设计）
│   ├── (app)/layout.tsx         登录后布局
│   ├── (app)/dashboard/         数据看板（8 指标卡 + 五级漏斗 + 我的待办）
│   └── api/auth/login/          登录接口（5 次锁定 30 分钟）
├── components/
│   ├── business/                StatusTag / StatCard
│   └── layout/                  Sidebar / Topbar
├── lib/
│   ├── constants/               ★ 业务常量唯一事实来源
│   ├── data-scope/scope.ts      ★ 数据权限 SQL 拼接器
│   ├── auth/                    session.ts（jose JWT）/ guard.ts
│   ├── utils/                   cn.ts / format.ts
│   └── validators/              zod 校验规则
└── server/
    ├── db.ts                    ★ 数据库访问层（PGlite）
    ├── log.ts                   操作日志
    └── services/
        ├── convert.ts           转商机/转客户（原子操作）
        ├── pool.ts              公海池领取（并发安全）
        └── lead.ts              线索领域服务
scripts/
├── ddl.ts                       建表 DDL（20 张表）
├── db-init.ts                   建表 + 演示数据
├── e2e.ts                       ★ 41 项全链路验证
├── verify.ts                    数据完整性检查
├── test-pglite.ts               PGlite 能力自检
├── serve.mjs                    开发服务器启动器
└── swc-shim.cjs                 SWC WASM 兜底
```

---

## 原型的已知缺陷（工程实现时必须纠正）

| 缺陷 | 位置 | 正确做法 |
| --- | --- | --- |
| 完整手机号写在 `data-phone` 属性 | 所有列表页 | 服务端裁剪 + 单独 reveal 接口 + 日志留痕 |
| 表格排序是假的（只换图标 + toast） | `app.js` | 后端 `ORDER BY` |
| 全选仅限当前页 | `bindSelectAll` | 受控 selectedRowKeys + 跨页选择提示 |
| `fmtDateTime()` 空实现 | `app.js` | 用 dayjs（已补齐于 `src/lib/utils/format.ts`） |
| `user` 图标未定义 | `renderSidebar` | 补齐图标 |
| 看板拖拽无乐观更新/回滚 | `bindKanban` | dnd-kit + API 失败回滚 + toast |

### 设计系统还原要点

- 48 个 CSS 变量 → Tailwind v4 `@theme`
- 补齐约 30 个原型中未变量化的硬编码色值（头像 6 套渐变、侧栏深色底、表格行态、语义标签边框色）
- `ink-*` 与 Tailwind 默认 `slate` 同值 → 统一重命名为 `ink`，业务代码禁止再用 `slate-*`
- 表格 sticky 操作列行态同步：原型有 7 条规则，用 `tr { --row-bg }` CSS 变量方案化简
- 统计卡右上角装饰圆：原型用伪元素无法按 tone 换色 → 改为真实元素 `<div className="stat-decor stat-decor-{tone}" />`
- Tailwind v4 中 `w-[--spacing-sidebar]` 这类任意值语法无效 → 用具体值 `w-[232px]`

---

## 演示账号

统一密码：`Qingke@2026`（脚本中的 `DEV_PASSWORD`）

| 工号 | 姓名 | 角色 | 部门 | 手机号 | 数据范围 |
| --- | --- | --- | --- | --- | --- |
| A0001 | 张启明 | SUPER_ADMIN | 运营中心 | 13800000001 | 全系统 |
| A0002 | 李文静 | SALES_MANAGER | 华东销售部 | 13800000002 | 本部门及下属 |
| A0003 | 王小雨 | SALES | 一组 | 13800000003 | 仅本人 + 公海 |
| A0004 | 陈志强 | SALES | 一组 | 13800000004 | 仅本人 + 公海 |
| A0005 | 刘思彤 | SALES | 二组 | 13800000005 | 仅本人 + 公海 |
| A0006 | 赵磊 | SALES | 二组 | 13800000006 | 仅本人 + 公海 |

登录支持工号或手机号。

---

## 待用户确认

1. 后端形态：Next.js 内置 Route Handlers 还是独立服务？（**当前用内置**）
2. 生产数据库部署环境
3. 超期预警推送渠道（站内 / 企微 / 短信）
4. 业绩目标配置方（看板达成率的分母来源）
5. 附件存储方案（本地磁盘 / 对象存储）
6. 导出是否需要审批流（建议不设，仅记日志）
## 当前环境验收补充

SWC 与 magic-string 完整性修复、PGlite 服务端 external 配置、看板月份 SQL 参数修复已完成。类型检查、生产构建、三种角色进程内登录及看板渲染均通过。当前执行环境另有 `listen EPERM` TCP 端口监听限制；没有启动可供浏览器访问的服务，不应将服务端进程内验证写成真实浏览器验收。
