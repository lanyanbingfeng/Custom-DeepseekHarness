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
		function defaultBg() {
			try {
				if (window.__USER_THEME_ASSETS__ && window.__USER_THEME_ASSETS__.defaultBg) {
					return window.__USER_THEME_ASSETS__.defaultBg;
				}
			} catch (e) {}
			return "";
		}
		function resolveBgUrl(s) {
			if (s.background === "custom" && s.customBg) return s.customBg;
			if (s.background === "none") return null;
			return defaultBg();
		}

		function applySettings(s) {
			var doc = document.documentElement;
			var body = document.body;

			setVarOn(doc, "--dsw-font-family", resolveFontFamily(s.fontFamily));

			var fs = s.fontSize;
			var lh = Math.round(fs * 1.75);
			setVarOn(doc, "--dsw-font-markdown-base", fs + "px/" + lh + "px var(--dsw-font-family)");
			setVarOn(doc, "--dsw-font-base-16", fs + "px/" + lh + "px var(--dsw-font-family)");
			setVarOn(doc, "--dsw-font-s-14", (fs - 2) + "px/" + Math.round((fs - 2) * 1.6) + "px var(--dsw-font-family)");
			setVarOn(doc, "--dsw-font-xs-13", (fs - 3) + "px/" + Math.round((fs - 3) * 1.55) + "px var(--dsw-font-family)");

			var bgUrl = resolveBgUrl(s);
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
			setRgba("--dsw-specific-bubble", 44, 44, 46, clamp01(s.inputOpacity - 0.02));
			setRgba("--dsw-specific-menu", 35, 35, 36, clamp01(s.panelOpacity));
			setRgba("--dsw-alias-bg-overlay", 44, 44, 46, clamp01(s.panelOpacity));
		}

		/* ===== 桌宠（vanilla JS 实现，直接挂载 body，不依赖 ReactDOM） ===== */
		function petFrames() {
			try {
				if (window.__USER_THEME_ASSETS__ && window.__USER_THEME_ASSETS__.pet) {
					return window.__USER_THEME_ASSETS__.pet;
				}
			} catch (e) {}
			return null;
		}

		function setupDesktopPet() {
			var frames = petFrames();
			if (!frames || !frames.idle) return;
			if (document.getElementById("user-theme-pet")) return;

			var state = { hovering: false, clicking: false, dragging: false };
			var el = document.createElement("div");
			el.id = "user-theme-pet";
			el.className = "user-theme-pet";
			var img = document.createElement("img");
			img.src = frames.idle;
			img.alt = "";
			el.appendChild(img);
			document.body.appendChild(el);

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
			}

			function setFrame(name) {
				img.src = frames[name] || frames.idle;
			}

			// 待机眨眼：每 2.5~5s 随机触发一次，200ms 后回 idle
			(function scheduleBlink() {
				setTimeout(function () {
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
			window.addEventListener(SETTINGS_EVENT, applyLayout);

			applyLayout();
		}

		/* ===== 任务完成提醒（SSE 消费方 + 可见性上报） ===== */
		var NOTIFY_TEXT = "主人，你的任务完成了哦";
		var PET_API = "/plugins/dsh-plugin-user-theme";
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
					fetch(PET_API + "/pet-config", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(body)
					}).catch(function () {});
				} catch (e) {}
			}, 400);
		}

		function syncSharedConfig() {
			try {
				fetch(PET_API + "/pet-config")
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
						navigator.sendBeacon(PET_API + "/pet-visibility", new Blob([body], { type: "application/json" }));
						return;
					}
					fetch(PET_API + "/pet-visibility", {
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
			function sendSystemNotification() {
				try {
					if (!("Notification" in window)) return;
					if (Notification.permission !== "granted") return;
					var frames = petFrames();
					var n = new Notification("DeepseekHarness 任务完成", {
						body: NOTIFY_TEXT,
						icon: frames && frames.idle ? frames.idle : undefined,
						tag: "user-theme-task-done"
					});
					n.onclick = function () { window.focus(); };
				} catch (e) {}
			}

			// --- 页签回前台时的桌宠庆祝 + 气泡 ---
			function dismissBubble() {
				if (bubbleEl) {
					bubbleEl.remove();
					bubbleEl = null;
				}
				clearTimeout(bubbleTimer);
			}

			function showBubble(pet) {
				dismissBubble();
				bubbleEl = document.createElement("div");
				bubbleEl.className = "user-theme-pet-bubble";
				bubbleEl.textContent = NOTIFY_TEXT;
				document.body.appendChild(bubbleEl);
				var rect = pet.getBoundingClientRect();
				var bw = bubbleEl.offsetWidth;
				var bh = bubbleEl.offsetHeight;
				var left = Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, window.innerWidth - bw - 8));
				var top = rect.top - bh - 12;
				if (top < 8) top = rect.bottom + 12;
				bubbleEl.style.left = left + "px";
				bubbleEl.style.top = top + "px";
				bubbleEl.addEventListener("click", dismissBubble);
				bubbleTimer = setTimeout(dismissBubble, 6000);
			}

			function celebrate() {
				var s = loadSettings();
				if (s.petEnabled === false) return;
				var pet = document.getElementById("user-theme-pet");
				if (!pet) return;
				pet.classList.add("ut-celebrate");
				setTimeout(function () { pet.classList.remove("ut-celebrate"); }, 1900);
				showBubble(pet);
			}

			// --- 事件流 ---
			function handleDone(payload) {
				var s = loadSettings();
				if (s.notifyEnabled === false) return;
				var isTest = payload && payload.test === true;
				if (document.visibilityState === "visible") {
					// 正看着页面，真实事件不打扰；测试事件立即演示
					if (!isTest) return;
					if (s.notifySound !== false) playDingDong();
					celebrate();
					return;
				}
				if (s.notifySound !== false) playDingDong();
				if (s.notifySystem === true) sendSystemNotification();
				pendingCelebration = true;
			}

			try {
				var es = new EventSource(PET_API + "/pet-events");
				es.onmessage = function (ev) {
					var payload;
					try { payload = JSON.parse(ev.data); } catch (e) { return; }
					if (payload && payload.type === "done") handleDone(payload);
				};
				// onerror 无需处理：EventSource 自带指数退避重连
			} catch (e) {}

			document.addEventListener("visibilitychange", function () {
				reportVisibility(false);
				if (document.visibilityState === "visible" && pendingCelebration) {
					pendingCelebration = false;
					celebrate();
				}
			});
			window.addEventListener("pagehide", function () { reportVisibility(true); });
			setInterval(function () { reportVisibility(false); }, 20000);
			reportVisibility(false);
			syncSharedConfig();
		}

		var h = React.createElement;

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
							h("img", { src: defaultBg(), alt: "默认壁纸" })
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
									fetch(PET_API + "/pet-test", { method: "POST" }).catch(function () {});
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

		var inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "user-theme",
				order: 25,
				label: "背景设置"
			}, UserThemeSection));
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", function () {
					setupDesktopPet();
					setupTaskNotify();
				});
			} else {
				setupDesktopPet();
				setupTaskNotify();
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
