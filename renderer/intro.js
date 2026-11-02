/**
 * HDD 开场时间线（Canvas 程序绘制，无位图/无外部依赖）。
 *
 * 相位（秒，总计 10s，参照 pi-fairy 的 IntroSample 谱表）：
 *   0.00 - 0.70  signal   静态噪声铺满
 *   0.70 - 2.70  clock    三列数字时钟浮现，噪声降低
 *   2.70 - 3.40  slip     时钟水平错位滑移
 *   3.40 - 4.90  errors   九个错误窗口逐行斜排出现
 *   4.90 - 6.70  hdd      底部挂载进度条 0 → 100%
 *   6.70 - 6.95  reveal   蓝色过曝闪光
 *   6.95 - 9.30  fade     遮罩淡出，露出眼睛
 *   9.30 - 10.0  end      收起
 *
 * 浮窗只有 340×340，所以这里是"小尺寸 HDD"，不是全屏遮罩版本。
 */
"use strict";

(function () {
  const TOTAL = 10;
  const REVEAL_START = 6.7;
  const FADE_START = 6.95;
  const FADE_END = 9.3;

  const FONT = '"Cascadia Mono", "Consolas", ui-monospace, monospace';
  const INK = "#dceaff";
  const BLUE = "#45c8ff";
  const DIM = "#5c7f96";

  /** 相位边界。 */
  const PHASES = [
    [0.0, "signal"],
    [0.7, "clock"],
    [2.7, "slip"],
    [3.4, "errors"],
    [4.9, "hdd"],
    [6.7, "reveal"],
    [6.95, "hold"],
    [7.8, "fade"],
  ];

  function phaseAt(t) {
    let name = "signal";
    for (const [at, label] of PHASES) {
      if (t >= at) name = label;
    }
    return name;
  }

  /** 0 → 1 的进度，带缓动。 */
  function progress(t, from, to) {
    if (t <= from) return 0;
    if (t >= to) return 1;
    const p = (t - from) / (to - from);
    return p * p * (3 - 2 * p);
  }

  /** 三列时钟文字（时 分 秒，各两位，空格分隔）。 */
  function clockParts(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())];
  }

  /** 画一层静态噪声。 */
  function drawNoise(ctx, w, h, alpha, seed) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const count = Math.floor((w * h) / 220);
    for (let i = 0; i < count; i++) {
      // 用 seed 做伪随机，保证同一帧内稳定
      const r = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      const x = ((r - Math.floor(r)) * w) | 0;
      const r2 = Math.sin(seed * 4.1414 + i * 12.9898) * 43758.5453;
      const y = ((r2 - Math.floor(r2)) * h) | 0;
      const v = ((r * 7) % 1) * 255;
      ctx.fillStyle = "rgba(" + (v | 0) + "," + ((v * 0.9) | 0) + "," + (v | 0) + ",1)";
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  /** 画扫描线。 */
  function drawScanlines(ctx, w, h, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#0a1420";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.restore();
  }

  /** 画三列时钟。 */
  function drawClock(ctx, w, h, parts, slip, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = Math.max(14, Math.round(w * 0.115));
    ctx.font = "600 " + size + "px " + FONT;
    const colW = w * 0.22;
    const cx = w / 2;
    const cy = h * 0.46;
    parts.forEach((text, i) => {
      const x = cx + (i - 1) * colW + slip * (i === 0 ? 1 : i === 2 ? -1 : 0);
      ctx.shadowColor = BLUE;
      ctx.shadowBlur = size * 0.55;
      ctx.fillStyle = INK;
      ctx.fillText(text, x, cy);
      // 列标签
      ctx.shadowBlur = 0;
      ctx.font = "500 " + Math.round(size * 0.34) + "px " + FONT;
      ctx.fillStyle = DIM;
      ctx.fillText(["HOUR", "MIN", "SEC"][i], x, cy + size * 0.95);
      ctx.font = "600 " + size + "px " + FONT;
    });
    ctx.restore();
  }

  /** 画九个错误窗口（逐行递增，斜排）。 */
  function drawErrors(ctx, w, h, count, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const bw = w * 0.19;
    const bh = h * 0.045;
    const x0 = w * 0.1;
    const y0 = h * 0.2;
    const dx = w * 0.075;
    const dy = h * 0.062;
    const messages = [
      "E_SECTOR 0x1A",
      "RETRY 1/3",
      "BAD BLOCK",
      "CRC FAIL",
      "SEEK ERR",
      "HEAD RESET",
      "SPIN DOWN",
      "PARITY",
      "TIMEOUT",
    ];
    for (let i = 0; i < count; i++) {
      const x = x0 + i * dx;
      const y = y0 + i * dy;
      ctx.fillStyle = "rgba(10, 22, 34, 0.82)";
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = "rgba(69, 200, 255, 0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
      ctx.fillStyle = INK;
      ctx.font = "500 " + Math.max(6, Math.round(w * 0.026)) + "px " + FONT;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(messages[i], x + 4, y + bh / 2);
    }
    ctx.restore();
  }

  /** 画底部挂载进度条。 */
  function drawProgress(ctx, w, h, p, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const barW = w * 0.72;
    const barH = Math.max(10, h * 0.045);
    const x = (w - barW) / 2;
    const y = h * 0.78;
    const labelSize = Math.max(7, Math.round(w * 0.028));

    ctx.font = "500 " + labelSize + "px " + FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = DIM;
    ctx.fillText("MOUNTING /fairy", x, y - 6);
    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.fillText(Math.round(p * 100) + "%", x + barW, y - 6);

    ctx.strokeStyle = "rgba(69, 200, 255, 0.5)";
    ctx.lineWidth = 1;
    const segs = 32;
    const filled = Math.floor(p * segs);
    const segW = barW / segs;
    for (let i = 0; i < segs; i++) {
      if (i >= filled) break;
      ctx.fillStyle = i === filled - 1 ? "#bfe8ff" : BLUE;
      ctx.fillRect(x + i * segW + 1, y + 1, segW - 2, barH - 2);
    }
    ctx.restore();
  }

  /** 当前活跃的开场句柄；重复播放会先取消上一次，避免两套 rAF 同时绘制。 */
  let activeHandle = null;

  /**
   * 启动一次开场。
   *
   * @param {HTMLCanvasElement} canvas - 画布。
   * @param {HTMLElement} layer - 遮罩容器（结束后隐藏）。
   * @param {{onEnd?: () => void}} [options]
   * @returns {{cancel: () => void}} 取消句柄。
   */
  function play(canvas, layer, options) {
    if (activeHandle) activeHandle.cancel();
    const opts = options || {};
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let startedAt = performance.now();
    let finished = false;

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = layer.clientWidth || 340;
      const h = layer.clientHeight || 340;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    }

    let size = resize();

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      layer.classList.add("hidden");
      if (activeHandle === handle) activeHandle = null;
      if (opts.onEnd) opts.onEnd();
    }

    function frame(now) {
      const t = (now - startedAt) / 1000;
      if (t >= TOTAL) {
        finish();
        return;
      }
      const { w, h } = size;
      const phase = phaseAt(t);

      // 背板：越来越亮，reveal 时过曝
      ctx.clearRect(0, 0, w, h);
      const revealP = progress(t, REVEAL_START, REVEAL_START + 0.25);
      ctx.fillStyle = revealP > 0 ? "rgba(69, 200, 255, " + revealP.toFixed(3) + ")" : "#05070a";
      ctx.fillRect(0, 0, w, h);

      // 噪声随相位衰减
      const noiseAlpha =
        phase === "signal" ? 0.9 : phase === "clock" ? 0.35 : phase === "slip" ? 0.3 : 0.14;
      if (revealP < 0.5) drawNoise(ctx, w, h, noiseAlpha * (1 - revealP * 2), Math.floor(t * 60));

      // 时钟：3.4s 后交接给错误窗口
      const clockIn = progress(t, 0.7, 1.6);
      const clockOut = 1 - progress(t, 3.2, 3.6);
      if (clockIn > 0 && clockOut > 0) {
        const slip =
          phase === "slip"
            ? Math.sin(t * 34) * (w * 0.035) * (1 - progress(t, 3.2, 3.4))
            : 0;
        drawClock(ctx, w, h, clockParts(new Date()), slip, clockIn * clockOut);
      }

      // 错误窗口：4.95s 后交接给进度条
      const errIn = progress(t, 3.4, 4.6);
      const errOut = 1 - progress(t, 4.7, 4.95);
      if (errIn > 0 && errOut > 0) {
        drawErrors(ctx, w, h, Math.min(9, Math.ceil(errIn * 9)), errOut);
      }

      // 进度条
      const barIn = progress(t, 4.9, 5.2);
      const barOut = 1 - progress(t, 6.5, 6.7);
      if (barIn > 0 && barOut > 0) {
        drawProgress(ctx, w, h, progress(t, 5.0, 6.6), barIn * barOut);
      }

      // 扫描线
      drawScanlines(ctx, w, h, 0.35);

      // 整体淡出
      if (t >= FADE_START) {
        const fade = progress(t, FADE_START, FADE_END);
        ctx.fillStyle = "rgba(5, 7, 10, " + fade.toFixed(3) + ")";
        ctx.fillRect(0, 0, w, h);
      }

      raf = requestAnimationFrame(frame);
    }

    layer.classList.remove("hidden");
    startedAt = performance.now();
    raf = requestAnimationFrame(frame);

    const onResize = () => {
      size = resize();
    };
    window.addEventListener("resize", onResize);

    const handle = {
      cancel() {
        window.removeEventListener("resize", onResize);
        finish();
      },
    };
    activeHandle = handle;
    return handle;
  }

  window.FairyIntro = { play, TOTAL };
})();
