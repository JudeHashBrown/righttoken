# GeoIP 地域负责人分配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将注册 IP 自动解析为国家和省 / 州 / 地区，并按地域规则自动分配运营负责人。

**Architecture:** 使用独立 `GeoIpResolver` 适配层隔离外部服务；注册事件仅补全缺失地域字段；分配引擎按地区、国家、普通规则的特异性排序。

**Tech Stack:** Next.js 16、TypeScript、Prisma、Zod、Vitest

## Global Constraints

- 解析失败不得阻断注册。
- 只向 GeoIP 服务发送 IP。
- 地区规则优先于国家规则。
- 同级规则继续遵循管理员优先级。
- 不绑定具体付费 GeoIP 供应商。

---

### Task 1: GeoIP 适配层

**Files:**
- Create: `src/modules/geoip/types.ts`
- Create: `src/modules/geoip/http-resolver.ts`
- Create: `src/modules/geoip/private-ip.ts`
- Test: `tests/unit/geoip/http-resolver.test.ts`

**Interfaces:**
- Produces: `GeoIpResolver.resolve(ip)`、`createGeoIpResolver()`

- [ ] 写私网 IP、合法响应、非法响应、超时和未配置服务测试。
- [ ] 运行测试并确认因模块不存在而失败。
- [ ] 实现最小适配层和环境配置。
- [ ] 运行测试并确认通过。

### Task 2: 注册事件地域补全

**Files:**
- Modify: `src/modules/users/apply-event.ts`
- Test: `tests/unit/users/registration-location.test.ts`

**Interfaces:**
- Consumes: `GeoIpResolver`
- Produces: `resolveRegistrationLocation(payload, resolver)`

- [ ] 写已有值保留、缺失值补全、异常降级测试。
- [ ] 运行测试并确认失败。
- [ ] 实现注册地域补全并接入注册事件。
- [ ] 运行测试并确认通过。

### Task 3: 地域规则优先级

**Files:**
- Modify: `src/modules/assignment/match-rule.ts`
- Test: `tests/unit/assignment/match-rule.test.ts`

**Interfaces:**
- Produces: 地区规则优先于国家规则的稳定排序。

- [ ] 写地区规则覆盖国家规则测试。
- [ ] 运行测试并确认当前按普通优先级错误命中。
- [ ] 实现规则特异性排序。
- [ ] 运行全部分配单元测试并确认通过。

### Task 4: 管理后台与配置文档

**Files:**
- Modify: `src/components/automation/assignment-rule-editor.tsx`
- Modify: `src/app/(dashboard)/automation/assignment/page.tsx`
- Modify: `.env.example`
- Modify: `docs/runbooks/deployment.md`
- Test: `tests/unit/components/assignment-rule-editor.test.tsx`

**Interfaces:**
- Consumes: `countryCodes`、`regionIncludes`

- [ ] 写国家、省 / 州 / 地区输入字段测试。
- [ ] 运行测试并确认失败。
- [ ] 完成管理后台字段、说明和环境变量文档。
- [ ] 运行组件测试、类型检查和 Lint。

### Task 5: 完整验证

**Files:**
- No production files

- [ ] 运行 GeoIP、注册事件、分配规则和组件单元测试。
- [ ] 运行 `npm run typecheck`。
- [ ] 运行 `npm run lint`。
- [ ] 运行 `git diff --check`。
