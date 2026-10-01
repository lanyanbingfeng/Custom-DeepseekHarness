// DSH 定制主题插件入口（Host / Node 端）
//
// 桌面端（DeepSeek Harness 桌面应用）与 Web 端共用同一份插件：
//   1. 通过 `webserver/index-inject` 事件贡献**结构化注入行**（style / global / html）。
//      这是桌面端唯一有效的注入通道——桌面窗口加载的是打包好的静态 index.html，
//      `webServer.tapIndex()` 只有 Web 端 fallback 渲染 index 时才会执行。
//   2. 通过 `webServer.register()` 暴露插件自己的静态资源路由（壁纸 / 桌宠动作帧），
//      客户端按需拉取；桌面外壳会把 `dsh-app://app/plugins/...` 转发给 Host。
//
// 「背景设置」标签、侧边栏余额卡片由 lib/client.js 注册到官方 slot，
// 桌面宠物（可选）是独立的 Python 进程，由 Node 端托管。
//
// 运行期无第三方依赖：仅用 Node 内置模块。

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, "..");
const ASSET_DIR = join(PLUGIN_ROOT, "assets");
const PET_DIR = join(ASSET_DIR, "pet");
const PET_SCRIPT = join(PLUGIN_ROOT, "desktop_pet.py");
const PET_FRAMES = ["idle", "blink", "wave", "wink", "jump"];

/** 插件自己的路由前缀（同时是 dsh-client-modules 之外的命名空间，不会冲突）。 */
const PLUGIN_ROUTE_PREFIX = "/plugins/dsh-plugin-user-theme";

/* ===== 静态资源路由 =====
 *
 * 桌面端把 `dsh-app://app/plugins/**` 转发给 Host，因此浏览器侧可以直接按
 * 文档相对地址取图（`plugins/...`），不必把 base64 塞进 index。
 * 白名单式路由：只有下列文件可被取到，且解析后必须仍在 assets/ 内。
 */
const ASSET_CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
const ASSETS = {
  "bg.jpg": join(ASSET_DIR, "bg.jpg"),
  ...Object.fromEntries(PET_FRAMES.map((name) => [`pet/${name}.png`, join(PET_DIR, `${name}.png`)])),
};
const ASSET_NAMES = Object.keys(ASSETS);

/**
 * 读取资源文件的版本号（mtime+size），用于 cache-busting 查询串。
 * 资源在插件安装后即固定；改了文件会换 URL，避免浏览器拿到旧图。
 * @param {string} file - 资源绝对路径
 * @returns {string} 版本串；文件缺失时为空串（路由会回 404）
 */
function assetVersion(file) {
  try {
    const st = statSync(file);
    return `${Math.round(st.mtimeMs)}-${st.size}`;
  } catch {
    return "";
  }
}

/** 资源在浏览器里的文档相对地址（桌面端由外壳转发给 Host）。 */
function assetUrl(name, version) {
  return `${PLUGIN_ROUTE_PREFIX.replace(/^\//, "")}/assets/${name}${version ? `?v=${version}` : ""}`;
}

/**
 * 注册插件静态资源路由。
 * @param {object} webServer - webServer 服务
 * @returns {Array<() => void>} disposer 列表
 */
