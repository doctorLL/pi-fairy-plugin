/**
 * Fairy HDD 浮窗页面。
 *
 * 三件事：
 *   1. 用 Fairy-DSH 的原始 mascot runtime 画眼睛（矢量，不是位图序列）；
 *   2. 轮询插件进程拿会话状态，驱动表情与语音；
 *   3. 开场动画（HDD 时间线）。
 *
 * 语音规则沿用 pi-fairy：优先级抢占、同类变体不紧邻重复、被抢占的不续播。
 */
"use strict";

(function () {
  // ---------------------------------------------------------------- 语音

  /**
   * 声音表：files 是同类变体，priority 越大越强势。
   * 3 = 打断一切；2 = 打断 1；1 = 只在不忙时播。
   */
  const SOUNDS = {
    task_start: {
      files: ["task-start-1.wav", "task-start-2.wav", "task-start-3.wav", "task-start-4.wav"],
      priority: 2,
    },
    success: { files: ["success-1.wav", "success-2.wav", "success-3.wav"], priority: 2 },
    input: { files: ["input.wav"], priority: 3 },
    error: { files: ["error.wav"], priority: 3 },
    network_error: { files: ["network-error.wav"], priority: 3 },
    aborted: { files: ["aborted.wav"], priority: 3 },
    welcome: {
      files: [
        "welcome-1.wav",
        "welcome-2.wav",
        "welcome-3.wav",
        "welcome-4.wav",
        "welcome-5.wav",
        "welcome-6.wav",
        "welcome-7.wav",
      ],
      priority: 2,
    },
    model_switch: { files: ["model-switch.wav"], priority: 1 },
    // 审批：三句随机轮换，最高优先级；点完的结果各配一支电子音。
    permission: { files: ["permission-1.wav", "permission-2.wav", "permission-3.wav"], priority: 3 },
    approved: { files: ["permission-approved.wav"], priority: 3 },
    denied: { files: ["permission-denied.wav"], priority: 3 },
  };

  /** 上一支变体，避免同类连续重复。 */
  const lastVariant = new Map();
  /** 当前在播的 { name, priority, audio }。 */
  let current = null;
  /** 语音总开关，由插件设置控制。 */
  let voiceEnabled = true;

  function soundUrl(file) {
    return "../assets/sounds/" + file;
  }

  /** 挑一个变体，尽量不重复上一支。 */
  function pickVariant(name) {
    const spec = SOUNDS[name];
    if (!spec) return null;
    const files = spec.files;
    let chosen = files[Math.floor(Math.random() * files.length)];
    if (files.length > 1 && chosen === lastVariant.get(name)) {
      chosen = files[(files.indexOf(chosen) + 1) % files.length];
    }
    lastVariant.set(name, chosen);
    return { file: chosen, priority: spec.priority };
  }

  /**
   * 播放一支声音。
   *
   * @param {string} name - SOUNDS 的键。
   */
  function play(name) {
    if (!voiceEnabled) return false;
    const picked = pickVariant(name);
    if (!picked) return false;
    if (current && picked.priority < current.priority) return false; // 低优先级直接丢弃

    stopCurrent();
    const audio = new Audio(soundUrl(picked.file));
    audio.volume = 0.85;
    current = { name, priority: picked.priority, audio };
    audio.addEventListener("ended", () => {
      if (current && current.audio === audio) current = null;
    });
    audio.play().catch(() => {
      // 自动播放被拦或文件缺失：静默放弃，不影响表情
      if (current && current.audio === audio) current = null;
    });
    return true;
  }

  function stopCurrent() {
    if (!current) return;
    try {
      current.audio.pause();
    } catch {
      /* 已结束或已卸载 */
    }
    current = null;
  }

  /**
   * 播放 agent 侧发来的一次性提示音；同一条只播一次。
   *
   * @param {{name:string, at:number}|null|undefined} cue
   */
  function playCue(cue) {
    if (!cue || typeof cue.at !== "number" || cue.at === lastCueAt) return;
    lastCueAt = cue.at;
    // 页面重载后读到的是历史 cue（超过 5 秒），不再补播。
    if (Date.now() - cue.at > 5000) return;
    play(cue.name);
  }

  // ---------------------------------------------------------------- 表情

  const stage = document.getElementById("stage");
  const owner = { active: true, stage };
  let runtime = null;

  /**
   * 会话档位 → mascot 表情。
   * mascot 只有 normal / thinking / comforting 三态，这里按语义归并。
   */
  const STATUS_STATE = {
    0: "thinking", // agent 开始思考
    1: "normal", // 工具执行中
    2: "normal", // 工具完成
    3: "thinking", // 等用户确认
    4: "comforting", // 回合成功
    5: "comforting", // 回合出错
  };

  /** 档位 → 语音（成功的 task_start 由 thinking 延迟触发）；审批走 cue，不在这里。 */
  const STATUS_SOUND = {
    4: "success",
    5: "error",
  };

  let lastState = null;
  let lastStatus = null;
  let taskStartTimer = null;
  /** 已消费的一次性提示音时间，用来去重。 */
  let lastCueAt = 0;

  function setExpression(state) {
    if (lastState === state) return;
    lastState = state;
    stage.setAttribute("data-fairy-state", state);
    // runtime 的 mount 是幂等的，重新调用即可应用新状态
    if (runtime) runtime.mount(stage, owner);
  }

  /**
   * 应用一次状态快照。
   *
   * @param {{status:number,label:string,detail:string,at:number,introAt:number}|null} snapshot
   */
  function applySnapshot(snapshot) {
    if (!snapshot) return;
    if (snapshot.introAt && snapshot.introAt !== lastIntroAt) {
      lastIntroAt = snapshot.introAt;
      playIntro();
    }
    // 一次性提示音（审批请求/批准/拒绝）先处理：与档位无关，不受下面的去重影响。
    playCue(snapshot.cue);
    const status = snapshot.status;
    if (status < 0 || status === lastStatus) return;
    lastStatus = status;

    setExpression(STATUS_STATE[status] || "normal");

    // 回合开始：延迟 500ms 再报，期间若状态已变则取消（避免连点被反复打断）
    if (status === 0) {
      if (taskStartTimer) clearTimeout(taskStartTimer);
      taskStartTimer = setTimeout(() => {
        taskStartTimer = null;
        play("task_start");
      }, 500);
    } else if (taskStartTimer) {
      clearTimeout(taskStartTimer);
      taskStartTimer = null;
    }

    const sound = STATUS_SOUND[status];
    if (sound) play(sound);
  }

  // ---------------------------------------------------------------- 轮询

  const bridge = window.pluginBridge;
  let pollInFlight = false;
  let lastIntroAt = 0;

  async function poll() {
    if (pollInFlight) return;
    if (!bridge || typeof bridge.invoke !== "function") return;
    pollInFlight = true;
    try {
      const snapshot = await bridge.invoke("fairy.state");
      applySnapshot(snapshot);
    } catch {
      /* 通道偶发失败：下一拍再试 */
    } finally {
      pollInFlight = false;
    }
  }

  async function loadSettings() {
    if (!bridge || typeof bridge.invoke !== "function") return;
    try {
      const settings = await bridge.invoke("plugin.getSettings");
      if (settings) {
        voiceEnabled = settings.voiceEnabled !== false;
        if (settings.lowPower) stage.setAttribute("data-fairy-low-power", "true");
        else stage.removeAttribute("data-fairy-low-power");
        if (runtime) runtime.mount(stage, owner);
      }
    } catch {
      /* 设置读不到就用默认值 */
    }
  }

  // ---------------------------------------------------------------- 开场

  /** 开场句柄，重复触发时先取消上一次。 */
  let introHandle = null;

  /** 播 HDD 开场：遮罩时间线 + 欢迎语音。 */
  function playIntro() {
    const layer = document.getElementById("intro");
    const canvas = document.getElementById("introCanvas");
    if (!layer || !canvas || !window.FairyIntro) {
      play("welcome");
      return;
    }
    if (introHandle) introHandle.cancel();
    introHandle = window.FairyIntro.play(canvas, layer, {
      onEnd: () => {
        introHandle = null;
      },
    });
    play("welcome");
  }

  // ---------------------------------------------------------------- 启动

  function boot() {
    if (!window.FairyMascot || typeof window.FairyMascot.createMascotRuntime !== "function") {
      // bundle 没加载：保持窗口透明，不抛错影响宿主
      return;
    }
    runtime = window.FairyMascot.createMascotRuntime();
    runtime.mount(stage, owner);

    loadSettings();
    poll();
    setInterval(poll, 400);
    setInterval(loadSettings, 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
