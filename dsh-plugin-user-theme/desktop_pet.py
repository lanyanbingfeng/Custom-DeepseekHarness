# -*- coding: utf-8 -*-
"""DSH 独立桌面宠物（任务完成提醒）。

由 dsh-plugin-user-theme 的 Node 端托管启动，也可手动独立运行：

    python desktop_pet.py --sse http://127.0.0.1:3080/plugins/dsh-plugin-user-theme/pet-events \
        --assets <插件目录>/assets/pet

行为：
  - 平时完全隐藏（无窗口、无托盘，CPU/内存占用趋零）；
  - 通过 SSE 长连接订阅 Node 端的任务完成事件（自动重连，指数退避）；
  - 收到 done 事件且 pageVisible 为 false（没有任何 DSH 页面在被查看，
    包括浏览器已关闭的场景）时，在屏幕右下角弹出强制置顶的透明窗口：
    桌宠弹跳三下 + 圆角气泡「主人，你的任务完成了哦」+ 叮咚提示音；
  - 弹窗常驻最前（每 2s 用 Win32 SetWindowPos 重新断言置顶），
    当用户回到 Harness 页面（服务端广播 visibility 事件）或点击弹窗时收起。

依赖：纯标准库即可运行；若装有 Pillow，则桌宠帧会高质量缩放并
预合成到透明色键（消除 tkinter 直接显示 PNG 时的白底问题）。
"""

import argparse
import http.client
import io
import json
import math
import os
import queue
import socket
import struct
import threading
import time
import tkinter as tk
from urllib.parse import urlparse

try:
    import ctypes

    _user32 = ctypes.windll.user32
    _kernel32 = ctypes.windll.kernel32
    # 64 位下 HWND 是 64 位指针，必须显式声明参数类型，否则 ctypes 默认按
    # 32 位 c_int 传递，SetWindowPos 会拿到被截断的句柄而静默置顶失败。
    _user32.SetWindowPos.argtypes = (
        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_int,
        ctypes.c_int, ctypes.c_int, ctypes.c_uint,
    )
    _user32.SetWindowPos.restype = ctypes.c_int
    _kernel32.OpenProcess.argtypes = (ctypes.c_uint, ctypes.c_int, ctypes.c_uint)
    _kernel32.OpenProcess.restype = ctypes.c_void_p
    _kernel32.WaitForSingleObject.argtypes = (ctypes.c_void_p, ctypes.c_uint)
    _kernel32.WaitForSingleObject.restype = ctypes.c_uint
    _kernel32.CloseHandle.argtypes = (ctypes.c_void_p,)
    _kernel32.CloseHandle.restype = ctypes.c_int
except (ImportError, AttributeError, OSError):  # 非 Windows 平台
    _user32 = None
    _kernel32 = None

try:
    import winsound
except ImportError:  # 非 Windows 平台静默降级为无声
    winsound = None

try:
    from PIL import Image, ImageTk

    HAS_PIL = True
except ImportError:
    HAS_PIL = False

BUBBLE_TEXT_DONE = "主人，你的任务完成了哦"
BUBBLE_TEXT_QUESTION = "主人，有一些问题需要你来定夺"
# 弹窗不再自动消失：只有用户点击弹窗（气泡或桌宠）才收起
WINDOW_W = 260
WINDOW_H = 220
PET_SIZE = 128  # 桌宠显示高度（px）
CHROMA = "#010101"  # 透明色键：此颜色区域完全透明
# 距底边距加大到 80px，确保避开 Windows 任务栏（默认 40px）及可能的系统 UI
MARGIN_BOTTOM = 80

# 气泡样式（与 DSH 主题一致的深蓝点缀）
BUBBLE_FILL = "#ffffff"
BUBBLE_OUTLINE = "#4a8fd6"
BUBBLE_TEXT_COLOR = "#2b3a4a"
BUBBLE_FONT = ("KaiTi", 13)

PET_FRAMES = ["idle", "blink", "wave", "wink", "jump"]


