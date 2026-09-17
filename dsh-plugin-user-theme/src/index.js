// DSH 定制主题插件入口（Node 端）
//
// 职责：
//   1. 通过 webServer.tapIndex() 注入主题 CSS（背景图 + 楷体 + 深蓝主色 + 各层半透明）
//      以及"背景设置"section 的内容样式；
//   2. 注入 window.__USER_THEME_ASSETS__ 变量，携带默认壁纸的 base64，
//      供浏览器端 client bundle（lib/client.js）的 React 组件读取。
//
// "背景设置"本身作为 DSH 设置面板的第 5 个原生标签，由 lib/client.js 通过
// 官方 `settings.section` slot 注册，走 React 原生渲染通道，不做任何 DOM hack。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BG_PATH = join(__dirname, "..", "assets", "bg.jpg");
const PET_DIR = join(__dirname, "..", "assets", "pet");
const PET_FRAMES = ["idle", "blink", "wave", "wink", "jump"];

// 读取桌宠动作帧（assets/pet/*.png）转 base64。
// 文件缺失时优雅降级：其余帧回退 idle；连 idle 都没有则返回 null（前端不渲染桌宠）。
function readPetFrames() {
  const frames = {};
  for (const name of PET_FRAMES) {
    try {
      const b64 = readFileSync(join(PET_DIR, name + ".png")).toString("base64");
      frames[name] = `data:image/png;base64,${b64}`;
    } catch {
      /* 单帧缺失，后面统一回退 */
    }
  }
  if (!frames.idle) return null;
  for (const name of PET_FRAMES) {
    if (!frames[name]) frames[name] = frames.idle;
  }
  return frames;
}

/* ===== 任务完成提醒（pet notify） =====
 *
 * Node 端作为唯一事件源：
 *   1. 监听 agent/status，记录每个 agent 的 idle→running→idle 周期耗时；
 *   2. 耗时超过阈值且非子代理会话时，向所有 SSE 订阅者广播完成事件；
 *   3. 提供 pet-events(SSE) / pet-visibility / pet-config 三条路由；
 *   4. desktopPetEnabled 时托管独立 Python 桌面宠物进程。
 */
const NOTIFY_CONFIG_PATH = join(homedir(), ".dsh", "user-theme-pet-notify.json");
const NOTIFY_DEFAULTS = { notifyEnabled: true, minDurationSec: 30, desktopPetEnabled: true };
const PET_ROUTE_PREFIX = "/plugins/dsh-plugin-user-theme";
const VISIBILITY_TTL_MS = 60_000;
const SSE_HEARTBEAT_MS = 25_000;

function loadNotifyConfig() {
  try {
    const saved = JSON.parse(readFileSync(NOTIFY_CONFIG_PATH, "utf8"));
    return { ...NOTIFY_DEFAULTS, ...saved };
  } catch {
    return { ...NOTIFY_DEFAULTS };
  }
}