function registerAssetRoutes(webServer) {
  const disposers = [];
  for (const name of ASSET_NAMES) {
    const file = ASSETS[name];
    const type = ASSET_CONTENT_TYPES[name.slice(name.lastIndexOf("."))] || "application/octet-stream";
    disposers.push(
      webServer.register({
        kind: "exact",
        path: `${PLUGIN_ROUTE_PREFIX}/assets/${name}`,
        handler: (req, res) => {
          // 白名单 + 目录约束：即使有人改了 ASSETS 也不会读出插件目录之外的文件
          if (!resolve(file).startsWith(resolve(ASSET_DIR) + sep)) {
            res.writeHead(404);
            res.end();
            return;
          }
          let body;
          try {
            body = readFileSync(file);
          } catch {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(200, {
            "Content-Type": type,
            "Content-Length": body.length,
            // 带版本查询串 → 可以长缓存；不带版本则短缓存，避免换图后不刷新
            "Cache-Control": /[?&]v=/.test(req.url || "") ? "public, max-age=31536000, immutable" : "no-cache",
          });
          if (req.method === "HEAD") res.end();
          else res.end(body);
        },
      })
    );
  }
  return disposers;
}

/* ===== 任务完成提醒（pet notify） =====
 *
 * Node 端作为唯一事件源：
 *   1. 监听 agent/status，记录每个 agent 的 idle→running→idle 周期耗时；
 *   2. 耗时超过阈值且非子代理会话时，向所有 SSE 订阅者广播完成事件；
 *   3. 提供 pet-events(SSE) / pet-visibility / pet-config / pet-test 路由；
 *   4. desktopPetEnabled 时托管独立 Python 桌面宠物进程。
 */
const NOTIFY_CONFIG_PATH = join(homedir(), ".dsh", "user-theme-pet-notify.json");
const NOTIFY_DEFAULTS = { notifyEnabled: true, minDurationSec: 30, desktopPetEnabled: true };
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
  let petProc = null; // 当前托管的桌宠进程
  let petWanted = false; // 期望状态：清理历史遗留期间若被关闭，则不再启动
  let petStarting = false; // 正在「清理遗留 → 启动」的窗口内
  let petCleanup = null; // 进行中的清理 Promise，多入口共享以消除竞态

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
  //
  // 事件是 agent 作用域的：`this` 是 Scoped<Agent>，payload 里同时带 agent 字段。
  // 两种形态都兼容（旧版本只给 payload.agent）。
  ctx.on("agent/status", function (payload) {
    try {
      const agent = payload?.agent ?? this;
      const status = payload?.status;
      if (!agent || typeof agent.id !== "string") return;
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
  ctx.on("agent/disposed", function (payload) {
    try {
      const agent = payload?.agent ?? this;
      if (agent && typeof agent.id === "string") runningSince.delete(agent.id);
    } catch {
      /* 忽略 */
    }
  });

  // --- 提问检测：agent 调用 ask_user_question 工具即"向用户提问" ---
  ctx.on("tools/execute", (exec, next) => {
    try {
      if (exec?.name === "ask_user_question" && config.notifyEnabled) {
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
      path: `${PLUGIN_ROUTE_PREFIX}/pet-events`,
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
      path: `${PLUGIN_ROUTE_PREFIX}/pet-visibility`,
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
      path: `${PLUGIN_ROUTE_PREFIX}/pet-config`,
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
            else stopDesktopPet(true); // 用户主动关闭：连历史遗留一起收掉
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
      path: `${PLUGIN_ROUTE_PREFIX}/pet-test`,
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
  //
  // 桌宠是 detached + unref 的独立进程（DSH 关掉后仍要显示提醒），因此父进程退出时它会留存。
  // 若不在启动前清理，每次重启都会多留一个桌宠窗口、越积越多；另外在 Windows 上
  // `python` 常常是先启动一个 shim（如 .local\bin\python.exe）再拉起真实解释器，只 kill 直接
  // 子进程会留下孤儿的真实解释器。因此这里两处加固：启动前清遗留 + 停止时结束整棵进程树。
  /**
   * 结束此前遗留的桌宠进程（shim 与真实解释器都会被匹配到）。
   * 仅匹配命令行中含本插件 `desktop_pet.py` 绝对路径的 python 进程，不误伤其它 python。
   * 必须等它结束再启动新桌宠，否则新进程也会被一起杀掉。
   * @returns 清理完成的 Promise（失败或超时也不阻塞启动）
   */
  function killStrayDesktopPets() {
    if (process.platform !== "win32") return Promise.resolve();
    const psCmd = [
      "$ErrorActionPreference='SilentlyContinue';",
      "Get-CimInstance Win32_Process -Filter \"Name='python.exe' or Name='pythonw.exe'\" |",
      "Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:UT_PET_SCRIPT) } |",
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ].join(" ");
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      try {
        const killer = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCmd], {
          env: { ...process.env, UT_PET_SCRIPT: PET_SCRIPT },
          stdio: "ignore",
          windowsHide: true,
        });
        killer.on("error", finish);
        killer.on("exit", finish);
        setTimeout(finish, 8000).unref(); // 兜底：清理异常也不拖住启动
      } catch {
        finish();
      }
    });
  }

  /**
   * 共享的清理入口：并发调用复用同一个 Promise，保证「启动前的清理」一定等到
   * 「停止时触发的清理」结束后才 spawn，不会出现清理迟到杀掉新桌宠的竞态。
   */
  function cleanupStrayPets() {
    if (!petCleanup) petCleanup = killStrayDesktopPets().finally(() => { petCleanup = null; });
    return petCleanup;
  }

  async function startDesktopPet() {
    petWanted = true;
    if (petProc || petStarting) return;
    if (!existsSync(PET_SCRIPT)) return;
    petStarting = true;
    try {
      await cleanupStrayPets();
      if (!petWanted || petProc) return; // 清理期间已被关闭
      const python = process.env.DSH_PET_PYTHON || "python";
      const host = webServer.host === "0.0.0.0" ? "127.0.0.1" : webServer.host;
      const sseUrl = `http://${host}:${webServer.port}${PLUGIN_ROUTE_PREFIX}/pet-events`;
      const proc = spawn(python, [PET_SCRIPT, "--sse", sseUrl, "--assets", PET_DIR], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      petProc = proc;
      proc.on("error", (err) => {
        if (petProc === proc) petProc = null;
        ctx.logger?.warn?.(`[user-theme] 桌面宠物启动失败（浏览器内提醒不受影响）：${err.message}`);
      });
      proc.on("exit", (code, signal) => {
        const unexpected = petProc === proc; // 主动 stop 时 petProc 已置空，不重复报警
        if (unexpected) petProc = null;
        if (unexpected && code !== 0) {
          ctx.logger?.warn?.(`[user-theme] 桌面宠物进程异常退出（code=${code} signal=${signal}），浏览器内提醒不受影响`);
        }
      });
      proc.unref();
    } catch (err) {
      ctx.logger?.warn?.(`[user-theme] 桌面宠物启动失败（浏览器内提醒不受影响）：${err.message}`);
    } finally {
      petStarting = false;
    }
  }

  /**
   * 结束当前托管的桌宠。
   * @param sweep 是否连带清扫历史遗留桌宠。仅在「用户主动关闭」时为 true：
   *   dispose（插件重载/退出）只结束自己的进程树——新实例启动前会自行清扫，
   *   此处若也清扫，迟到的清理会误杀新实例刚拉起的桌宠。
   */
  function stopDesktopPet(sweep = false) {
    petWanted = false;
    const pid = petProc?.pid;
    petProc = null;
    if (pid) {
      try {
        if (process.platform === "win32") {
          // /T 连同 shim 拉起的真实解释器一起结束，避免留下孤儿窗口
          spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).unref();
        } else {
          process.kill(pid, "SIGTERM");
        }
      } catch {
        /* 已退出 */
      }
    }
    if (sweep) void cleanupStrayPets();
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

/* ===== DeepSeek 余额查询（走 DSH 的 DeepSeek 账号，不再使用 API Key） =====
 *
 * 数据来源是 harness 的 `deepseekAccount` 服务（与设置面板「账号」页同一套登录态）：
 *   - `getBalance(client)` 返回 `{ status, value, bonusWallets }`，或 **null 表示未登录**；
 *   - `client` 需要 `{ version, locale, timezoneOffsetSeconds }`，与浏览器端调用同形；
 *   - 凭据只在 Host 内解析，浏览器不接触任何 token。
 *
 * 结果在内存中短时缓存（默认 60s）并合并并发请求；同一币种的余额与赠送额度
 * （bonusWallets 里同币种的钱包）会合并成一条，便于卡片一眼看清。
 */

/** 未登录账号时的固定返回，客户端据此提示去登录。 */
const NO_ACCOUNT = {
  ok: false,
  code: "NO_ACCOUNT",
  message: "未登录 DeepSeek 账号（请在「设置 → 账号」中登录）",
};

const BALANCE_ROUTE = `${PLUGIN_ROUTE_PREFIX}/balance`;
const BALANCE_CACHE_TTL_MS = 60_000;
/** 进程启动时读一次，失败不缓存，下次请求重试。 */
let pluginVersionCache = null;

function pluginVersion() {
  if (pluginVersionCache) return pluginVersionCache;
  try {
    const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8"));
    pluginVersionCache = typeof manifest.version === "string" ? manifest.version : "0.0.0";
  } catch {
    pluginVersionCache = "0.0.0";
  }
  return pluginVersionCache;
}

/** 当前 UI 语言（BCP-47；Platform 会自己归一成 zh_CN / en_US）。 */
function currentLocale() {
  const explicit = process.env.DSH_LOCALE || process.env.LC_ALL || process.env.LANG;
  if (explicit && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]+)*$/.test(explicit)) return explicit;
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "zh-CN";
  } catch {
    return "zh-CN";
  }
}

/**
 * 把 `deepseekAccount.getBalance()` 的返回值归一成卡片用的形状。
 * @param {{status: string, value?: Array<{currency: string, balance: string}>, bonusWallets?: Array<{currency: string, balance: string}>}} result
 * @returns {object} 卡片数据
 */
function normalizeAccountBalance(result) {
  const main = Array.isArray(result?.value) ? result.value : [];
  const bonus = Array.isArray(result?.bonusWallets) ? result.bonusWallets : [];
  const wallets = [...main, ...bonus];
  if (wallets.length === 0) {
    return { ok: false, code: "NO_WALLET", message: "账号未返回任何钱包余额", at: Date.now() };
  }

  // 按币种合并（赠送额度单独记一份，卡片可以显示「含赠送」）
  const byCurrency = new Map();
  for (const wallet of wallets) {
    const currency = wallet?.currency || "CNY";
    const amount = Number(wallet?.balance);
    if (!Number.isFinite(amount)) continue;
    const entry = byCurrency.get(currency) || { currency, total: 0, bonus: 0 };
    entry.total += amount;
    byCurrency.set(currency, entry);
  }
  for (const wallet of bonus) {
    const currency = wallet?.currency || "CNY";
    const amount = Number(wallet?.balance);
    if (!Number.isFinite(amount)) continue;
    const entry = byCurrency.get(currency);
    if (entry) entry.bonus += amount;
  }
  if (byCurrency.size === 0) {
    return { ok: false, code: "NO_WALLET", message: "账号未返回任何钱包余额", at: Date.now() };
  }

  // 以 CNY 为主（DeepSeek 平台默认币种），否则取第一项
  const primary = byCurrency.get("CNY") || [...byCurrency.values()][0];
  return {
    ok: result?.status === "ready",
    source: "account",
    balance: Number(primary.total.toFixed(2)),
    bonus: primary.bonus > 0 ? Number(primary.bonus.toFixed(2)) : null,
    currency: primary.currency,
    wallets: [...byCurrency.values()].map((w) => ({
      currency: w.currency,
      balance: Number(w.total.toFixed(2)),
    })),
    at: Date.now(),
  };
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
        const now = Date.now();

        if (!force && cache?.data && now - cache.at < BALANCE_CACHE_TTL_MS) {
          sendJson(res, 200, { ...cache.data, cached: true });
          return;
        }
        if (!force && cache?.pending) {
          const data = await cache.pending;
          sendJson(res, 200, { ...data, cached: true });
          return;
        }

        const account = typeof ctx.get === "function" ? ctx.get("deepseekAccount") : undefined;
        if (!account || typeof account.getBalance !== "function") {
          sendJson(res, 200, {
            ok: false,
            code: "NO_ACCOUNT_SERVICE",
            message: "当前组合没有 DeepSeek 账号服务（本插件需要桌面端 / 完整 Web 组合）",
          });
          return;
        }

        const client = {
          version: pluginVersion(),
          locale: currentLocale(),
          timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
        };

        const pending = Promise.resolve()
          .then(() => account.getBalance(client))
          .then((result) => {
            // null = 未登录，或查询期间登录态发生变化
            const data = result == null ? { ...NO_ACCOUNT, at: Date.now() } : normalizeAccountBalance(result);
            cache = { at: Date.now(), pending: null, data };
            return data;
          })
          .catch((err) => {
            cache = null;
            return {
              ok: false,
              code: "FETCH_FAILED",
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

/* ===== index 注入：桌面端与 Web 端共用的唯一通道 =====
 *
 * 只贡献结构化注入行，不再使用 tapIndex：
 *   - style  ：主题基础样式（字体、半透明、桌宠、气泡、余额卡片）
 *   - global ：`__USER_THEME_ASSETS__`（壁纸 / 桌宠帧的文档相对地址 + 公共路由前缀）
 *   - html   ：壁纸 preload，避免首帧背景闪一下
 *
 * 桌面端由外壳在页面启动阶段按序应用这些行（style/global/html 都受支持），
 * Web 端由 Host 的 fallback 在渲染 index 时应用同一批行。
 */
function buildThemeCss() {
  return `/* ===== DSH 用户主题（dsh-plugin-user-theme） ===== */

/* 字体：由「背景设置」在运行时把 --ut-font-family 写到 :root */
:root {
  --dsw-font-family: var(--ut-font-family, "KaiTi", "楷体", "STKaiti", "华文楷体", "Microsoft YaHei", sans-serif) !important;
  /* 壁纸地址由 Node 端注入；"none" 表示不铺背景 */
  --ut-bg-url: none;
}

/* 背景图：html/body/#root 三层 */
html, body, #root {
  background-image: var(--ut-bg-url) !important;
  background-size: cover !important;
  background-position: center !important;
  background-attachment: fixed !important;
  background-repeat: no-repeat !important;
}

/* 各层背景半透明 + 主色调 + 面板调实（变量默认值；运行时可被内联样式覆盖） */
body[data-ds-dark-theme] {
  --dsw-alias-bg-base: rgba(21, 21, 23, 0.45) !important;
  --dsw-alias-bg-layer-1: rgba(35, 35, 36, 0.40) !important;
  --dsw-alias-bg-layer-2: rgba(44, 44, 46, 0.38) !important;
  --dsw-alias-bg-layer-3: rgba(53, 54, 56, 0.36) !important;
  --dsw-specific-sidebar-fill: rgba(27, 27, 28, 0.48) !important;
  --dsw-specific-input-major: rgba(44, 44, 46, 0.42) !important;
  --dsw-specific-menu: rgba(35, 35, 36, 0.97) !important;
  --dsw-alias-bg-overlay: rgba(44, 44, 46, 0.97) !important;
  --dsw-alias-brand-primary: #6d9ed0 !important;
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

/* 设置面板：面板背景色走 --dsw-alias-bg-overlay，让「设置面板」透明度滑块真正生效。
   0.2.0 的面板/弹窗容器用 --dsw-alias-bg-layer-2，而主题把它调成了半透明，
   于是面板后的内容会透出来；这里把面板与弹窗容器指向同一个可变的不透明色。
   只按构建产物里真实存在的类名（*_dialog_* / *_panel_* / *_modal_*）匹配。 */
body[data-ds-dark-theme] [class*="_dialog_"],
body[data-ds-dark-theme] [class*="_panel_"],
body[data-ds-dark-theme] [class*="_modal_"] {
  background-color: var(--dsw-alias-bg-overlay, rgba(44, 44, 46, 0.97)) !important;
}

/* ===== 背景设置 section 内容样式（由 client bundle 的 React 组件渲染） ===== */
.user-theme-root { color: var(--dsw-alias-label-primary, #e8f0ec); }
.user-theme-root * { font-family: var(--dsw-font-family); }
.user-theme-root .ut-section { margin-bottom: 22px; }
.user-theme-root h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 10px 0;
  color: var(--dsw-alias-label-secondary, #c4d2ca);
}
.user-theme-root .ut-row { margin-bottom: 12px; }
.user-theme-root .ut-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 6px;
  color: var(--dsw-alias-label-secondary, #c4d2ca);
}
.user-theme-root .ut-value { color: var(--dsw-alias-label-primary, #e8f0ec); }
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
.user-theme-root .ut-select:focus { border-color: #4a8fd6; }
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
.user-theme-root .ut-bg-thumb:hover { border-color: rgba(255, 255, 255, 0.25); }
.user-theme-root .ut-bg-thumb-active { border-color: #4a8fd6; }
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
.user-theme-root .ut-btn-ghost:hover { background: rgba(255, 255, 255, 0.06); }
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
.user-theme-root .ut-switch-on { background: #4a8fd6; }
.user-theme-root .ut-switch-on::after { transform: translateX(16px); }

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
.user-theme-pet.ut-pop img { animation: ut-pet-pop 0.5s ease; }
@keyframes ut-pet-pop {
  0% { transform: scale(1, 1); }
  40% { transform: scale(1.12, 0.88); }
  70% { transform: scale(0.94, 1.08); }
  100% { transform: scale(1, 1); }
}

/* 任务完成庆祝动画（桌宠连跳三下） */
.user-theme-pet.ut-celebrate img { animation: ut-pet-celebrate 0.6s ease-in-out 3; }
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
  margin: 0 0 8px;
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
.user-theme-balance:hover { border-color: rgba(109, 158, 208, 0.45); }
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
  border: 0.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12)));
  border-radius: 9px;
  background: var(--dsw-alias-button-elevated-fill, var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.10)));
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
}

/**
 * 构造要贡献的注入行。
 * @returns {Array<object>} IndexInjection 行
 */
function buildInjections() {
  const bgUrl = assetUrl("bg.jpg", assetVersion(ASSETS["bg.jpg"]));
  const pet = {};
  for (const name of PET_FRAMES) {
    pet[name] = assetUrl(`pet/${name}.png`, assetVersion(ASSETS[`pet/${name}.png`]));
  }
  return [
    { kind: "style", text: buildThemeCss() },
    {
      kind: "global",
      name: "__USER_THEME_ASSETS__",
      value: {
        /** 插件自己的 Host 路由前缀（HTTP 客户端用，桌面端由外壳转发） */
        routePrefix: PLUGIN_ROUTE_PREFIX,
        /** 壁纸与桌宠帧的文档相对地址 */
        bg: bgUrl,
        pet,
      },
    },
    // 壁纸 preload：让首帧就有图，避免背景闪一下
    { kind: "html", placement: "head", html: `<link rel="preload" as="image" href="${bgUrl}">` },
  ];
}

export function apply(ctx) {
  // 结构化注入行：桌面外壳与 Web 端 fallback 渲染 index 时都会收集这一批行。
  ctx.on("webserver/index-inject", (table) => {
    try {
      table.push(...buildInjections());
    } catch (err) {
      ctx.logger?.warn?.(`[user-theme] 主题注入失败：${err?.message || err}`);
    }
  });

  ctx.inject(["webServer"], (httpCtx) => {
    // 资源路由（壁纸 / 桌宠帧）/ SSE / 余额代理都挂在注入出来的 webServer 上下文上，
    // 该上下文回收时会自动清掉这些注册。
    for (const dispose of registerAssetRoutes(httpCtx.webServer)) {
      httpCtx.on("dispose", () => dispose());
    }
    setupNotify(httpCtx);
    setupBalance(httpCtx);
  });
}

export default apply;
