# 004 迁移：执行步骤与检查（2026-10-22）

文件：
- `004_owner_rls_revoke_anon.sql` — 迁移本体（已包含 002 + 003，可重复执行）
- `004_owner_rls_revoke_anon_rollback.sql` — 紧急回滚（只恢复"已登录用户可访问"，anon 仍然关闭）
- `004_probe.sh` — 生产环境只读检查（只打印 HTTP 状态码和行数，不打印密钥/内容）
- `004_rls_simulation.mjs` — 本地 PGlite 模拟（Supabase 角色 + `auth.uid()`），59 项全部通过

## 迁移做了什么
1. 五张表 `dishes / selected_menu / menu_history / settings / menus_cerrados` 都加 `owner_id`
   （`menus_cerrados` 原来没有），把现有行全部归属给 `soyyjm@gmail.com`，然后设为 NOT NULL。
2. `owner_id` 默认 `auth.uid()`，并加 BEFORE INSERT 触发器：前端插入时没带或带 `null`
   的 `owner_id`（`menus_cerrados` 新建/恢复备份就是这样）会自动填当前登录用户。
3. 删除这五张表上的所有旧策略（包括 001 的 `FOR ALL to anon using(true)`），
   只建 `owner_id = auth.uid()` 的 authenticated 策略。
4. `revoke all` 公共 schema 所有表和序列的 anon 权限，并改默认权限，以后新建的表也不给 anon。
5. `settings.gemini_api_key` 先置空再删除列。

## 执行前（用户操作）
1. 在 Google AI Studio **吊销** 曾存放在 `settings.gemini_api_key` 的那把 key（它已经被 anon 读到过）。
2. 用 `soyyjm@gmail.com` 至少登录过一次 app（迁移找不到这个账号会直接报错并整体回滚，不会改任何东西）。
3. 建议先在 Supabase Dashboard → Database → Backups 确认有当天备份。

## 执行
Supabase Dashboard → SQL Editor → 粘贴 `004_owner_rls_revoke_anon.sql` → Run。
整个脚本在一个事务里，任何一步失败都会全部回滚。

## 执行后检查
SQL Editor：
```sql
select tablename, policyname, roles, cmd from pg_policies
where schemaname = 'public' order by tablename;              -- 只应看到 *_owner_isolation，roles = {authenticated}

select table_name, privilege_type from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';          -- 应为空

select count(*) filter (where owner_id is null) from public.dishes;          -- 0
select column_name from information_schema.columns
where table_name = 'settings' and column_name = 'gemini_api_key';            -- 空
```
终端（只读）：
```bash
bash supabase/004_probe.sh --owner
```
期望：anon 对每张表 401/403；no-match DELETE 401/403（执行前是 204）；owner 能读到 dishes≈635、menus_cerrados≈23。

App 手动检查（登录后）：加载菜品/今日菜单/历史/设置；改一道菜保存；新建一个 menú cerrado 并保存、再删除；
刷新后数据还在。未登录时 app 读不到云端数据（预期）。

## 关闭注册（用户在 Dashboard 操作）
Supabase Dashboard → Authentication → Sign In / Providers（旧版叫 Settings）→
关闭 **Allow new users to sign up**（"允许新用户注册"）→ Save。
之后 `004_probe.sh` 应显示 `"disable_signup":true`。已有账号照常登录。
如果有不认识的账号：Authentication → Users 查看并删除。另外建议在 Netlify 设置 `GEMINI_ALLOWED_EMAILS`。

## 已知影响
- `import-menus.html` 用 anon key 直接 insert `menus_cerrados`，迁移后会失败（一次性导入工具；以后要用需加登录）。
- `settings` / `selected_menu` 仍是 `id = 1` 单例、`menu_history.date` 全局唯一：只支持一个店主账号，
  这正好配合关闭注册。别的账号即使存在，也读写不到店主的行（模拟已验证）。
- 回滚文件不会恢复 Gemini key；最后的 anon 全开放段落默认注释掉，只在万不得已时用。

## 本地模拟
```bash
mkdir -p /tmp/pgsim && cd /tmp/pgsim && npm i @electric-sql/pglite@0.2.17
node /path/to/Menu-opp/supabase/004_rls_simulation.mjs /path/to/Menu-opp
```
覆盖：执行前 anon 能读 settings（复现漏洞）→ 004 执行两次 → anon 全部拒绝；店主按 index.html 的真实调用
（upsert dishes/settings/selected_menu/menu_history、menus_cerrados 无 owner_id 插入/null 插入/更新/删除）全部成功；
另一个已注册账号读到 0 行、改不了、不能冒充店主插入、店主不能把行转给别人；gemini_api_key 列已删；
回滚后店主可用、anon 仍拒绝；再次执行 004 全部通过。