function saveNotifyConfig(cfg) {
  try {
    mkdirSync(dirname(NOTIFY_CONFIG_PATH), { recursive: true });
    writeFileSync(NOTIFY_CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch {
    /* 配置写盘失败不致命，下次启动回退默认值 */
  }
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function setupNotify(ctx) {
  let config = loadNotifyConfig();
  const runningSince = new Map(); // agentId -> running 起始时间戳
  const sseClients = new Set(); // ServerResponse 集合
  const visibleTabs = new Map(); // clientId -> { visible, at }
  const sseByClient = new Map(); // clientId -> ServerResponse（断开时据此清理可见性）
  let lastDone = null; // 最近一次完成事件，供 SSE 断线重连时补发
  let petProc = null;

  const pageVisible = () => {
    const now = Date.now();
    for (const t of visibleTabs.values()) {
      if (t.visible && now - t.at < VISIBILITY_TTL_MS) return true;
    }
    return false;
  };

  const broadcast = (payload) => {
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(line);
      } catch {
        sseClients.delete(res);
      }
    }
  };

  // 可见性聚合翻转时广播，供桌面宠物在用户回到页面时自动收起
  let lastPageVisible = null;
  const checkVisibilityTransition = () => {
    const v = pageVisible();
    if (v !== lastPageVisible) {
      lastPageVisible = v;
      broadcast({ type: "visibility", pageVisible: v, at: Date.now() });
    }
  };

  // --- agent/status 耗时统计（子代理会话跳过） ---
  ctx.on("agent/status", ({ agent, status }) => {
    try {
      if (status === "running") {
        runningSince.set(agent.id, Date.now());
        return;
      }
      const started = runningSince.get(agent.id);
      runningSince.delete(agent.id);
      if (started == null) return;
      if (agent.session?.header?.origin === "subagent") return;
      if (!config.notifyEnabled) return;
      const durationMs = Date.now() - started;
      if (durationMs >= config.minDurationSec * 1000) {
        lastDone = { type: "done", durationMs, pageVisible: pageVisible(), at: Date.now() };
        broadcast(lastDone);
      }
    } catch {
      /* 单个事件异常不影响宿主 */
    }
  });
  ctx.on("agent/disposed", ({ agent }) => {
    runningSince.delete(agent.id);
  });

  // --- 提问检测：agent 调用 ask_user_question 工具即"向用户提问" ---
  ctx.on("tools/execute", (exec, next) => {
    try {
      if (exec.name === "ask_user_question" && config.notifyEnabled) {
        broadcast({ type: "question", pageVisible: pageVisible(), at: Date.now() });
      }
    } catch {
      /* 单个事件异常不影响工具链 */
    }
    return next();
  });

  // --- 路由 ---
  const webServer = ctx.webServer;
  const disposers = [];
  disposers.push(
    webServer.register({
      kind: "exact",
      path: `${PET_ROUTE_PREFIX}/pet-events`,
      handler: (req, res) => {
        let clientId = null;
        try {
          const q = new URL(req.url, "http://localhost").searchParams.get("clientId");
          if (q) clientId = q;
        } catch {
          /* clientId 仅用于断开时清理可见性，缺失不影响事件流 */
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write("retry: 3000\n\n");
        // 断线重连补发：把最近一次完成事件（60s 内）推给刚连上的客户端，
        // 避免桌宠进程启动 / 断线期间漏掉任务完成提醒。
        if (lastDone && Date.now() - lastDone.at < 60_000) {
          res.write(`data: ${JSON.stringify(lastDone)}\n\n`);
        }
        sseClients.add(res);
        if (clientId) sseByClient.set(clientId, res);
        const cleanup = () => {
          sseClients.delete(res);
          if (clientId) {
            sseByClient.delete(clientId);
            // 浏览器被强杀/关闭时 SSE 立即断开，据此同步清除其可见性，
            // 避免残留的 visible 记录在 TTL 内误判「用户在看」而漏提醒。
            if (visibleTabs.delete(clientId)) checkVisibilityTransition();
          }
        };
        req.on("close", cleanup);
        res.on("close", cleanup);
      },
    })
  );

  disposers.push(
    webServer.register({
      kind: "exact",
      path: `${PET_ROUTE_PREFIX}/pet-visibility`,
      handler: async (req, res) => {
        const body = await readJsonBody(req);
        if (typeof body.clientId === "string" && body.clientId) {
          visibleTabs.set(body.clientId, { visible: body.visible === true, at: Date.now() });
          checkVisibilityTransition();
        }
        res.writeHead(204);
        res.end();
      },
    })
  );

  disposers.push(
    webServer.register({
      kind: "exact",
      path: `${PET_ROUTE_PREFIX}/pet-config`,
      handler: async (req, res) => {
        if (req.method === "POST") {
          const body = await readJsonBody(req);
          const next = { ...config };
          for (const key of Object.keys(NOTIFY_DEFAULTS)) {
            if (body[key] !== undefined && typeof body[key] === typeof NOTIFY_DEFAULTS[key]) {
              next[key] = body[key];
            }
          }
          next.minDurationSec = Math.max(1, Math.min(3600, Math.round(next.minDurationSec)));
          const petToggled = next.desktopPetEnabled !== config.desktopPetEnabled;
          config = next;
          saveNotifyConfig(config);
          if (petToggled) {
            if (config.desktopPetEnabled) startDesktopPet();
            else stopDesktopPet();
          }
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(config));
      },
    })
  );

  // 测试路由：广播一条带 test 标记的事件（pageVisible 固定 false，保证桌面宠物强制弹出）
  // 支持 ?type=question|done 指定事件类型，默认 done
  disposers.push(
    webServer.register({
      kind: "exact",
      path: `${PET_ROUTE_PREFIX}/pet-test`,
      handler: (req, res) => {
        const url = new URL(req.url, "http://localhost");
        const evType = url.searchParams.get("type") === "question" ? "question" : "done";
        broadcast({ type: evType, durationMs: 0, pageVisible: false, test: true, at: Date.now() });
        res.writeHead(204);
        res.end();
      },
    })
  );

  // SSE 心跳 + 过期可见性记录清理
  const heartbeat = setInterval(() => {
    for (const res of sseClients) {
      try {
        res.write(": ping\n\n");
      } catch {
        sseClients.delete(res);
      }
    }
    const now = Date.now();
    for (const [id, t] of visibleTabs) {
      if (now - t.at >= VISIBILITY_TTL_MS) visibleTabs.delete(id);
    }
    checkVisibilityTransition(); // 过期剔除也可能导致聚合翻转
  }, SSE_HEARTBEAT_MS);

  // --- Python 桌面宠物进程托管 ---
  function startDesktopPet() {
    if (petProc) return;
    const script = join(__dirname, "..", "desktop_pet.py");
    if (!existsSync(script)) return;
    const python = process.env.DSH_PET_PYTHON || "python";
    const host = webServer.host === "0.0.0.0" ? "127.0.0.1" : webServer.host;
    const sseUrl = `http://${host}:${webServer.port}${PET_ROUTE_PREFIX}/pet-events`;
    try {
      petProc = spawn(python, [script, "--sse", sseUrl, "--assets", PET_DIR], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      petProc.on("error", (err) => {
        petProc = null;
        console.warn(`[user-theme] 桌面宠物启动失败（浏览器内提醒不受影响）：${err.message}`);
      });
      petProc.on("exit", (code, signal) => {
        petProc = null;
        if (code !== 0) {
          console.warn(`[user-theme] 桌面宠物进程异常退出（code=${code} signal=${signal}），浏览器内提醒不受影响`);
        }
      });
      petProc.unref();
    } catch (err) {
      petProc = null;
      console.warn(`[user-theme] 桌面宠物启动失败（浏览器内提醒不受影响）：${err.message}`);
    }
  }
  function stopDesktopPet() {
    if (!petProc) return;
    try {
      petProc.kill();
    } catch {
      /* 已退出 */
    }
    petProc = null;
  }
  if (config.desktopPetEnabled) startDesktopPet();

  // --- 统一回收 ---
  ctx.on("dispose", () => {
    for (const d of disposers) d();
    clearInterval(heartbeat);
    for (const res of sseClients) {
      try {
        res.end();
      } catch {
        /* 连接已断开 */
      }
    }
    sseClients.clear();
    stopDesktopPet();
  });
}

/* ===== DeepSeek API 余额查询（Node 端代理，浏览器不接触 API Key） =====
 *
 * 1. 经 harness 的 credentials seam 解析 DEEPSEEK_API_KEY（与聊天请求走同一凭据通道）；
 * 2. 服务端请求 {baseURL}/user/balance（默认 https://api.deepseek.com），解析 balance_infos[0]；
 * 3. 结果在内存中短时缓存（默认 60s），合并并发请求，避免频繁调用余额接口。
 * 可选配置文件 ~/.dsh/user-theme-balance.json：{ "baseURL": "...", "cacheTtlSec": 60 }
 */
const BALANCE_CONFIG_PATH = join(homedir(), ".dsh", "user-theme-balance.json");
const BALANCE_DEFAULTS = {
  baseURL: process.env.DSH_DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  cacheTtlSec: 60,
};
const BALANCE_ROUTE = `${PET_ROUTE_PREFIX}/balance`;
const BALANCE_TIMEOUT_MS = 8000;

function loadBalanceConfig() {
  try {
    const saved = JSON.parse(readFileSync(BALANCE_CONFIG_PATH, "utf8"));
    return { ...BALANCE_DEFAULTS, ...saved };
  } catch {
    return { ...BALANCE_DEFAULTS };
  }
}

async function fetchDeepSeekBalance(baseURL, apiKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BALANCE_TIMEOUT_MS);
  try {
    const resp = await fetch(`${baseURL.replace(/\/+$/, "")}/user/balance`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* 非 JSON 错误页 */
    }
    if (!resp.ok) {
      const err = new Error(body?.error?.message || `HTTP ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function setupBalance(ctx) {
  // { at, data, pending }
  let cache = null;
  const webServer = ctx.webServer;

  const sendJson = (res, status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  };

  const disposer = webServer.register({
    kind: "exact",
    path: BALANCE_ROUTE,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url, "http://localhost");
        const force = url.searchParams.get("refresh") === "1";
        const cfg = loadBalanceConfig();
        const now = Date.now();

        if (!force && cache?.data && now - cache.at < cfg.cacheTtlSec * 1000) {
          sendJson(res, 200, { ...cache.data, cached: true });
          return;
        }
        if (!force && cache?.pending) {
          const data = await cache.pending;
          sendJson(res, 200, { ...data, cached: true });
          return;
        }

        // 凭据：优先 credentials seam（Models 页写入/refs），回退启动环境变量
        let apiKey;
        const credentials = typeof ctx.get === "function" ? ctx.get("credentials") : undefined;
        if (credentials) {
          const hit = await credentials.resolve("DEEPSEEK_API_KEY");
          apiKey = hit?.value;
        }
        if (!apiKey) apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
          sendJson(res, 200, {
            ok: false,
            code: "NO_API_KEY",
            message: "未配置 DEEPSEEK_API_KEY（请在 DSH 模型设置中保存 DeepSeek API Key）",
          });
          return;
        }

        const pending = fetchDeepSeekBalance(cfg.baseURL, apiKey)
          .then((body) => {
            // 线上接口字段为 balance_infos 数组（每币种一项，通常只有 CNY）；
            // 兼容历史/网关上可能出现的单数 balance_info 对象。
            const info = Array.isArray(body?.balance_infos)
              ? body.balance_infos[0]
              : body?.balance_info;
            const data = {
              ok: body?.is_available === true,
              available: body?.is_available === true,
              balance: info ? Number(info.total_balance) : null,
              granted: info ? Number(info.granted_balance) : null,
              toppedUp: info ? Number(info.topped_up_balance) : null,
              currency: info?.currency || "CNY",
              at: Date.now(),
            };
            cache = { at: Date.now(), pending: null, data };
            return data;
          })
          .catch((err) => {
            cache = null;
            return {
              ok: false,
              code: err.status === 401 ? "UNAUTHORIZED" : "FETCH_FAILED",
              status: err.status,
              message: err?.message || String(err),
              at: Date.now(),
            };
          });

        cache = { at: now, pending, data: cache?.data ?? null };
        sendJson(res, 200, await pending);
      } catch (err) {
        sendJson(res, 200, { ok: false, code: "INTERNAL", message: err?.message || String(err) });
      }
    },
  });

  ctx.on("dispose", () => disposer());
}

function buildCss() {
  const buf = readFileSync(BG_PATH);
  const b64 = buf.toString("base64");
  const bgUri = `data:image/jpeg;base64,${b64}`;

  const BASE_CSS = `
/* ===== DSH 用户主题（dsh-plugin-user-theme） ===== */

/* 字体：楷体 */
:root {
  --dsw-font-family: "KaiTi", "楷体", "STKaiti", "华文楷体", "Microsoft YaHei", sans-serif !important;
}

/* 背景图：html/body/#root 三层 */
html, body, #root {
  background-image: url("${bgUri}") !important;
  background-size: cover !important;
  background-position: center !important;
  background-attachment: fixed !important;
  background-repeat: no-repeat !important;
}

/* 各层背景半透明 + 主色调 + 面板调实 */
body[data-ds-dark-theme] {
  --dsw-alias-bg-base: rgba(21, 21, 23, 0.45) !important;
  --dsw-alias-bg-layer-1: rgba(35, 35, 36, 0.40) !important;
  --dsw-alias-bg-layer-2: rgba(44, 44, 46, 0.38) !important;
  --dsw-alias-bg-layer-3: rgba(53, 54, 56, 0.36) !important;
  --dsw-specific-sidebar-fill: rgba(27, 27, 28, 0.48) !important;
  --dsw-specific-input-major: rgba(44, 44, 46, 0.42) !important;
  --dsw-specific-bubble: rgba(44, 44, 46, 0.40) !important;
  --dsw-specific-menu: rgba(35, 35, 36, 0.97) !important;
  --dsw-alias-bg-overlay: rgba(44, 44, 46, 0.97) !important;
  --dsw-alias-brand-primary: #6d9ed0 !important;
  --dsw-alias-state-business-primary: #4a8fd6 !important;
  --dsw-static-deepseek-400: #4a8fd6 !important;
  --dsw-static-deepseek-450: #4a8fd6 !important;
  --dsw-static-deepseek-500: #3b6ea8 !important;
}
body[data-ds-dark-theme] [class*="dialog"],
body[data-ds-dark-theme] [class*="Dialog"],
body[data-ds-dark-theme] [class*="modal"],
body[data-ds-dark-theme] [class*="Modal"] {
  background-color: rgba(27, 27, 28, 0.98) !important;
}

/* 设置面板：DSH 用 --dsw-alias-bg-layer-2 做面板背景，而主题把它调成了半透明，
   导致面板后的聊天内容透出、视觉叠加。这里单独把设置面板覆盖为不透明，
   让"设置面板"透明度滑块（--dsw-alias-bg-overlay）真正生效。 */
body[data-ds-dark-theme] .VOzbGW_panel {
  background: var(--dsw-alias-bg-overlay, rgba(44, 44, 46, 0.97)) !important;
}
body[data-ds-dark-theme] .VOzbGW_content,
body[data-ds-dark-theme] .VOzbGW_options {
  background: transparent !important;
}

/* ===== 背景设置 section 内容样式（由 client bundle 的 React 组件渲染） ===== */
.user-theme-root {
  color: var(--dsw-alias-label-primary, #e8f0ec);
  font-family: var(--dsw-font-family);
}
.user-theme-root * {
  font-family: var(--dsw-font-family);
}
.user-theme-root .ut-section {
  margin-bottom: 22px;
}
.user-theme-root h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 10px 0;
  color: var(--dsw-alias-label-secondary, #c4d2ca);
}
.user-theme-root .ut-row {
  margin-bottom: 12px;
}
.user-theme-root .ut-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 6px;
  color: var(--dsw-alias-label-secondary, #c4d2ca);
}
.user-theme-root .ut-value {
  color: var(--dsw-alias-label-primary, #e8f0ec);
}
.user-theme-root input[type="range"] {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.user-theme-root input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #4a8fd6;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #fff;
}
.user-theme-root input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #4a8fd6;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #fff;
}
.user-theme-root .ut-select {
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.05));
  color: var(--dsw-alias-label-primary, #e8f0ec);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  outline: none;
  width: 100%;
}
.user-theme-root .ut-select:focus {
  border-color: #4a8fd6;
}
.user-theme-root .ut-bg-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.user-theme-root .ut-bg-thumb {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  transition: border 0.15s ease;
  border: 2px solid rgba(255, 255, 255, 0.08);
}
.user-theme-root .ut-bg-thumb:hover {
  border-color: rgba(255, 255, 255, 0.25);
}
.user-theme-root .ut-bg-thumb-active {
  border-color: #4a8fd6;
}
.user-theme-root .ut-bg-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.user-theme-root .ut-custom-badge {
  margin-top: 10px;
  padding: 10px;
  background: rgba(74, 143, 214, 0.12);
  border: 1px solid rgba(74, 143, 214, 0.3);
  border-radius: 6px;
  font-size: 12px;
  color: #6d9ed0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.user-theme-root .ut-btn {
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-family: var(--dsw-font-family);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.user-theme-root .ut-btn-ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: var(--dsw-alias-label-primary, #e8f0ec);
}
.user-theme-root .ut-btn-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
}
.user-theme-root .ut-upload {
  width: 100%;
  margin-top: 10px;
  border-style: dashed;
}
.user-theme-root .ut-footer {
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.user-theme-root .ut-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.user-theme-root .ut-switch {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  cursor: pointer;
  padding: 0;
  transition: background 0.2s ease;
}
.user-theme-root .ut-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}
.user-theme-root .ut-switch-on {
  background: #4a8fd6;
}
.user-theme-root .ut-switch-on::after {
  transform: translateX(16px);
}

/* ===== 桌宠（DesktopPet，由 client bundle 挂载到 body） ===== */
.user-theme-pet {
  position: fixed;
  z-index: 900;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  cursor: grab;
  transition: transform 0.2s ease, filter 0.2s ease;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.35));
}
.user-theme-pet:hover {
  transform: scale(1.08);
  filter: drop-shadow(0 4px 16px rgba(74, 143, 214, 0.55));
}
.user-theme-pet.ut-dragging {
  cursor: grabbing;
  transform: scale(1.05);
  transition: none;
}
.user-theme-pet img {
  display: block;
  height: 100%;
  width: auto;
  pointer-events: none;
  animation: ut-pet-breathe 3.2s ease-in-out infinite;
  transform-origin: 50% 100%;
}
@keyframes ut-pet-breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.user-theme-pet.ut-pop img {
  animation: ut-pet-pop 0.5s ease;
}
@keyframes ut-pet-pop {
  0% { transform: scale(1, 1); }
  40% { transform: scale(1.12, 0.88); }
  70% { transform: scale(0.94, 1.08); }
  100% { transform: scale(1, 1); }
}

/* 任务完成庆祝动画（桌宠连跳三下） */
.user-theme-pet.ut-celebrate img {
  animation: ut-pet-celebrate 0.6s ease-in-out 3;
}
@keyframes ut-pet-celebrate {
  0%, 100% { transform: translateY(0); }
  40% { transform: translateY(-14px); }
}

/* 任务完成提醒气泡（由 client bundle 定位到桌宠旁） */
.user-theme-pet-bubble {
  position: fixed;
  z-index: 1001;
  max-width: 240px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.97);
  color: #2b3a4a;
  border-radius: 12px;
  border: 1px solid rgba(74, 143, 214, 0.45);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
  font-size: 14px;
  line-height: 1.5;
  font-family: var(--dsw-font-family);
  animation: ut-bubble-in 0.35s ease;
}
.user-theme-pet-bubble::after {
  content: "";
  position: absolute;
  bottom: -7px;
  right: 28px;
  width: 12px;
  height: 12px;
  background: inherit;
  border-right: 1px solid rgba(74, 143, 214, 0.45);
  border-bottom: 1px solid rgba(74, 143, 214, 0.45);
  transform: rotate(45deg);
}
@keyframes ut-bubble-in {
  0% { opacity: 0; transform: translateY(8px) scale(0.92); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* ===== 侧边栏 DeepSeek 余额卡片（sidebar.footer.action） ===== */
.user-theme-balance {
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: linear-gradient(135deg, rgba(74, 143, 214, 0.20), rgba(44, 44, 46, 0.32));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: var(--dsw-alias-label-primary, #e8f0ec);
  font-family: var(--dsw-font-family);
  cursor: default;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.user-theme-balance:hover {
  border-color: rgba(109, 158, 208, 0.45);
}
.ut-bal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #c4d2ca);
  letter-spacing: 0.02em;
}
.ut-bal-title {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  overflow: hidden;
}
.ut-bal-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
  background: #4a8fd6;
  box-shadow: 0 0 6px rgba(74, 143, 214, 0.8);
}
.ut-bal-dot.ut-ok { background: #46c98d; box-shadow: 0 0 6px rgba(70, 201, 141, 0.8); }
.ut-bal-dot.ut-warn { background: #f0a94b; box-shadow: 0 0 6px rgba(240, 169, 75, 0.8); }
.ut-bal-dot.ut-err { background: #e06a6a; box-shadow: 0 0 6px rgba(224, 106, 106, 0.8); }
.ut-bal-refresh {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #c4d2ca);
  cursor: pointer;
  padding: 2px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  line-height: 0;
}
.ut-bal-refresh:hover { color: #6d9ed0; background: rgba(255,255,255,0.06); }
.ut-bal-refresh svg { width: 12px; height: 12px; display: block; }
.ut-bal-refresh.ut-spinning svg { animation: ut-bal-spin 0.8s linear infinite; }
@keyframes ut-bal-spin { to { transform: rotate(360deg); } }
.ut-bal-amount {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ut-bal-amount .ut-bal-currency {
  font-size: 12px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary, #c4d2ca);
  margin-left: 4px;
}
.ut-bal-meta {
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--dsw-alias-label-secondary, #c4d2ca);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
}
.ut-bal-meta.ut-err-text { color: #e89a9a; }
.ut-bal-meta.ut-muted { opacity: 0.75; }
.ut-bal-skeleton {
  margin-top: 7px;
  height: 18px;
  width: 100%;
  border-radius: 5px;
  background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.16) 37%, rgba(255,255,255,0.06) 63%);
  background-size: 400% 100%;
  animation: ut-bal-shimmer 1.3s ease infinite;
}
@keyframes ut-bal-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}
/* 卡片主体：左侧金额/时间，右侧两个上下堆叠的小填充按钮 */
.user-theme-balance { margin: 0 0 8px; }
.ut-bal-body {
  margin-top: 6px;
  display: flex;
  align-items: stretch;
  gap: 8px;
}
.ut-bal-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.ut-bal-info .ut-bal-amount { margin-top: 0; }
.ut-bal-actions {
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}
.ut-bal-action {
  box-sizing: border-box;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.12));
  border-radius: 9px;
  background: var(--dsw-alias-button-elevated-fill, rgba(255, 255, 255, 0.10));
  color: var(--dsw-alias-label-primary, #e8f0ec);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.ut-bal-action:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.18));
  border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.22));
}
.ut-bal-action svg { width: 13px; height: 13px; flex: none; display: block; }
/* 侧边栏折叠为轨道时：只显示状态圆点 */
.user-theme-balance.ut-rail {
  width: 32px;
  padding: 6px 0;
  margin: 0 auto 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
}
.user-theme-balance.ut-rail .ut-bal-head,
.user-theme-balance.ut-rail .ut-bal-body { display: none; }
.user-theme-balance.ut-rail .ut-bal-dot { width: 9px; height: 9px; }
`;

  const petFrames = readPetFrames();
  const assetsScript =
    `<script id="user-theme-assets">window.__USER_THEME_ASSETS__ = { defaultBg: ${JSON.stringify(bgUri)}, pet: ${JSON.stringify(petFrames)} };</script>`;

  return (
    '<style id="user-theme-base">' + BASE_CSS + "</style>" +
    assetsScript
  );
}

export function apply(ctx) {
  const injection = buildCss();

  ctx.inject(["webServer"], (httpCtx) => {
    httpCtx.effect(
      () =>
        httpCtx.webServer.tapIndex((html) => {
          if (/<\/head>/i.test(html)) {
            return html.replace(/<\/head>/i, injection + "</head>");
          }
          return injection + html;
        }),
      "user-theme: custom css + assets"
    );

    setupNotify(httpCtx);
    setupBalance(httpCtx);
  });
}

export default apply;
