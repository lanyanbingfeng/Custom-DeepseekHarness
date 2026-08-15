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

  // 测试路由：广播一条带 test 标记的完成事件（pageVisible 固定 false，保证桌面宠物强制弹出）
  disposers.push(
    webServer.register({
      kind: "exact",
      path: `${PET_ROUTE_PREFIX}/pet-test`,
      handler: (req, res) => {
        broadcast({ type: "done", durationMs: 0, pageVisible: false, test: true, at: Date.now() });
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
  });
}

export default apply;