def make_dingdong_wav():
    """内存生成「叮-咚」双音 wav（16-bit 单声道 22050Hz）。"""
    rate = 22050

    def tone(freq, ms, volume=0.5):
        n = int(rate * ms / 1000)
        frames = bytearray()
        for i in range(n):
            # 简单指数衰减包络，避免爆音
            env = math.exp(-3.0 * i / n)
            sample = int(32767 * volume * env * math.sin(2 * math.pi * freq * i / rate))
            frames += struct.pack("<h", sample)
        return frames

    gap = b"\x00\x00" * int(rate * 0.04)
    data = bytes(tone(880, 140) + gap + tone(660, 200))

    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + len(data)))
    buf.write(b"WAVEfmt ")
    buf.write(struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16))
    buf.write(b"data")
    buf.write(struct.pack("<I", len(data)))
    buf.write(data)
    return buf.getvalue()


def play_dingdong():
    if winsound is None:
        return
    try:
        winsound.PlaySound(make_dingdong_wav(), winsound.SND_MEMORY | winsound.SND_ASYNC)
    except Exception:
        pass


def make_parent_alive_checker():
    """返回一个无参函数，判断托管本进程的父进程（Node/DSH）是否仍存活。

    Node 端用 detached 拉起本进程；DSH 异常退出（崩溃/被强杀）时不会执行
    dispose，本进程会残留成僵尸。这里通过父进程句柄轮询，父进程一旦退出就
    返回 False，由调用方自行退出。非 Windows 或探测不可用返回 None。
    """
    if _kernel32 is None:
        return None
    try:
        ppid = os.getppid()
    except Exception:
        return None
    if ppid <= 0:
        return None
    SYNCHRONIZE = 0x00100000
    WAIT_OBJECT_0 = 0x00000000

    def alive():
        try:
            handle = _kernel32.OpenProcess(SYNCHRONIZE, 0, ppid)
            if not handle:
                return False  # 无法打开父进程句柄，视为已退出
            exited = _kernel32.WaitForSingleObject(handle, 0) == WAIT_OBJECT_0
            _kernel32.CloseHandle(handle)
            return not exited
        except Exception:
            return True  # 探测失败时不误杀，保持现状

    return alive


def start_parent_watchdog(alive):
    """父进程退出检测线程：检测到父进程消失则整进程退出，避免僵尸进程。"""
    if alive is None:
        return

    def loop():
        while True:
            time.sleep(5)
            try:
                if not alive():
                    os._exit(0)
            except Exception:
                pass

    threading.Thread(target=loop, daemon=True).start()


def sse_worker(url, events):
    """SSE 订阅线程：断线自动重连（1s → 2s → 5s → … 上限 30s）。"""
    parsed = urlparse(url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 80
    path = parsed.path or "/"
    backoff = 1
    while True:
        conn = None
        try:
            conn = http.client.HTTPConnection(host, port, timeout=35)
            conn.request("GET", path, headers={"Accept": "text/event-stream"})
            resp = conn.getresponse()
            if resp.status != 200:
                raise OSError("SSE HTTP %s" % resp.status)
            backoff = 1  # 连接成功，重置退避
            while True:
                line = resp.readline()
                if not line:
                    raise OSError("SSE stream closed")
                line = line.decode("utf-8", "replace").strip()
                if line.startswith("data:"):
                    try:
                        events.put(json.loads(line[5:].strip()))
                    except ValueError:
                        pass
        except (OSError, socket.timeout, http.client.HTTPException):
            time.sleep(backoff)
            backoff = min(backoff * 2, 30)
        except Exception:
            time.sleep(backoff)
            backoff = min(backoff * 2, 30)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass


def force_topmost(root):
    """Win32 SetWindowPos 强制置顶（tk -topmost 会被其他置顶窗口/焦点抢占压下）。"""
    if _user32 is None:
        return
    try:
        hwnd = root.winfo_id()
        # HWND_TOPMOST=-1, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_SHOWWINDOW=0x43
        _user32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)
    except Exception:
        pass


