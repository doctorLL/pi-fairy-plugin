/**
 * Fairy HDD —— PI-Desktop 插件宿主半侧。
 *
 * 职责：
 *   · 开机把透明浮窗拉起来，并提供「显示/隐藏」与「重播开场」命令；
 *   · 给宠物页面提供一个读取通道：agent 扩展写下的状态 + 开场触发信号。
 *
 * 宿主注入全局 `pi`，所有调用受 manifest.permissions 约束。
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

/** 浮窗是否处于打开状态。 */
let opened = false;
/** 延时打开定时器。 */
let openTimer = null;
/** 插件数据目录（首次用到时解析）。 */
let dataPath = null;

/** 主题：本地 id、展示名、基底。宿主里的完整 id 是 plugin:<插件id>:<本地id>。 */
const THEME_ID = "hdd-dark";
const THEME_LABEL = "Fairy HDD";
/** 恢复默认时用的内置偏好（与宿主一致：system / light / dark）。 */
const DEFAULT_PREFERENCE = "dark";
/** 主题 CSS 只在插件加载时读一次，以后重新注册都用这份。 */
let themeCss = null;

/**
 * 注册（或更新）本插件的主题。
 *
 * 运行时注册表在宿主内存里，插件重载后会被清空，所以每次 onLoad 都要重新注册。
 *
 * @returns {Promise<number>} 注册的 CSS 长度。
 */
async function registerTheme() {
  if (!pi.themes || typeof pi.themes.upsert !== "function") {
    throw new Error("当前宿主没有 pi.themes API");
  }
  if (themeCss === null) {
    themeCss = fs.readFileSync(path.join(__dirname, "themes", "hdd-dark.css"), "utf8");
  }
  await pi.themes.upsert({ id: THEME_ID, label: THEME_LABEL, base: "dark", css: themeCss });
  return themeCss.length;
}

/** 宿主里本插件主题的完整 id。 */
function fullThemeId() {
  return "plugin:" + pi.plugin.getId() + ":" + THEME_ID;
}

/** 取插件数据目录（只解析一次）。 */
async function resolveDataPath() {
  if (dataPath === null) dataPath = String(await pi.plugin.getDataPath());
  return dataPath;
}

/** 读一个小 JSON 文件；不存在或损坏都返回 null。 */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * 读 agent 扩展写下的状态，并附带开场触发信号。
 *
 * @returns {Promise<null|{status:number,label:string,detail:string,at:number,introAt:number,cue:null|{name:string,at:number}}>}
 */
async function readState() {
  const dir = await resolveDataPath();
  const state = readJson(path.join(dir, "state.json"));
  const intro = readJson(path.join(dir, "intro.json"));
  const introAt = intro && typeof intro.at === "number" ? intro.at : 0;

  if (!state || typeof state.status !== "number" || typeof state.at !== "number") {
    return introAt ? { status: -1, label: "idle", detail: "", at: 0, introAt } : null;
  }
  return {
    status: state.status,
    label: typeof state.label === "string" ? state.label : "",
    detail: typeof state.detail === "string" ? state.detail : "",
    at: state.at,
    introAt,
    // 一次性提示音（审批请求/批准/拒绝）；页面按 at 去重。
    cue:
      state.cue && typeof state.cue.name === "string" && typeof state.cue.at === "number"
        ? { name: state.cue.name, at: state.cue.at }
        : null,
  };
}

/**
 * 写一个开场触发文件，页面下一次轮询就会看到新的 at 并播开场。
 *
 * 主进程无法直接调用页面里的函数，所以用文件当信号。
 */
async function requestIntro() {
  const dir = await resolveDataPath();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "intro.json"), JSON.stringify({ at: Date.now() }) + "\n", "utf8");
  } catch {
    /* 触发失败不影响插件本身 */
  }
}

/** 打开宠物浮窗。 */
async function showPet() {
  if (opened) return;
  await pi.ui.openPanel({ title: "Fairy HDD" });
  opened = true;
}

/** 排一次延时唤醒；重复调用只保留最后一次。 */
function scheduleShow(delayMs) {
  if (openTimer !== null) clearTimeout(openTimer);
  openTimer = setTimeout(() => {
    openTimer = null;
    showPet().catch((error) => {
      console.error("[fairy-hdd] openPanel failed:", error);
      if (openTimer === null) {
        openTimer = setTimeout(() => {
          openTimer = null;
          showPet().catch(() => {});
        }, 2000);
      }
    });
  }, delayMs);
}

async function onLoad() {
  await pi.commands.register({
    id: "fairy-hdd.toggle",
    title: "桌宠：显示 / 隐藏",
    keywords: ["fairy", "桌宠", "宠物", "fairy-hdd"],
    run: async () => {
      if (opened) {
        await pi.ui.closePanel();
        opened = false;
        return;
      }
      await showPet();
    },
  });

  await pi.commands.register({
    id: "fairy-hdd.test-intro",
    title: "桌宠：重播开场动画",
    keywords: ["intro", "开场", "fairy"],
    run: async () => {
      if (!opened) await showPet();
      await requestIntro();
    },
  });

  // 宿主会在插件加载过程中清理一次面板，延后一拍再开。
  scheduleShow(1200);

  // 写一次开场信号：新窗口首次轮询就能读到 introAt，从而播一次 HDD 开场。
  // 这是"启动就播开场"的唯一触发点，缺了它开场永远不会自动出现。
  await requestIntro();

  // ---- 主题：注册 + 两个切换命令 ----
  // 注册失败不该拖垮桌宠，所以单独兜住。
  try {
    await registerTheme();
  } catch (error) {
    console.error("[fairy-hdd] theme register failed:", error);
  }

  await pi.commands.register({
    id: "fairy-hdd.apply-theme",
    title: "主题：应用 HDD 皮肤",
    keywords: ["theme", "主题", "hdd", "fairy"],
    run: async () => {
      // 宿主只接受「当前已注册」的 id：插件重载后运行时注册表是空的，
      // 所以这里先重新注册一次再应用，而不是假设 onLoad 那次还在。
      await registerTheme();
      await pi.app.setTheme(fullThemeId());
    },
  });

  await pi.commands.register({
    id: "fairy-hdd.reset-theme",
    title: "主题：恢复默认",
    keywords: ["theme", "主题", "reset", "fairy"],
    run: async () => {
      await pi.app.setTheme(DEFAULT_PREFERENCE);
    },
  });
}

/**
 * 宠物页面的自定义通道。
 *
 * @param {string} channel - 通道名。
 */
async function onPanelInvoke(channel) {
  if (channel === "fairy.state") return readState();
  await pi.commands.unregister("fairy-hdd.apply-theme");
  await pi.commands.unregister("fairy-hdd.reset-theme");
  throw new Error("unknown channel: " + channel);
}

async function onUnload() {
  if (openTimer !== null) {
    clearTimeout(openTimer);
    openTimer = null;
  }
  // 先关面板再注销命令：否则热重载后旧窗口会留着旧尺寸（manifest.ui 变更不生效）。
  if (opened) {
    try {
      await pi.ui.closePanel();
    } catch {
      /* 面板可能已被宿主关闭 */
    }
  }
  await pi.commands.unregister("fairy-hdd.toggle");
  await pi.commands.unregister("fairy-hdd.test-intro");
  opened = false;
}

module.exports = { onLoad, onUnload, onPanelInvoke };
