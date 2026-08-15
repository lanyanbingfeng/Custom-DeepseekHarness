window.__ModuleLoader__.load({
	id: "dsh-plugin-user-theme",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var STORAGE_KEY = "user-theme-settings-v1";
		var DEFAULTS = {
			background: "default",
			customBg: null,
			baseOpacity: 0.45,
			sidebarOpacity: 0.48,
			inputOpacity: 0.42,
			panelOpacity: 0.97,
			fontFamily: "KaiTi",
			fontSize: 16
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
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