class DesktopPet:
    def __init__(self, assets_dir):
        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        try:
            self.root.attributes("-toolwindow", True)  # 不占任务栏图标
        except tk.TclError:
            pass
        try:
            self.root.attributes("-transparentcolor", CHROMA)  # Windows 专属色键透明
        except tk.TclError:
            pass
        self.root.configure(bg=CHROMA)

        self.frames = self._load_frames(assets_dir)

        # 圆角气泡（Canvas 绘制：圆角矩形 + 小尾巴 + 文字）
        self.bubble = tk.Canvas(
            self.root,
            width=WINDOW_W - 24,
            height=64,
            bg=CHROMA,
            highlightthickness=0,
            bd=0,
        )
        self._draw_bubble(BUBBLE_TEXT_DONE)

        # 桌宠画面
        self.pet = tk.Label(self.root, bg=CHROMA, bd=0)
        if self.frames:
            self.pet.configure(image=self.frames["idle"])

        # 点击任意位置收起
        for widget in (self.bubble, self.pet):
            widget.bind("<Button-1>", lambda _e: self.hide())

        self._pet_base_y = 0  # 桌宠静止时的 y 坐标（弹跳动画基准）
        self._hop_after_id = None
        self._topmost_after_id = None
        self._visible = False
        self.root.withdraw()

    def _draw_bubble(self, text):
        """在 Canvas 上画圆角气泡：圆角矩形 + 指向桌宠的尾巴 + 文字。"""
        c = self.bubble
        c.delete("all")  # 支持重绘（文案切换时复用）
        w = WINDOW_W - 24
        x1, y1, x2, y2, r = 6, 4, w - 6, 46, 12
        # 圆角矩形（经典 smooth polygon 配方）
        points = [
            x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r,
            x2, y2 - r, x2, y2, x2 - r, y2, x1 + r, y2,
            x1, y2, x1, y2 - r, x1, y1 + r, x1, y1, x1 + r, y1,
        ]
        c.create_polygon(
            points, smooth=True, fill=BUBBLE_FILL,
            outline=BUBBLE_OUTLINE, width=2,
        )
        # 尾巴（同色三角，接缝处用无描边小矩形盖住描边线）
        cx = w // 2
        c.create_polygon(
            cx - 9, y2 - 1, cx + 9, y2 - 1, cx, y2 + 12,
            fill=BUBBLE_FILL, outline=BUBBLE_OUTLINE, width=2,
        )
        c.create_rectangle(cx - 8, y2 - 3, cx + 8, y2 + 1, fill=BUBBLE_FILL, outline="")
        c.create_text(
            w // 2, (y1 + y2) // 2, text=text,
            fill=BUBBLE_TEXT_COLOR, font=BUBBLE_FONT,
        )

    def _load_frames(self, assets_dir):
        """加载桌宠帧。

        有 Pillow：缩放到 PET_SIZE 高度（LANCZOS 高质量）并把 alpha
        预合成到色键色上，彻底规避 tkinter 直接显示 PNG 的白底问题。
        无 Pillow：退回 tk.PhotoImage 原图直读（可能有白底，仅兜底）。
        """
        frames = {}
        if HAS_PIL:
            chroma_rgb = (1, 1, 1)  # 与 CHROMA "#010101" 一致
            for name in PET_FRAMES:
                path = os.path.join(assets_dir, name + ".png")
                try:
                    im = Image.open(path).convert("RGBA")
                    ratio = PET_SIZE / im.height
                    im = im.resize(
                        (max(1, round(im.width * ratio)), PET_SIZE),
                        Image.LANCZOS,
                    )
                    base = Image.new("RGB", im.size, chroma_rgb)
                    base.paste(im, mask=im.split()[3])
                    frames[name] = ImageTk.PhotoImage(base)
                except Exception:
                    pass
        else:
            for name in PET_FRAMES:
                path = os.path.join(assets_dir, name + ".png")
                try:
                    frames[name] = tk.PhotoImage(file=path)
                except Exception:
                    pass
        if not frames.get("idle"):
            return None
        for name in PET_FRAMES:
            frames.setdefault(name, frames["idle"])
        return frames

    def show(self, text=BUBBLE_TEXT_DONE):
        if self._visible:
            # 已在显示：更新文案并重新弹跳 + 响铃，避免漏掉后续事件
            self._draw_bubble(text)
            if self._hop_after_id is not None:
                self.root.after_cancel(self._hop_after_id)
                self._hop_after_id = None
            play_dingdong()
            self._hop(0)
            return
        self._draw_bubble(text)
        self._visible = True
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        x = screen_w - WINDOW_W - 24
        y = screen_h - WINDOW_H - MARGIN_BOTTOM
        self.root.geometry(f"{WINDOW_W}x{WINDOW_H}+{x}+{y}")
        self.bubble.place(x=0, y=4, width=WINDOW_W - 24, height=64)
        self._pet_base_y = WINDOW_H - PET_SIZE - 10
        self.pet.place(
            x=(WINDOW_W - PET_SIZE) // 2, y=self._pet_base_y,
            width=PET_SIZE, height=PET_SIZE,
        )
        self.root.deiconify()
        self.root.update_idletasks()  # 确保窗口已映射，winfo_id() 拿到有效句柄
        self.root.lift()
        force_topmost(self.root)
        play_dingdong()
        self._hop(0)
        self._assert_topmost()  # 显示期间周期性重新断言置顶
        # 收起时机：用户回到 Harness 页面（服务端广播）或手动点击弹窗

    def hide(self):
        if not self._visible:
            return
        self._visible = False
        if self._hop_after_id is not None:
            self.root.after_cancel(self._hop_after_id)
            self._hop_after_id = None
        if self._topmost_after_id is not None:
            self.root.after_cancel(self._topmost_after_id)
            self._topmost_after_id = None
        self.root.withdraw()

    def _assert_topmost(self):
        """置顶断言循环：防止其他窗口抢走最前位置。"""
        if not self._visible:
            return
        self.root.lift()
        force_topmost(self.root)
        self._topmost_after_id = self.root.after(2000, self._assert_topmost)

    def _hop(self, hop_index):
        """弹跳三下：每跳 12 步正弦起落，上升段用 jump 帧。"""
        if not self._visible:
            return
        if hop_index >= 3:
            if self.frames:
                self.pet.configure(image=self.frames["idle"])
            self.pet.place_configure(y=self._pet_base_y)
            return
        if self.frames:
            self.pet.configure(image=self.frames["jump"])
        self._hop_step(hop_index, 0)

    def _hop_step(self, hop_index, step):
        if not self._visible:
            return
        steps = 12
        if step > steps:
            self.pet.place_configure(y=self._pet_base_y)
            if self.frames:
                self.pet.configure(image=self.frames["idle"])
            # 落地稍顿再跳下一次
            self._hop_after_id = self.root.after(120, lambda: self._hop(hop_index + 1))
            return
        dy = -round(20 * math.sin(math.pi * step / steps))
        self.pet.place_configure(y=self._pet_base_y + dy)
        if step > steps // 2 and self.frames:
            self.pet.configure(image=self.frames["idle"])
        self._hop_after_id = self.root.after(28, lambda: self._hop_step(hop_index, step + 1))

    def poll_events(self, events):
        try:
            while True:
                payload = events.get_nowait()
                if not isinstance(payload, dict):
                    continue
                ptype = payload.get("type")
                if payload.get("pageVisible") is False:
                    if ptype == "done":
                        self.show(BUBBLE_TEXT_DONE)
                    elif ptype == "question":
                        self.show(BUBBLE_TEXT_QUESTION)
                elif ptype == "visibility" and payload.get("pageVisible") is True:
                    # 用户回到 Harness 页面，自动收起
                    self.hide()
        except queue.Empty:
            pass
        self.root.after(100, lambda: self.poll_events(events))


def main():
    parser = argparse.ArgumentParser(description="DSH 桌面宠物（任务完成提醒）")
    parser.add_argument("--sse", required=True, help="SSE 事件流 URL")
    parser.add_argument("--assets", required=True, help="桌宠素材目录（含 idle.png 等）")
    args = parser.parse_args()

    # 父进程退出检测：DSH 异常退出时自动退出，避免残留僵尸进程
    start_parent_watchdog(make_parent_alive_checker())

    events = queue.Queue()
    threading.Thread(target=sse_worker, args=(args.sse, events), daemon=True).start()

    pet = DesktopPet(args.assets)
    pet.root.after(100, lambda: pet.poll_events(events))
    pet.root.mainloop()


if __name__ == "__main__":
    main()
