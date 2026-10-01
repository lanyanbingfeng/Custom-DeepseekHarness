window.__ModuleLoader__.load({
	id: "dsh-plugin-user-theme",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var STORAGE_KEY = "user-theme-settings-v1";
		var SETTINGS_EVENT = "user-theme-settings-changed";
		var DEFAULTS = {
			background: "default",
			customBg: null,
			baseOpacity: 0.45,
			sidebarOpacity: 0.48,
			inputOpacity: 0.42,
			panelOpacity: 0.97,
			fontFamily: "KaiTi",
			fontSize: 16,
			petEnabled: true,
			petScale: 110,
			petPosition: null,
			notifyEnabled: true,
			notifyMinDurationSec: 30,
			notifySound: true,
			notifySystem: false,
			desktopPetEnabled: true
		};

		/* ===== 运行时注入的主题基础样式 =====
		 *
		 * 桌面端（DeepSeek Harness 桌面应用）加载的是打包好的静态 index.html，
		 * Host 端的 webServer.tapIndex() 在那边不会执行；可行且唯一的样式通道是
		 * 这一份由客户端在启动时插入 <style> 的样式表（Web 端效果完全一致）。
		 */
		var BASE_CSS = [
			/* 字体族与壁纸地址都在 :root 上，设置面板改动即时生效 */
			':root{--dsw-font-family:var(--ut-font-family,"KaiTi","楷体","STKaiti","华文楷体","Microsoft YaHei",sans-serif)!important;--ut-bg-url:none;}',
			'html,body,#root{background-image:var(--ut-bg-url)!important;background-size:cover!important;background-position:center!important;background-attachment:fixed!important;background-repeat:no-repeat!important;}',
			/* 深色主题：各层半透明 + 深蓝主色 + 面板调实 */
			'body[data-ds-dark-theme]{--dsw-alias-bg-base:rgba(21,21,23,.45)!important;--dsw-alias-bg-layer-1:rgba(35,35,36,.40)!important;--dsw-alias-bg-layer-2:rgba(44,44,46,.38)!important;--dsw-alias-bg-layer-3:rgba(53,54,56,.36)!important;--dsw-specific-sidebar-fill:rgba(27,27,28,.48)!important;--dsw-specific-input-major:rgba(44,44,46,.42)!important;--dsw-specific-menu:rgba(35,35,36,.97)!important;--dsw-alias-bg-overlay:rgba(44,44,46,.97)!important;--dsw-alias-brand-primary:#6d9ed0!important;--dsw-static-deepseek-400:#4a8fd6!important;--dsw-static-deepseek-450:#4a8fd6!important;--dsw-static-deepseek-500:#3b6ea8!important;}',
			'body[data-ds-dark-theme] [class*="dialog"],body[data-ds-dark-theme] [class*="Dialog"],body[data-ds-dark-theme] [class*="modal"],body[data-ds-dark-theme] [class*="Modal"]{background-color:rgba(27,27,28,.98)!important;}',
			/* 设置面板背景走 --dsw-alias-bg-overlay，让「设置面板」透明度滑块真正生效。
			   0.2.0 的面板/弹窗容器用 --dsw-alias-bg-layer-2，而主题把它调成了半透明，
			   于是面板后的内容会透出来；这里把面板与弹窗容器指向同一个可变的不透明色。
			   只按构建产物里真实存在的类名（*_dialog_* / *_panel_* / *_modal_*）匹配。 */
			'body[data-ds-dark-theme] [class*="_dialog_"],body[data-ds-dark-theme] [class*="_panel_"],body[data-ds-dark-theme] [class*="_modal_"]{background-color:var(--dsw-alias-bg-overlay,rgba(44,44,46,.97))!important;}',

			/* ===== 「背景设置」section 内容 ===== */
			'.user-theme-root{color:var(--dsw-alias-label-primary,#e8f0ec);}',
			'.user-theme-root *{font-family:var(--dsw-font-family);}',
			'.user-theme-root .ut-section{margin-bottom:22px;}',
			'.user-theme-root h3{font-size:13px;font-weight:600;margin:0 0 10px 0;color:var(--dsw-alias-label-secondary,#c4d2ca);}',
			'.user-theme-root .ut-row{margin-bottom:12px;}',
			'.user-theme-root .ut-label{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;color:var(--dsw-alias-label-secondary,#c4d2ca);}',
			'.user-theme-root .ut-value{color:var(--dsw-alias-label-primary,#e8f0ec);}',
			'.user-theme-root input[type="range"]{width:100%;height:4px;background:rgba(255,255,255,.12);border-radius:2px;outline:none;-webkit-appearance:none;appearance:none;}',
			'.user-theme-root input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;background:#4a8fd6;border-radius:50%;cursor:pointer;border:2px solid #fff;}',
			'.user-theme-root input[type="range"]::-moz-range-thumb{width:14px;height:14px;background:#4a8fd6;border-radius:50%;cursor:pointer;border:2px solid #fff;}',
			'.user-theme-root .ut-select{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.05));color:var(--dsw-alias-label-primary,#e8f0ec);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 8px;font-size:13px;outline:none;width:100%;}',
			'.user-theme-root .ut-select:focus{border-color:#4a8fd6;}',
			'.user-theme-root .ut-bg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}',
			'.user-theme-root .ut-bg-thumb{cursor:pointer;border-radius:8px;overflow:hidden;aspect-ratio:16/9;transition:border .15s ease;border:2px solid rgba(255,255,255,.08);}',
			'.user-theme-root .ut-bg-thumb:hover{border-color:rgba(255,255,255,.25);}',
			'.user-theme-root .ut-bg-thumb-active{border-color:#4a8fd6;}',
			'.user-theme-root .ut-bg-thumb img{width:100%;height:100%;object-fit:cover;display:block;}',
			'.user-theme-root .ut-custom-badge{margin-top:10px;padding:10px;background:rgba(74,143,214,.12);border:1px solid rgba(74,143,214,.3);border-radius:6px;font-size:12px;color:#6d9ed0;display:flex;justify-content:space-between;align-items:center;}',
			'.user-theme-root .ut-btn{padding:8px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-family:var(--dsw-font-family);transition:background .15s ease,border-color .15s ease;}',
			'.user-theme-root .ut-btn-ghost{background:transparent;border:1px solid rgba(255,255,255,.18);color:var(--dsw-alias-label-primary,#e8f0ec);}',
			'.user-theme-root .ut-btn-ghost:hover{background:rgba(255,255,255,.06);}',
			'.user-theme-root .ut-upload{width:100%;margin-top:10px;border-style:dashed;}',
			'.user-theme-root .ut-footer{padding-top:16px;border-top:1px solid rgba(255,255,255,.08);}',
			'.user-theme-root .ut-toggle{display:flex;justify-content:space-between;align-items:center;font-size:13px;}',
			'.user-theme-root .ut-switch{position:relative;width:36px;height:20px;border-radius:10px;background:rgba(255,255,255,.15);border:none;cursor:pointer;padding:0;transition:background .2s ease;}',
			'.user-theme-root .ut-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s ease;}',
			'.user-theme-root .ut-switch-on{background:#4a8fd6;}',
			'.user-theme-root .ut-switch-on::after{transform:translateX(16px);}',

			/* ===== 桌宠 ===== */
			'.user-theme-pet{position:fixed;z-index:900;user-select:none;-webkit-user-select:none;touch-action:none;cursor:grab;transition:transform .2s ease,filter .2s ease;filter:drop-shadow(0 4px 12px rgba(0,0,0,.35));}',
			'.user-theme-pet:hover{transform:scale(1.08);filter:drop-shadow(0 4px 16px rgba(74,143,214,.55));}',
			'.user-theme-pet.ut-dragging{cursor:grabbing;transform:scale(1.05);transition:none;}',
			'.user-theme-pet img{display:block;height:100%;width:auto;pointer-events:none;animation:ut-pet-breathe 3.2s ease-in-out infinite;transform-origin:50% 100%;}',
			'@keyframes ut-pet-breathe{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}',
			'.user-theme-pet.ut-pop img{animation:ut-pet-pop .5s ease;}',
			'@keyframes ut-pet-pop{0%{transform:scale(1,1);}40%{transform:scale(1.12,.88);}70%{transform:scale(.94,1.08);}100%{transform:scale(1,1);}}',
			'.user-theme-pet.ut-celebrate img{animation:ut-pet-celebrate .6s ease-in-out 3;}',
			'@keyframes ut-pet-celebrate{0%,100%{transform:translateY(0);}40%{transform:translateY(-14px);}}',

			/* ===== 任务完成提醒气泡 ===== */
			'.user-theme-pet-bubble{position:fixed;z-index:1001;max-width:240px;padding:10px 14px;background:rgba(255,255,255,.97);color:#2b3a4a;border-radius:12px;border:1px solid rgba(74,143,214,.45);box-shadow:0 6px 24px rgba(0,0,0,.28);font-size:14px;line-height:1.5;font-family:var(--dsw-font-family);animation:ut-bubble-in .35s ease;}',
			'.user-theme-pet-bubble::after{content:"";position:absolute;bottom:-7px;right:28px;width:12px;height:12px;background:inherit;border-right:1px solid rgba(74,143,214,.45);border-bottom:1px solid rgba(74,143,214,.45);transform:rotate(45deg);}',
			'@keyframes ut-bubble-in{0%{opacity:0;transform:translateY(8px) scale(.92);}100%{opacity:1;transform:translateY(0) scale(1);}}',

			/* ===== 侧边栏余额卡片 ===== */
			'.user-theme-balance{width:100%;box-sizing:border-box;margin:0 0 8px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:linear-gradient(135deg,rgba(74,143,214,.20),rgba(44,44,46,.32));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:var(--dsw-alias-label-primary,#e8f0ec);font-family:var(--dsw-font-family);cursor:default;transition:border-color .15s ease,background .15s ease;}',
			'.user-theme-balance:hover{border-color:rgba(109,158,208,.45);}',
			'.ut-bal-head{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary,#c4d2ca);letter-spacing:.02em;}',
			'.ut-bal-title{display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;}',
			'.ut-bal-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#4a8fd6;box-shadow:0 0 6px rgba(74,143,214,.8);}',
			'.ut-bal-dot.ut-ok{background:#46c98d;box-shadow:0 0 6px rgba(70,201,141,.8);}',
			'.ut-bal-dot.ut-warn{background:#f0a94b;box-shadow:0 0 6px rgba(240,169,75,.8);}',
			'.ut-bal-dot.ut-err{background:#e06a6a;box-shadow:0 0 6px rgba(224,106,106,.8);}',
			'.ut-bal-refresh{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#c4d2ca);cursor:pointer;padding:2px;border-radius:6px;display:inline-flex;align-items:center;line-height:0;}',
			'.ut-bal-refresh:hover{color:#6d9ed0;background:rgba(255,255,255,.06);}',
			'.ut-bal-refresh svg{width:12px;height:12px;display:block;}',
			'.ut-bal-refresh.ut-spinning svg{animation:ut-bal-spin .8s linear infinite;}',
			'@keyframes ut-bal-spin{to{transform:rotate(360deg);}}',
			'.ut-bal-amount{margin-top:4px;font-size:20px;font-weight:600;line-height:1.25;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
			'.ut-bal-amount .ut-bal-currency{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary,#c4d2ca);margin-left:4px;}',
			'.ut-bal-meta{margin-top:3px;font-size:10.5px;color:var(--dsw-alias-label-secondary,#c4d2ca);display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;}',
			'.ut-bal-meta.ut-err-text{color:#e89a9a;}',
			'.ut-bal-meta.ut-muted{opacity:.75;}',
			'.ut-bal-skeleton{margin-top:7px;height:18px;width:100%;border-radius:5px;background:linear-gradient(90deg,rgba(255,255,255,.06) 25%,rgba(255,255,255,.16) 37%,rgba(255,255,255,.06) 63%);background-size:400% 100%;animation:ut-bal-shimmer 1.3s ease infinite;}',
			'@keyframes ut-bal-shimmer{0%{background-position:100% 0;}100%{background-position:0 0;}}',
			'.ut-bal-body{margin-top:6px;display:flex;align-items:stretch;gap:8px;}',
			'.ut-bal-info{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;}',
			'.ut-bal-info .ut-bal-amount{margin-top:0;}',
			'.ut-bal-actions{flex:none;display:flex;flex-direction:column;justify-content:center;gap:5px;}',
			'.ut-bal-action{box-sizing:border-box;height:28px;display:flex;align-items:center;justify-content:center;gap:5px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2,rgba(255,255,255,.12)));border-radius:9px;background:var(--dsw-alias-button-elevated-fill,var(--dsw-alias-bg-layer-2,rgba(255,255,255,.10)));color:var(--dsw-alias-label-primary,#e8f0ec);font-family:inherit;font-size:12px;font-weight:500;line-height:1;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background .15s ease,border-color .15s ease;}',
			'.ut-bal-action:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.18));border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.22));}',
			'.ut-bal-action svg{width:13px;height:13px;flex:none;display:block;}',
			'.user-theme-balance.ut-rail{width:32px;padding:6px 0;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;border-radius:10px;}',
			'.user-theme-balance.ut-rail .ut-bal-head,.user-theme-balance.ut-rail .ut-bal-body{display:none;}',
			'.user-theme-balance.ut-rail .ut-bal-dot{width:9px;height:9px;}'
		].join("\n");

		function injectBaseCss() {
			try {
				if (document.getElementById("user-theme-base")) return;
				var style = document.createElement("style");
				style.id = "user-theme-base";
				style.textContent = BASE_CSS;
				(document.head || document.documentElement).appendChild(style);
			} catch (e) {}
		}

		/* ===== 资源（壁纸 / 桌宠动作帧） =====
		 *
		 * Host 端把资源暴露成插件自己的 HTTP 路由，桌面端由外壳把
		 * `dsh-app://app/plugins/**` 转发给 Host，因此浏览器侧按文档相对地址直接取图即可。
		 * 桌面端不执行 tapIndex，正因为如此这里不再依赖 index 里的 base64 内联。
		 */
		var FALLBACK_ASSETS = {
			routePrefix: "/plugins/dsh-plugin-user-theme",
			bg: "plugins/dsh-plugin-user-theme/assets/bg.jpg",
			pet: {
				idle: "plugins/dsh-plugin-user-theme/assets/pet/idle.png",
				blink: "plugins/dsh-plugin-user-theme/assets/pet/blink.png",
				wave: "plugins/dsh-plugin-user-theme/assets/pet/wave.png",
				wink: "plugins/dsh-plugin-user-theme/assets/pet/wink.png",
				jump: "plugins/dsh-plugin-user-theme/assets/pet/jump.png"
			}
		};
		var ASSET_KEYS = ["idle", "blink", "wave", "wink", "jump"];
		var assetCache = null;

		function assets() {
			if (assetCache) return assetCache;
			var injected = null;
			try { injected = window.__USER_THEME_ASSETS__; } catch (e) {}
			var raw = (injected && typeof injected === "object") ? injected : {};
			var rawPet = raw.pet || {};
			var pet = {};
			var missing = false;
			for (var i = 0; i < ASSET_KEYS.length; i++) {
				var k = ASSET_KEYS[i];
				var v = typeof rawPet[k] === "string" && rawPet[k] ? rawPet[k] : FALLBACK_ASSETS.pet[k];
				pet[k] = v;
				if (!v) missing = true;
			}
			var prefix = typeof raw.routePrefix === "string" && raw.routePrefix
				? (/^\//.test(raw.routePrefix) ? raw.routePrefix : "/" + raw.routePrefix)
				: FALLBACK_ASSETS.routePrefix;
			assetCache = {
				routePrefix: prefix,
				bg: typeof raw.bg === "string" && raw.bg ? raw.bg : FALLBACK_ASSETS.bg,
				pet: missing ? null : pet
			};
			return assetCache;
		}

		/** 插件 Host 路由前缀（SSE / 配置 / 余额接口都用它）。 */
		function apiBase() {
			return assets().routePrefix;
		}

		/** 解析文档相对地址：两种形态（web `/` 与桌面 `dsh-app://app/`）都能取到。 */
		function resolveUrl(url) {
			try { return new URL(url, window.location.href).href; } catch (e) { return url; }
		}

		function loadSettings() {
			try {
				var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
				return Object.assign({}, DEFAULTS, saved);
			} catch (e) {
				return Object.assign({}, DEFAULTS);
			}
		}
		function saveSettings(s) {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
			} catch (e) {}
		}
		function clamp01(v) {
			return Math.max(0, Math.min(1, v));
		}
		function setVarOn(el, prop, value) {
			if (!el) return;
			el.style.setProperty(prop, value, "important");
		}
		function resolveFontFamily(id) {
			if (id === "system") return '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
			if (id === "KaiTi") return '"KaiTi", "楷体", "STKaiti", "华文楷体", "Microsoft YaHei", sans-serif';
			return id;
		}
		function resolveBgUrl(s) {
			if (s.background === "custom" && s.customBg) return s.customBg;
			if (s.background === "none") return null;
			return assets().bg || null;
		}

		function applySettings(s) {
			var doc = document.documentElement;
			var body = document.body;

			/* 字体族走 :root 上的 --ut-font-family（样式表里再喂给 --dsw-font-family） */
			setVarOn(doc, "--ut-font-family", resolveFontFamily(s.fontFamily));

			/* 字号只覆盖 0.2.0 实际存在的排版变量 */
			var fs = s.fontSize;
			var lh = Math.round(fs * 1.75);
			setVarOn(doc, "--dsw-font-markdown-base", fs + "px/" + lh + "px var(--dsw-font-family)");
			setVarOn(doc, "--dsw-font-xs-13", (fs - 2) + "px/" + Math.round((fs - 2) * 1.55) + "px var(--dsw-font-family)");

			/* 壁纸：由样式表的 --ut-bg-url 驱动三层背景，html/body/#root 上再兜一层内联样式 */
			var bgUrl = resolveBgUrl(s);
			setVarOn(doc, "--ut-bg-url", bgUrl ? 'url("' + bgUrl + '")' : "none");
			var els = [doc, body];
			var root = document.getElementById("root");
			if (root) els.push(root);
			for (var j = 0; j < els.length; j++) {
				if (bgUrl) {
					setVarOn(els[j], "background-image", 'url("' + bgUrl + '")');
					els[j].style.setProperty("background-size", "cover", "important");
					els[j].style.setProperty("background-position", "center", "important");
					els[j].style.setProperty("background-attachment", "fixed", "important");
					els[j].style.setProperty("background-repeat", "no-repeat", "important");
				} else {
					els[j].style.setProperty("background-image", "none", "important");
				}
			}

			function setRgba(prop, r, g, b, a) {
				setVarOn(body, prop, "rgba(" + r + ", " + g + ", " + b + ", " + a + ")");
			}
			setRgba("--dsw-alias-bg-base", 21, 21, 23, clamp01(s.baseOpacity));
			setRgba("--dsw-alias-bg-layer-1", 35, 35, 36, clamp01(s.baseOpacity - 0.05));
			setRgba("--dsw-alias-bg-layer-2", 44, 44, 46, clamp01(s.baseOpacity - 0.07));
			setRgba("--dsw-alias-bg-layer-3", 53, 54, 56, clamp01(s.baseOpacity - 0.09));
			setRgba("--dsw-specific-sidebar-fill", 27, 27, 28, clamp01(s.sidebarOpacity));
			setRgba("--dsw-specific-input-major", 44, 44, 46, clamp01(s.inputOpacity));
			setRgba("--dsw-specific-menu", 35, 35, 36, clamp01(s.panelOpacity));
			setRgba("--dsw-alias-bg-overlay", 44, 44, 46, clamp01(s.panelOpacity));
		}

		/* ===== 桌宠（vanilla JS 实现，直接挂载 body，不依赖 ReactDOM） ===== */
		function setupDesktopPet() {
			if (document.getElementById("user-theme-pet")) return;

			var state = { hovering: false, clicking: false, dragging: false, frames: null, onFrames: null };
			var el = document.createElement("div");
			el.id = "user-theme-pet";
			el.className = "user-theme-pet";
			var img = document.createElement("img");
			img.alt = "";
			el.appendChild(img);
			document.body.appendChild(el);

			/* 动作帧按需拉取：拿到 PNG 后转成 blob: URL，
			   换表情时浏览器直接命中原图缓存，不会闪。 */
			var framesPromise = null;
			function frames() {
				if (state.frames) return state.frames;
				if (framesPromise) return null;
				var pet = assets().pet;
				if (!pet) return null;

				var pending = {};
				var keys = Object.keys(pet);
				var remaining = keys.length;
				var done = {};
				framesPromise = Promise.all(keys.map(function (k) {
					return fetch(pet[k], { cache: "force-cache" })
						.then(function (r) {
							if (!r.ok) throw new Error("HTTP " + r.status);
							return r.blob();
						})
						.then(function (b) {
							done[k] = URL.createObjectURL(b);
						})
						.catch(function () {})
						.then(function () { remaining--; });
				})).then(function () {
					if (!done.idle) return null;
					for (var i = 0; i < keys.length; i++) {
						if (!done[keys[i]]) done[keys[i]] = done.idle;
					}
					state.frames = done;
					if (state.onFrames) {
						try { state.onFrames(done); } catch (e) {}
					}
					return done;
				});
				return null;
			}

			function setFrame(name) {
				var f = state.frames || frames();
				if (!f) return;
				img.src = f[name] || f.idle;
			}

			function applyLayout() {
				var s = loadSettings();
				el.style.display = s.petEnabled === false ? "none" : "block";
				el.style.height = (s.petScale || 110) + "px";
				if (s.petPosition && typeof s.petPosition.x === "number") {
					el.style.left = s.petPosition.x + "px";
					el.style.top = s.petPosition.y + "px";
					el.style.right = "auto";
				} else {
					el.style.left = "auto";
					el.style.right = "32px";
					el.style.top = "24px";
				}
				return s;
			}

			var initial = applyLayout();
			if (initial.petEnabled !== false) {
				// 素材拉取完成后再挂首帧（先挂空 img，避免破图图标）
				state.onFrames = function () { setFrame("idle"); };
				frames();
				if (state.frames) state.onFrames(state.frames);
			}

			// 待机眨眼：每 2.5~5s 随机触发一次，200ms 后回 idle
			(function scheduleBlink() {
				setTimeout(function () {
					if (!state.frames) { scheduleBlink(); return; }
					if (!state.dragging && !state.hovering && !state.clicking) {
						setFrame("blink");
						setTimeout(function () {
							if (!state.dragging && !state.hovering && !state.clicking) setFrame("idle");
						}, 200);
					}
					scheduleBlink();
				}, 2500 + Math.random() * 2500);
			})();

			el.addEventListener("mouseenter", function () {
				state.hovering = true;
				if (!state.dragging && !state.clicking) setFrame("wave");
			});
			el.addEventListener("mouseleave", function () {
				state.hovering = false;
				if (!state.dragging && !state.clicking) setFrame("idle");
			});

			// 点击（wink/jump 轮换 + 弹跳）与拖拽（位移 > 6px 判定）区分
			var clickActions = ["wink", "jump"];
			var clickIndex = 0;
			var clickTimer = null;
			var dragStart = null;

			el.addEventListener("pointerdown", function (e) {
				dragStart = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop, moved: false };
				try { el.setPointerCapture(e.pointerId); } catch (err) {}
			});
			el.addEventListener("pointermove", function (e) {
				if (!dragStart) return;
				var dx = e.clientX - dragStart.x;
				var dy = e.clientY - dragStart.y;
				if (!dragStart.moved && dx * dx + dy * dy > 36) {
					dragStart.moved = true;
					state.dragging = true;
					el.classList.add("ut-dragging");
					setFrame("idle");
				}
				if (dragStart.moved) {
					var nx = Math.min(Math.max(dragStart.left + dx, 0), window.innerWidth - el.offsetWidth);
					var ny = Math.min(Math.max(dragStart.top + dy, 0), window.innerHeight - el.offsetHeight);
					el.style.left = nx + "px";
					el.style.top = ny + "px";
					el.style.right = "auto";
				}
			});
			el.addEventListener("pointerup", function () {
				if (!dragStart) return;
				if (dragStart.moved) {
					var s = loadSettings();
					s.petPosition = { x: el.offsetLeft, y: el.offsetTop };
					saveSettings(s);
					state.dragging = false;
					el.classList.remove("ut-dragging");
				} else if (!state.dragging) {
					state.clicking = true;
					setFrame(clickActions[clickIndex % clickActions.length]);
					clickIndex++;
					el.classList.add("ut-pop");
					setTimeout(function () { el.classList.remove("ut-pop"); }, 500);
					clearTimeout(clickTimer);
					clickTimer = setTimeout(function () {
						state.clicking = false;
						setFrame(state.hovering ? "wave" : "idle");
					}, 1200);
				}
				dragStart = null;
			});

			// 拖拽后窗口缩放时把桌宠钳回视口内
			window.addEventListener("resize", function () {
				var s = loadSettings();
				if (!s.petPosition) return;
				var nx = Math.min(el.offsetLeft, window.innerWidth - el.offsetWidth);
				var ny = Math.min(el.offsetTop, window.innerHeight - el.offsetHeight);
				if (nx !== el.offsetLeft || ny !== el.offsetTop) {
					el.style.left = Math.max(0, nx) + "px";
					el.style.top = Math.max(0, ny) + "px";
				}
			});

			// 设置面板改动后实时同步（开关 / 尺寸 / 复位位置）
			window.addEventListener(SETTINGS_EVENT, function () {
				var s = applyLayout();
				// 之前关着、现在打开了 → 这时才去拉素材
				if (s.petEnabled !== false && !state.frames) {
					state.onFrames = function () { setFrame("idle"); };
					frames();
				}
			});
		}

		/* ===== 任务完成提醒（SSE 消费方 + 可见性上报） ===== */
		var NOTIFY_TEXT_DONE = "主人，你的任务完成了哦";
		var NOTIFY_TEXT_QUESTION = "有一些问题需要你来定夺";
		// 本地设置 key → Node 端配置 key（这三项以服务端为权威，多页签/重启共享）
		var SHARED_KEYS = {
			notifyEnabled: "notifyEnabled",
			notifyMinDurationSec: "minDurationSec",
			desktopPetEnabled: "desktopPetEnabled"
		};

		var pushTimer = null;
		function pushSharedConfig(patch) {
			var body = {};
			for (var localKey in SHARED_KEYS) {
				if (patch[localKey] !== undefined) body[SHARED_KEYS[localKey]] = patch[localKey];
			}
			if (!Object.keys(body).length) return;
			clearTimeout(pushTimer);
			pushTimer = setTimeout(function () {
				try {
					fetch(apiBase() + "/pet-config", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(body)
					}).catch(function () {});
				} catch (e) {}
			}, 400);
		}

		function syncSharedConfig() {
			try {
				fetch(apiBase() + "/pet-config")
					.then(function (r) { return r.json(); })
					.then(function (cfg) {
						var s = loadSettings();
						var changed = false;
						if (typeof cfg.notifyEnabled === "boolean" && s.notifyEnabled !== cfg.notifyEnabled) {
							s.notifyEnabled = cfg.notifyEnabled; changed = true;
						}
						if (typeof cfg.minDurationSec === "number" && s.notifyMinDurationSec !== cfg.minDurationSec) {
							s.notifyMinDurationSec = cfg.minDurationSec; changed = true;
						}
						if (typeof cfg.desktopPetEnabled === "boolean" && s.desktopPetEnabled !== cfg.desktopPetEnabled) {
							s.desktopPetEnabled = cfg.desktopPetEnabled; changed = true;
						}
						if (changed) {
							saveSettings(s);
							try { window.dispatchEvent(new Event(SETTINGS_EVENT)); } catch (e) {}
						}
					})
					.catch(function () {});
			} catch (e) {}
		}

		function setupTaskNotify() {
			var audioCtx = null;
			var pendingCelebration = false;
			var pendingCelebrationText = null;
			var bubbleEl = null;
			var bubbleTimer = null;

			// 每个页签一个唯一 clientId
			var clientId;
			try {
				clientId = sessionStorage.getItem("user-theme-tab-id");
				if (!clientId) {
					clientId = "tab-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
					sessionStorage.setItem("user-theme-tab-id", clientId);
				}
			} catch (e) {
				clientId = "tab-" + Math.random().toString(36).slice(2);
			}

			// --- 可见性上报（visibilitychange + 20s 心跳 + 关闭时 sendBeacon） ---
			function reportVisibility(useBeacon) {
				var body = JSON.stringify({ clientId: clientId, visible: document.visibilityState === "visible" });
				try {
					if (useBeacon && navigator.sendBeacon) {
						navigator.sendBeacon(apiBase() + "/pet-visibility", new Blob([body], { type: "application/json" }));
						return;
					}
					fetch(apiBase() + "/pet-visibility", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: body,
						keepalive: true
					}).catch(function () {});
				} catch (e) {}
			}

			// --- 提示音：WebAudio 合成「叮-咚」，首次用户手势时解锁 ---
			function unlockAudio() {
				try {
					var AC = window.AudioContext || window.webkitAudioContext;
					if (!AC) return;
					if (!audioCtx) audioCtx = new AC();
					if (audioCtx.state === "suspended") audioCtx.resume();
				} catch (e) {}
			}
			window.addEventListener("pointerdown", unlockAudio);
			window.addEventListener("keydown", unlockAudio);

			function playDingDong() {
				if (!audioCtx) return;
				try {
					if (audioCtx.state === "suspended") audioCtx.resume();
					var t0 = audioCtx.currentTime;
					[[880, 0, 0.14], [660, 0.18, 0.24]].forEach(function (tone) {
						var osc = audioCtx.createOscillator();
						var gain = audioCtx.createGain();
						osc.type = "sine";
						osc.frequency.value = tone[0];
						gain.gain.setValueAtTime(0.0001, t0 + tone[1]);
						gain.gain.exponentialRampToValueAtTime(0.22, t0 + tone[1] + 0.02);
						gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone[1] + tone[2]);
						osc.connect(gain);
						gain.connect(audioCtx.destination);
						osc.start(t0 + tone[1]);
						osc.stop(t0 + tone[1] + tone[2] + 0.05);
					});
				} catch (e) {}
			}

			// --- 系统通知 ---
			function sendSystemNotification(text, title) {
				try {
					if (!("Notification" in window) || Notification.permission !== "granted") return;
					var n = new Notification(title || "DeepSeek Harness", {
						body: text,
						icon: assets().pet ? assets().pet.idle : undefined,
						tag: "user-theme-task"
					});
					n.onclick = function () {
						try { window.focus(); } catch (e) {}
						try { n.close(); } catch (e) {}
					};
				} catch (e) {}
			}

			// --- 气泡 + 庆祝动画 ---
			function showBubble(text) {
				var pet = document.getElementById("user-theme-pet");
				if (!pet) return;
				if (bubbleEl) { try { bubbleEl.remove(); } catch (e) {} bubbleEl = null; }
				clearTimeout(bubbleTimer);
				var b = document.createElement("div");
				b.className = "user-theme-pet-bubble";
				b.textContent = text;
				document.body.appendChild(b);
				var r = pet.getBoundingClientRect();
				var bw = b.offsetWidth;
				var left = Math.min(Math.max(r.left + r.width / 2 - bw / 2, 8), window.innerWidth - bw - 8);
				var top = Math.max(r.top - b.offsetHeight - 10, 8);
				b.style.left = left + "px";
				b.style.top = top + "px";
				bubbleEl = b;
				bubbleTimer = setTimeout(function () {
					if (bubbleEl === b) {
						try { b.remove(); } catch (e) {}
						bubbleEl = null;
					}
				}, 6000);
			}

			function celebrate(text) {
				var pet = document.getElementById("user-theme-pet");
				if (pet) {
					pet.classList.add("ut-celebrate");
					setTimeout(function () { pet.classList.remove("ut-celebrate"); }, 1900);
				}
				showBubble(text);
			}

			function handleEvent(payload) {
				var s = loadSettings();
				if (s.notifyEnabled === false) return;
				var text = payload.type === "question" ? NOTIFY_TEXT_QUESTION : NOTIFY_TEXT_DONE;
				// 页面可见时直接就地提醒；不可见时先记着，等用户回来再庆祝
				if (document.visibilityState === "visible" || payload.pageVisible === false) {
					if (document.visibilityState === "visible") {
						celebrate(text);
						if (s.notifySound !== false) playDingDong();
						if (s.notifySystem === true) sendSystemNotification(text, "任务完成");
					} else {
						if (s.notifySound !== false) playDingDong();
						if (s.notifySystem === true) sendSystemNotification(text, "任务完成");
						pendingCelebration = true;
						pendingCelebrationText = text;
					}
				} else {
					if (s.notifySound !== false) playDingDong();
					if (s.notifySystem === true) sendSystemNotification(text, "任务完成");
					pendingCelebration = true;
					pendingCelebrationText = text;
				}
			}

			try {
				var es = new EventSource(apiBase() + "/pet-events?clientId=" + encodeURIComponent(clientId));
				es.onmessage = function (ev) {
					var payload;
					try { payload = JSON.parse(ev.data); } catch (e) { return; }
					if (payload && (payload.type === "done" || payload.type === "question")) handleEvent(payload);
				};
				// onerror 无需处理：EventSource 自带指数退避重连
			} catch (e) {}

			document.addEventListener("visibilitychange", function () {
				reportVisibility(false);
				if (document.visibilityState === "visible" && pendingCelebration) {
					pendingCelebration = false;
					celebrate(pendingCelebrationText || NOTIFY_TEXT_DONE);
					pendingCelebrationText = null;
				}
			});
			window.addEventListener("pagehide", function () { reportVisibility(true); });
			setInterval(function () { reportVisibility(false); }, 20000);
			reportVisibility(false);
			syncSharedConfig();
		}

		var h = React.createElement;

		/* ===== 侧边栏 DeepSeek 余额卡片 ===== */
		var BALANCE_REFRESH_MS = 5 * 60 * 1000;

		function formatMoney(n) {
			if (n == null || isNaN(n)) return "--";
			var s = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2);
			// 千分位
			var parts = s.split(".");
			parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			return parts.join(".");
		}
		function currencyLabel(currency) {
			if (currency === "CNY") return "元";
			return currency || "";
		}
		function formatTime(ts) {
			if (!ts) return "";
			var d = new Date(ts);
			var p = function (x) { return (x < 10 ? "0" : "") + x; };
			return p(d.getHours()) + ":" + p(d.getMinutes());
		}

		// 余额来源是 DSH 的 DeepSeek 账号（不再用 API Key）；
		// 未登录时给出可点击的提示，并顺带尝试直达设置面板的「账号」页。
		function balanceFailureText(data) {
			if (!data) return "查询失败";
			if (data.code === "NO_ACCOUNT") return "未登录 DeepSeek 账号 · 点此登录";
			if (data.code === "NO_ACCOUNT_SERVICE") return "当前组合无账号服务";
			if (data.code === "NO_WALLET") return "账号暂无钱包余额";
			if (data.code === "UNAUTHORIZED") return "登录已失效 · 请重新登录";
			return data.message || "查询失败";
		}

		/**
		 * 尽力把用户送到「设置 → 账号」：DSH 没有公开的编程式导航接口，
		 * 所以先找侧边栏设置入口点开设置面板，再依次点带“账号”文案的条目。
		 * 任何一步找不到就静默放弃（提示文案本身已经说明了该去哪里）。
		 */
		function openAccountSettings() {
			try {
				var clicked = false;
				var nodes = document.querySelectorAll("button,[role='button'],[role='tab'],a");
				for (var i = 0; i < nodes.length; i++) {
					var text = (nodes[i].textContent || "").trim();
					if (text === "设置" || /^Settings$/.test(text)) {
						nodes[i].click();
						clicked = true;
						break;
					}
				}
				if (!clicked) return;
				// 等面板挂载后再点「账号」
				setTimeout(function () {
					try {
						var items = document.querySelectorAll("button,[role='button'],[role='tab'],a,li");
						for (var j = 0; j < items.length; j++) {
							var label = (items[j].textContent || "").trim();
							if (label === "账号" || /^Account$/.test(label)) {
								items[j].click();
								return;
							}
						}
					} catch (e) {}
				}, 260);
			} catch (e) {}
		}

		var RefreshIcon = h("svg", { viewBox: "0 0 24 24", width: 12, height: 12, fill: "none",
			stroke: "currentColor", "strokeWidth": 2.2, "strokeLinecap": "round", "strokeLinejoin": "round" },
			h("path", { d: "M21 12a9 9 0 1 1-2.64-6.36" }),
			h("path", { d: "M21 3v6h-6" })
		);
		// API 用量：柱状图（尺寸由 .ut-bal-action svg 控制，保持 13px 紧凑）
		var ChartIcon = h("svg", { viewBox: "0 0 24 24", fill: "none",
			stroke: "currentColor", "strokeWidth": 2, "strokeLinecap": "round", "strokeLinejoin": "round" },
			h("path", { d: "M3 3v18h18" }),
			h("path", { d: "M8 17v-5" }),
			h("path", { d: "M13 17V8" }),
			h("path", { d: "M18 17v-3" })
		);
		// 在线对话：气泡
		var ChatIcon = h("svg", { viewBox: "0 0 24 24", fill: "none",
			stroke: "currentColor", "strokeWidth": 2, "strokeLinecap": "round", "strokeLinejoin": "round" },
			h("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" })
		);
		var QUICK_LINKS = [
			{ label: "用量明细", title: "DeepSeek 开放平台 · 用量明细", url: "https://platform.deepseek.com/usage", icon: ChartIcon },
			{ label: "在线对话", title: "DeepSeek 对话平台", url: "https://chat.deepseek.com/", icon: ChatIcon }
		];
		// 卡片内部右侧的两个小填充按钮：刷新按钮下方、余额数字右边，纵向堆叠。
		function BalanceActions() {
			return h("div", { className: "ut-bal-actions" },
				QUICK_LINKS.map(function (item) {
					return h("a", {
						key: item.url,
						className: "ut-bal-action",
						href: item.url,
						target: "_blank",
						rel: "noopener noreferrer",
						title: item.title
					}, item.icon, h("span", { className: "ut-bal-action-label" }, item.label));
				})
			);
		}

		function BalanceCard(props) {
			var wide = props.wide !== false;
			var dataState = React.useState(null); // { ok, balance, currency, at, code, message, ... }
			var data = dataState[0];
			var setData = dataState[1];
			var loadingState = React.useState(true);
			var loading = loadingState[0];
			var setLoading = loadingState[1];

			var load = React.useCallback(function (force) {
				setLoading(true);
				fetch(apiBase() + "/balance" + (force ? "?refresh=1" : ""), { headers: { Accept: "application/json" } })
					.then(function (r) { return r.json(); })
					.then(function (j) { setData(j); })
					.catch(function () { setData({ ok: false, code: "FETCH_FAILED", message: "网络错误" }); })
					.then(function () { setLoading(false); });
			}, []);

			React.useEffect(function () {
				load(false);
				var timer = setInterval(function () { load(false); }, BALANCE_REFRESH_MS);
				var onVis = function () { if (!document.hidden) load(false); };
				document.addEventListener("visibilitychange", onVis);
				return function () {
					clearInterval(timer);
					document.removeEventListener("visibilitychange", onVis);
				};
			}, [load]);

			// 折叠轨道态：只留状态圆点，hover 显示文字提示
			if (!wide) {
				var railTitle = "DeepSeek 账号余额";
				if (loading && !data) railTitle = "查询余额中…";
				else if (data && data.ok) railTitle = "余额 " + formatMoney(data.balance) + " " + currencyLabel(data.currency);
				else if (data) railTitle = balanceFailureText(data);
				var railDot = "ut-bal-dot " + (loading && !data ? "" : !data ? "" : data.ok ? (data.balance != null && data.balance < 5 ? "ut-warn" : "ut-ok") : "ut-err");
				return h("div", { className: "user-theme-balance ut-rail", title: railTitle, role: "status" },
					h("span", { className: railDot })
				);
			}

			var dotCls = "ut-bal-dot ";
			var metaLine = null;
			if (loading && !data) {
				dotCls += "";
			} else if (!data) {
				dotCls += "ut-err";
			} else if (data.ok) {
				dotCls += data.balance != null && data.balance < 5 ? "ut-warn" : "ut-ok";
				metaLine = h("div", { className: "ut-bal-meta ut-muted" },
					"更新于 " + formatTime(data.at) + (data.bonus ? " · 含赠送 " + formatMoney(data.bonus) : ""));
			} else {
				dotCls += "ut-err";
				var needSignIn = data.code === "NO_ACCOUNT" || data.code === "NO_ACCOUNT_SERVICE";
				metaLine = h("div", {
					className: "ut-bal-meta ut-err-text",
					title: data.message || "",
					onClick: needSignIn ? openAccountSettings : undefined,
					style: needSignIn ? { cursor: "pointer", textDecoration: "underline" } : undefined
				}, balanceFailureText(data));
			}

			return h("div", { className: "user-theme-balance", role: "status" },
				h("div", { className: "ut-bal-head" },
					h("span", { className: "ut-bal-title" },
						h("span", { className: dotCls }),
						"DeepSeek 账号余额"
					),
					h("button", {
						className: "ut-bal-refresh" + (loading ? " ut-spinning" : ""),
						title: "刷新余额",
						onClick: function (e) { e.stopPropagation(); load(true); }
					}, RefreshIcon)
				),
				h("div", { className: "ut-bal-body" },
					h("div", { className: "ut-bal-info" },
						(loading && !data)
							? h("div", { className: "ut-bal-skeleton" })
							: h("div", { className: "ut-bal-amount" },
								(data && data.ok)
									? [formatMoney(data.balance), h("span", { className: "ut-bal-currency", key: "c" }, currencyLabel(data.currency))]
									: "--"
							),
						metaLine
					),
					h(BalanceActions)
				)
			);
		}

		// 滑块行
		function SliderRow(props) {
			return h("div", { className: "ut-row" },
				h("div", { className: "ut-label" },
					h("span", null, props.label),
					h("span", { className: "ut-value" }, props.display)
				),
				h("input", {
					type: "range",
					min: props.min,
					max: props.max,
					step: props.step,
					value: props.value,
					onChange: function (e) {
						props.onChange(parseFloat(e.target.value));
					}
				})
			);
		}

		function UserThemeSection() {
			var state = React.useState(loadSettings);
			var settings = state[0];
			var setSettings = state[1];

			React.useEffect(function () {
				applySettings(settings);
				// eslint-disable-next-line
			}, []);

			// 多页签同步：其他标签改动 localStorage 时，同步本标签的 UI 与行为
			React.useEffect(function () {
				function onStorage(e) {
					if (e.key !== STORAGE_KEY) return;
					try {
						var fresh = loadSettings();
						setSettings(fresh);
						applySettings(fresh);
						window.dispatchEvent(new Event(SETTINGS_EVENT));
					} catch (err) {}
				}
				window.addEventListener("storage", onStorage);
				return function () { window.removeEventListener("storage", onStorage); };
			}, []);

			function update(patch) {
				var next = Object.assign({}, settings, patch);
				setSettings(next);
				saveSettings(next);
				applySettings(next);
				pushSharedConfig(patch);
				try { window.dispatchEvent(new Event(SETTINGS_EVENT)); } catch (e) {}
			}

			function reset() {
				var ok = true;
				try {
					ok = window.confirm("确定要重置所有背景设置为默认吗？");
				} catch (e) {}
				if (!ok) return;
				var next = Object.assign({}, DEFAULTS);
				setSettings(next);
				saveSettings(next);
				applySettings(next);
				try { window.dispatchEvent(new Event(SETTINGS_EVENT)); } catch (e) {}
			}

			function upload() {
				var input = document.createElement("input");
				input.type = "file";
				input.accept = "image/*";
				input.onchange = function (ev) {
					var file = ev.target.files && ev.target.files[0];
					if (!file) return;
					if (file.size > 2 * 1024 * 1024) {
						window.alert("图片不能超过 2MB");
						return;
					}
					var reader = new FileReader();
					reader.onload = function (rev) {
						try {
							update({ background: "custom", customBg: rev.target.result });
						} catch (err) {
							window.alert("图片太大，保存失败（localStorage 限制约 5MB）");
						}
					};
					reader.readAsDataURL(file);
				};
				input.click();
			}

			var usingCustom = settings.background === "custom" && settings.customBg;

			return h("div", { className: "user-theme-root" },

				h("section", { className: "ut-section" },
					h("h3", null, "背景图"),
					h("div", { className: "ut-bg-grid" },
						h("div", {
							className: "ut-bg-thumb" + (settings.background === "default" ? " ut-bg-thumb-active" : ""),
							title: "默认壁纸",
							onClick: function () {
								update({ background: "default", customBg: null });
							}
						},
							h("img", { src: assets().bg, alt: "默认壁纸" })
						)
					),
					usingCustom
						? h("div", { className: "ut-custom-badge" },
							h("span", null, "已使用自定义图片"),
							h("button", {
								className: "ut-btn ut-btn-ghost",
								onClick: function () {
									update({ background: "default", customBg: null });
								}
							}, "清除")
						)
						: h("button", { className: "ut-btn ut-btn-ghost ut-upload", onClick: upload }, "+ 上传自定义图片（≤ 2MB）")
				),

				h("section", { className: "ut-section" },
					h("h3", null, "UI 透明度"),
					h(SliderRow, {
						label: "主区域背景",
						value: settings.baseOpacity,
						min: 0, max: 1, step: 0.05,
						display: settings.baseOpacity.toFixed(2),
						onChange: function (v) { update({ baseOpacity: v }); }
					}),
					h(SliderRow, {
						label: "侧边栏",
						value: settings.sidebarOpacity,
						min: 0, max: 1, step: 0.05,
						display: settings.sidebarOpacity.toFixed(2),
						onChange: function (v) { update({ sidebarOpacity: v }); }
					}),
					h(SliderRow, {
						label: "输入框",
						value: settings.inputOpacity,
						min: 0, max: 1, step: 0.05,
						display: settings.inputOpacity.toFixed(2),
						onChange: function (v) { update({ inputOpacity: v }); }
					}),
					h(SliderRow, {
						label: "设置面板",
						value: settings.panelOpacity,
						min: 0, max: 1, step: 0.05,
						display: settings.panelOpacity.toFixed(2),
						onChange: function (v) { update({ panelOpacity: v }); }
					})
				),

				h("section", { className: "ut-section" },
					h("h3", null, "字体"),
					h("div", { className: "ut-row" },
						h("div", { className: "ut-label" },
							h("span", null, "字体族")
						),
						h("select", {
							className: "ut-select",
							value: settings.fontFamily,
							onChange: function (e) { update({ fontFamily: e.target.value }); }
						},
							h("option", { value: "KaiTi" }, "楷体"),
							h("option", { value: "system" }, "系统默认")
						)
					),
					h(SliderRow, {
						label: "字体大小",
						value: settings.fontSize,
						min: 13, max: 20, step: 1,
						display: settings.fontSize + "px",
						onChange: function (v) { update({ fontSize: v }); }
					})
				),

				h("section", { className: "ut-section" },
					h("h3", null, "桌宠"),
					h("div", { className: "ut-row" },
						h("div", { className: "ut-toggle" },
							h("span", null, "显示桌宠"),
							h("button", {
								className: "ut-switch" + (settings.petEnabled !== false ? " ut-switch-on" : ""),
								"aria-label": "显示桌宠",
								onClick: function () { update({ petEnabled: settings.petEnabled === false }); }
							})
						)
					),
					settings.petEnabled !== false
						? h(SliderRow, {
							label: "桌宠大小",
							value: settings.petScale,
							min: 60, max: 160, step: 5,
							display: settings.petScale + "px",
							onChange: function (v) { update({ petScale: v }); }
						})
						: null,
					settings.petPosition
						? h("button", {
							className: "ut-btn ut-btn-ghost ut-upload",
							onClick: function () { update({ petPosition: null }); }
						}, "复位桌宠位置")
						: null
				),

				h("section", { className: "ut-section" },
					h("h3", null, "任务完成提醒"),
					h("div", { className: "ut-row" },
						h("div", { className: "ut-toggle" },
							h("span", null, "任务完成时提醒我"),
							h("button", {
								className: "ut-switch" + (settings.notifyEnabled !== false ? " ut-switch-on" : ""),
								"aria-label": "任务完成时提醒我",
								onClick: function () { update({ notifyEnabled: settings.notifyEnabled === false }); }
							})
						)
					),
					settings.notifyEnabled !== false
						? h(SliderRow, {
							label: "最短提醒耗时",
							value: settings.notifyMinDurationSec || 30,
							min: 5, max: 300, step: 5,
							display: (settings.notifyMinDurationSec || 30) + " 秒",
							onChange: function (v) { update({ notifyMinDurationSec: v }); }
						})
						: null,
					settings.notifyEnabled !== false
						? h("div", { className: "ut-row" },
							h("div", { className: "ut-toggle" },
								h("span", null, "提示音"),
								h("button", {
									className: "ut-switch" + (settings.notifySound !== false ? " ut-switch-on" : ""),
									"aria-label": "提示音",
									onClick: function () { update({ notifySound: settings.notifySound === false }); }
								})
							)
						)
						: null,
					settings.notifyEnabled !== false
						? h("div", { className: "ut-row" },
							h("div", { className: "ut-toggle" },
								h("span", null, "系统通知（需授权）"),
								h("button", {
									className: "ut-switch" + (settings.notifySystem === true ? " ut-switch-on" : ""),
									"aria-label": "系统通知",
									onClick: function () {
										var enabling = settings.notifySystem !== true;
										if (enabling && "Notification" in window && Notification.permission === "default") {
											try { Notification.requestPermission(); } catch (e) {}
										}
										update({ notifySystem: enabling });
									}
								})
							)
						)
						: null,
					settings.notifyEnabled !== false
						? h("div", { className: "ut-row" },
							h("div", { className: "ut-toggle" },
								h("span", null, "桌面宠物（独立置顶窗口）"),
								h("button", {
									className: "ut-switch" + (settings.desktopPetEnabled !== false ? " ut-switch-on" : ""),
									"aria-label": "桌面宠物",
									onClick: function () { update({ desktopPetEnabled: settings.desktopPetEnabled === false }); }
								})
							)
						)
						: null,
					settings.notifyEnabled !== false
						? h("button", {
							className: "ut-btn ut-btn-ghost ut-upload",
							onClick: function () {
								try {
									fetch(apiBase() + "/pet-test", { method: "POST" }).catch(function () {});
								} catch (e) {}
							}
						}, "测试提醒效果")
						: null
				),

				h("div", { className: "ut-footer" },
					h("button", { className: "ut-btn ut-btn-ghost", onClick: reset }, "重置默认")
				)
				);
				}

		/* Cordis 服务依赖：本插件只用官方 slots 服务注册到 settings.section /
		 * sidebar.footer.action 两个座位，座位本身由已随发行版启用的客户端插件提供，
		 * 因此这里只声明真正用到的服务。
		 * 注意：不能在这里（或 package.json 的 dsh.client.inject 里）写包名——
		 * 那种 inject 是 Cordis 的服务键，写成包名会让 fiber 永远停在 pending，
		 * 浏览器启动审计会以「entry did not activate」让整个应用启动失败。 */
		var inject = ["slots"];

		function apply(ctx) {
			injectBaseCss();

			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "user-theme",
				order: 25,
				label: "背景设置"
			}, UserThemeSection));

			// 侧边栏底部（设置按钮上方）的 DeepSeek 余额卡片。
			// owner props: { wide } —— 折叠成轨道时只渲染状态圆点。
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "user-theme-balance",
				order: 10
			}, BalanceCard));

			function init() {
				try { applySettings(loadSettings()); } catch (e) {}
				setupDesktopPet();
				setupTaskNotify();
			}

			// apply() 在启动图物化后运行，DOM 可能还没 ready（首屏 #root 之后才建 body 结构）
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", init);
			} else {
				init();
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
