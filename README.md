# Hotspot Monitoring Radar

一个轻量、可本地运行的 AI 热点监控工具。

它会从多个公开信息源自动发现新内容，用 OpenRouter 判断真假和通知价值，并把结果汇总到一个响应式 Web 控制台里。当前阶段优先完成 Web 版；在 Web 稳定后，再继续封装成 Agent Skills。

## 当前能力

- 手动创建监控项：关键词、热点范围、AI 判别说明、轮询间隔、来源、邮件接收人。
- 多源抓取：网页搜索爬取、Google News RSS、Hacker News、GitHub Releases、Twitter/X。
- AI 审核：通过 OpenRouter 判断相关性、热度、真假风险、是否值得通知。
- 通知能力：站内通知、浏览器通知；配置 SMTP 后自动发邮件。
- 本地持久化：运行态数据保存在 `data/state.json`。
- 后台 worker：定时执行监控轮询，适合本地工具场景快速验证。

## 技术选型

- Next.js 16 App Router
- TypeScript + Tailwind CSS v4
- OpenRouter 作为 AI 审核层
- TwitterAPI.io 作为 X 数据源
- 本地 JSON 存储，降低工程复杂度

## 启动方式

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

把 `.env.example` 复制为 `.env.local`，至少补充：

```bash
OPENROUTER_API_KEY=你的_openrouter_key
OPENROUTER_MODEL=openai/gpt-4.1-mini
```

可选配置：

- `TWITTER_API_IO_KEY`：启用 Twitter / X 搜索源。
- `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`：启用邮件通知。
- `WORKER_TICK_MS`：后台轮询频率，默认 300000 毫秒。

3. 同时启动 Web 和 worker

```bash
npm run dev:all
```

4. 打开浏览器

```bash
http://localhost:3000
```

## 常用命令

```bash
npm run dev        # 只启动 Web
npm run worker     # 只启动后台监控 worker
npm run dev:all    # Web + worker 一起启动
npm run monitor:once
npm run lint
npm run test
npm run build
```

## 运行说明

- 没有配置 OpenRouter 时，系统会退回启发式判断，只用于本地演示，不建议作为正式信号源。
- 没有配置 TwitterAPI.io Key 时，Twitter / X 数据源会自动跳过。
- 没有配置 SMTP 时，邮件会跳过，但站内和浏览器通知仍然可用。
- GitHub Releases 默认监控一组 AI 生态仓库，也可以在监控表单里单独覆盖。

## 后续计划

- 第一阶段：把 Web 版跑稳，验证热点发现、真假识别、通知链路。
- 第二阶段：把这套能力封装成 Agent Skills，供其他 AI 直接调用。
