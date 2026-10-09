// 高精度本地日期工具函数 (避免中国标准时间 UTC+8 凌晨 00:00~08:00 与 UTC 产生跨天漂移)
function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ==========================================================================
// 26英语六级通关学习站 · 旗舰全能版 (前端核心交互驱动引擎)
// 借鉴 Google, GitHub, Notion 优秀交互与排版设计
// 包含：字体无级缩放、艾宾浩斯抗遗忘矩阵、极速闪视流/3D闪卡、无依赖伴学白噪音番茄钟、
//       写作升维沙盒、形合翻译对比、听力音频原文、仔细阅读证据链、7周学习闭环
// ==========================================================================

const STORAGE_KEY = "FENGKUANG_CET6_V4";
const OLD_STORAGE_KEY = "CET6_FLAGSHIP_SYSTEM_V3";

let userState = {
  fontScale: 1.0,        // 1.0, 1.15, 1.30, 1.45
  darkMode: false,
  currentTab: "pomodoro",
  learned: {},           // { [wordId]: { first: bool, firstTime: number, short: [bool,bool,bool], long: [bool,bool,bool,bool], star: bool } }
  speedFlash: {
    currentUnit: 11,
    mode: "flash",       // "flash" | "3d"
    speed: 1.5,          // 1.0, 1.5, 2.0, 3.0
    currentIndex: 0,
    isPlaying: false
  },
  pomo: {
    mode: "focus",       // "focus" | "exam" | "short" | "long" | "custom"
    timeLeft: 25 * 60,
    totalTime: 25 * 60,
    isRunning: false,
    todayTomatoes: 0,
    totalFocusMins: 0,
    customMins: 25,
    autoFlow: false,
    overtimeCount: false,
    overtimeSecs: 0
  },
  maskedMeaning: false,
  mindmapOpen: true,
  currentUnit: 1,
  currentLesson: 1,
  filterStarred: false,
  filterUnlearned: false,
  searchQuery: "",
  habits: {
    morning: false,
    daytime: false,
    evening: false
  },
  streakDays: 1,
  lastActiveDate: "",
  midnightSnapshots: [],
  lastMidnightBackup: "",
  reminders: {
    enabled: true,
    systemNotification: false,
    pomoEnd: true,
    morningEnabled: true,
    morningTime: "07:30",
    daytimeEnabled: true,
    daytimeTime: "14:00",
    eveningEnabled: true,
    eveningTime: "21:00",
    eyeCareEnabled: true,
    lastMorningDate: "",
    lastDaytimeDate: "",
    lastEveningDate: "",
    lastEyeCareCheckMins: 0
  },
  planGoal: {
    enabled: true,
    targetDays: 30,
    startDate: "",
    customDays: 30,
    todayLearnedIds: {},
    todayDate: "",
    eveningCheckEnabled: true
  },
  streakHistory: {},
  streakFreezes: 1,
  filterDue: false,
  searchHistory: [],
  hotSearchTags: [
    { label: "🌟 抱负", term: "ambition" },
    { label: "📈 经济", term: "economic" },
    { label: "🌱 生态", term: "environment" },
    { label: "⚡ 科技", term: "technology" }
  ]
};

// --- 1. 数据存档加载与持久化 ---
function loadState() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(OLD_STORAGE_KEY);
      if (raw) localStorage.setItem(STORAGE_KEY, raw);
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      userState = { ...userState, ...parsed };
      if (parsed.pomo) userState.pomo = { ...userState.pomo, ...parsed.pomo, isRunning: false };
      if (parsed.speedFlash) userState.speedFlash = { ...userState.speedFlash, ...parsed.speedFlash, isPlaying: false };
    }
  } catch (e) {
    console.error("加载存档失败", e);
  }

  // 检查打卡连续天数 (Streak Days)
  const today = new Date().toISOString().slice(0, 10);
  if (!userState.lastActiveDate) {
    userState.lastActiveDate = today;
  } else if (userState.lastActiveDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (userState.lastActiveDate === yesterday) {
      // 连续打卡
    } else {
      userState.streakDays = 1;
    }
    // 重置今日习惯打卡
    userState.habits = { morning: false, daytime: false, evening: false };
    userState.lastActiveDate = today;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userState));
  } catch (e) {
    console.error("保存存档失败", e);
  }
}

// --- 2. 全局字体大小调节器 (解决看花眼问题) ---
function setFontScale(scale) {
  scale = parseFloat(scale);
  if (scale < 0.85) scale = 0.85;
  if (scale > 1.6) scale = 1.6;
  userState.fontScale = scale;
  document.documentElement.style.setProperty("--font-scale", scale);

  document.querySelectorAll(".font-btn").forEach(btn => {
    const btnScale = parseFloat(btn.dataset.scale);
    btn.classList.toggle("active", Math.abs(btnScale - scale) < 0.05);
  });
  saveState();
}

function zoomFont(delta) {
  const newScale = Math.round((userState.fontScale + delta) * 100) / 100;
  setFontScale(newScale);
}

// --- 3. 深色/浅色模式切换 ---
function toggleDarkMode() {
  userState.darkMode = !userState.darkMode;
  document.body.classList.toggle("dark-mode", userState.darkMode);
  const btn = document.getElementById("btnDarkMode");
  if (btn) btn.innerHTML = userState.darkMode ? "☀️ 日间暖燕麦" : "🌙 夜间深黛黑";
  saveState();
}

// --- 4. Web Audio API 原生物理环境音合成 (零外部音频依赖) ---
let audioCtx = null;
let ambientSource = null;
let ambientGain = null;
let currentAmbientType = "none";

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playChime() {
  initAudio();
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc1.type = "sine"; osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
  osc2.type = "sine"; osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime); // A5
  gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 3.8);
  osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination);
  osc1.start(); osc2.start();
  osc1.stop(audioCtx.currentTime + 3.8); osc2.stop(audioCtx.currentTime + 3.8);
}

function setAmbientSound(type) {
  initAudio();
  if (ambientSource) {
    try { ambientSource.stop(); ambientSource.disconnect(); } catch (e) {}
    ambientSource = null;
  }
  currentAmbientType = type;
  ["none", "rain", "fire", "wind"].forEach(t => {
    const btn = document.getElementById("btnSound" + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle("active", t === type);
  });
  if (type === "none") return;

  const bufferSize = audioCtx.sampleRate * 2;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0.0;

  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    if (type === "rain") {
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 1.8;
    } else if (type === "fire") {
      const crackle = Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.9 : 0;
      lastOut = (lastOut + 0.04 * white) / 1.04;
      data[i] = lastOut * 0.8 + crackle;
    } else if (type === "wind") {
      lastOut = (lastOut + 0.008 * white) / 1.008;
      data[i] = lastOut * 3.2;
    }
  }

  ambientSource = audioCtx.createBufferSource();
  ambientSource.buffer = buffer;
  ambientSource.loop = true;
  ambientGain = audioCtx.createGain();
  ambientGain.gain.setValueAtTime(0.22, audioCtx.currentTime);
  ambientSource.connect(ambientGain);
  ambientGain.connect(audioCtx.destination);
  ambientSource.start();
}

// --- 5. 纯单轨零延迟本地极速超清朗读引擎 (Zero-Latency Local Neural Engine) ---
let activeSpeechUtterance = null;
let speechWatchdogTimer = null;
let cachedBestVoices = { us: null, uk: null };

// 音频设置偏好
if (!userState.audioPref) {
  userState.audioPref = {
    accent: "us", // "us" (美音) | "uk" (英音)
    rate: 1.0     // 0.8, 1.0, 1.2
  };
}

// 文本深度净化函数：过滤词性缩写、音标斜杠、中文说明、括号符号
function cleanTextForSpeech(text) {
  if (!text) return "";
  let s = String(text);
  // 去除中文汉字与全角中文标点
  s = s.replace(/[\u4e00-\u9fa5\u3000-\u303f\uff01-\uff5e]/g, " ");
  // 去除词性缩写与语法标记 (如 v., n., adj., vt.)
  s = s.replace(/\b(v|n|adj|adv|vt|vi|prep|conj|pron|art|num|pl|sing|sb|sth)\b\.?/gi, " ");
  // 去除音标斜杠与各种括号中的非单词内容
  s = s.replace(/\/.*?\/|\[.*?\]|\(.*?\)|【.*?】/g, " ");
  // 去除多余特殊符号并整理空格
  s = s.replace(/[#*~_`^]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

// 预先缓存并智能优选系统最高品质的英语自然母语音色 (0ms 查表)
function cacheBestVoices() {
  if (!("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices() || [];
  if (voices.length === 0) return;

  function findVoice(accent) {
    const targetLang = accent === "uk" ? "en-GB" : "en-US";
    const preferredNames = accent === "uk"
      ? ["Ryan", "Sonia", "Libby", "Google UK English Female", "Google UK English Male", "Daniel", "Oliver", "George"]
      : ["Jenny", "Guy", "Aria", "Google US English", "Samantha", "Zira", "David", "Ava", "Andrew"];

    // 坚决过滤中文引擎（严防机械中文发音拼读英文口音）
    const englishVoices = voices.filter(v => {
      const lang = (v.lang || "").toLowerCase();
      const name = (v.name || "").toLowerCase();
      return (lang.startsWith("en") || lang.includes("us") || lang.includes("gb")) &&
             !name.includes("chinese") && !name.includes("huihui") && !name.includes("kangkang") && !name.includes("yaoyao");
    });

    if (englishVoices.length === 0) return voices[0] || null;

    // 优先匹配高质量自然语音
    for (const pName of preferredNames) {
      const match = englishVoices.find(v => v.name.includes(pName) || (v.voiceURI && v.voiceURI.includes(pName)));
      if (match) return match;
    }

    // 匹配带有 Natural / Online / Neural 关键字
    const naturalMatch = englishVoices.find(v => {
      const n = (v.name + " " + (v.voiceURI || "")).toLowerCase();
      return (n.includes("natural") || n.includes("neural") || n.includes("online")) && v.lang.toLowerCase().includes(accent === "uk" ? "gb" : "us");
    });
    if (naturalMatch) return naturalMatch;

    // 匹配语言代码
    const langMatch = englishVoices.find(v => v.lang.toLowerCase().replace("_", "-").startsWith(targetLang.toLowerCase()));
    if (langMatch) return langMatch;

    return englishVoices[0];
  }

  cachedBestVoices.us = findVoice("us");
  cachedBestVoices.uk = findVoice("uk");
}

// 浏览器就绪时即刻预热语音列表与音频上下文 (实现 0ms 首次点击响应)
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = cacheBestVoices;
  cacheBestVoices();
}

// 停止所有发音与动画
function stopAllSpeech() {
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
  if (speechWatchdogTimer) {
    clearInterval(speechWatchdogTimer);
    speechWatchdogTimer = null;
  }
  document.querySelectorAll(".audio-speaking-active").forEach(el => {
    el.classList.remove("audio-speaking-active");
  });
}

// 【单轨极速发音核心函数】(零网络请求、零等待、毫秒级响应、连贯清晰)
function speakWord(text, btnElement) {
  if (!text || !("speechSynthesis" in window)) return;

  // 1. 瞬时打断前一个发音，实现指哪打哪的极速切歌体验
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}

  if (speechWatchdogTimer) {
    clearInterval(speechWatchdogTimer);
    speechWatchdogTimer = null;
  }

  // 2. 文本净化：剥除所有词性、标点与杂音
  const clean = cleanTextForSpeech(text);
  if (!clean) return;

  // 3. 视觉声波高亮激活
  let activeBtn = btnElement || (typeof window !== "undefined" && window.event && window.event.currentTarget);
  if (activeBtn && activeBtn.classList) {
    document.querySelectorAll(".audio-speaking-active").forEach(el => el.classList.remove("audio-speaking-active"));
    activeBtn.classList.add("audio-speaking-active");
  }

  const cleanupVisual = () => {
    if (activeBtn && activeBtn.classList) {
      activeBtn.classList.remove("audio-speaking-active");
    }
  };

  // 4. 构建发音实例，直读本地预热音色 (0ms 延迟)
  const accent = (userState.audioPref && userState.audioPref.accent) || "us";
  const rate = (userState.audioPref && userState.audioPref.rate) || 1.0;

  const utter = new SpeechSynthesisUtterance(clean);
  utter.rate = rate;
  utter.pitch = 1.0;
  utter.lang = accent === "uk" ? "en-GB" : "en-US";

  // 查表取出预热好的最佳母语音色
  if (!cachedBestVoices[accent]) cacheBestVoices();
  const voice = cachedBestVoices[accent];
  if (voice) utter.voice = voice;

  let isEnded = false;
  utter.onend = () => {
    if (!isEnded) {
      isEnded = true;
      if (speechWatchdogTimer) clearInterval(speechWatchdogTimer);
      cleanupVisual();
    }
  };

  utter.onerror = () => {
    if (!isEnded) {
      isEnded = true;
      if (speechWatchdogTimer) clearInterval(speechWatchdogTimer);
      cleanupVisual();
    }
  };

  // 5. 保持活跃引用并立即触发本地发音 (完全不需要走任何网络，瞬间发声)
  activeSpeechUtterance = utter;
  window.speechSynthesis.speak(utter);

  // 6. 兜底看门狗（应对极长真题例句，防止 Chrome 引擎后台挂起）
  speechWatchdogTimer = setInterval(() => {
    if (!window.speechSynthesis.speaking) {
      clearInterval(speechWatchdogTimer);
      cleanupVisual();
    } else {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 10000);
}

// 切换发音口音偏好 (美音 / 英音)
function toggleAudioAccent() {
  if (!userState.audioPref) userState.audioPref = { accent: "us", rate: 1.0 };
  userState.audioPref.accent = userState.audioPref.accent === "us" ? "uk" : "us";
  saveState();
  updateAudioPrefUI();
  // 即刻测试新口音
  speakWord(userState.audioPref.accent === "uk" ? "British English" : "American English");
  showToast(userState.audioPref.accent === "uk" ? "🇬🇧 已切换为【英音】极速本地发音！" : "🇺🇸 已切换为【美音】极速本地发音！");
}

// 切换发音语速 (0.8x / 1.0x / 1.2x)
function cycleAudioRate() {
  if (!userState.audioPref) userState.audioPref = { accent: "us", rate: 1.0 };
  const current = userState.audioPref.rate || 1.0;
  let next = 1.0;
  if (current === 1.0) next = 0.8;
  else if (current === 0.8) next = 1.2;
  else next = 1.0;

  userState.audioPref.rate = next;
  saveState();
  updateAudioPrefUI();
  showToast(`⚡ 朗读语速已设为【${next}x】！`);
}

// 更新顶栏发音配置胶囊
function updateAudioPrefUI() {
  const accentBtn = document.getElementById("headerAudioAccentBtn");
  const rateBtn = document.getElementById("headerAudioRateBtn");
  if (!userState.audioPref) userState.audioPref = { accent: "us", rate: 1.0 };

  if (accentBtn) {
    accentBtn.innerHTML = userState.audioPref.accent === "uk" ? "<span>🇬🇧</span> 英音" : "<span>🇺🇸</span> 美音";
    accentBtn.title = `当前发音：${userState.audioPref.accent === "uk" ? "英音 (BBC标准)" : "美音 (CNN标准)"}，点击切换`;
  }
  if (rateBtn) {
    rateBtn.innerHTML = `<span>⚡</span> ${userState.audioPref.rate || 1.0}x`;
    rateBtn.title = `当前语速：${userState.audioPref.rate || 1.0}x，点击循环切换 (0.8x/1.0x/1.2x)`;
  }
}

// 暴露全局挂载
if (typeof window !== "undefined") {
  window.speakWord = speakWord;
  window.cleanTextForSpeech = cleanTextForSpeech;
  window.toggleAudioAccent = toggleAudioAccent;
  window.cycleAudioRate = cycleAudioRate;
  window.updateAudioPrefUI = updateAudioPrefUI;
}

// --- 6. 统一导航 Tab 切换 ---
function switchTab(tabId) {
  userState.currentTab = tabId;
  document.querySelectorAll(".tab-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-content").forEach(sec => {
    sec.classList.toggle("active", sec.id === "tab-" + tabId);
  });

  const capsule = document.getElementById("floatingCapsule");
  if (capsule) {
    capsule.style.display = tabId === "pomodoro" ? "none" : "flex";
  }

  if (tabId === "vocab") renderVocabSection();
  if (tabId === "flash") renderFlashWorkspace();
  if (tabId === "planner") renderPlannerSection();
  if (tabId === "backup") renderBackupSection();

  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { try { window.scrollTo(0, 0); } catch(e2){} }
  }
  saveState();
}

// --- 7. 番茄心流工坊逻辑 (Pomodoro · 自由时长调节与智能自动心流) ---
let pomoTimerInterval = null;

function setPomoMode(mode) {
  userState.pomo.mode = mode;
  let mins = 25;
  if (mode === "exam") mins = 30;
  if (mode === "short") mins = 5;
  if (mode === "long") mins = 15;
  if (mode === "custom") mins = userState.pomo.customMins || 25;

  userState.pomo.totalTime = mins * 60;
  userState.pomo.timeLeft = mins * 60;
  userState.pomo.overtimeSecs = 0;
  userState.pomo.isRunning = false;
  clearInterval(pomoTimerInterval);

  document.querySelectorAll(".pomo-mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  // 同步滑块与数字显示
  updateSliderAndDisplay(mins);

  updatePomoDisplay();
  saveState();
}

// 自由时长步进调节 (支持加减 1m 或 5m)
function adjustPomoMinutes(deltaMins) {
  if (!userState.pomo.isRunning) {
    let curMins = Math.round(userState.pomo.totalTime / 60);
    let targetMins = Math.max(1, Math.min(120, curMins + deltaMins));
    setCustomPomoTime(targetMins);
  } else {
    // 运行中心流实时延展加时 (加减在当前剩余时间上)
    let addedSecs = deltaMins * 60;
    userState.pomo.timeLeft = Math.max(0, userState.pomo.timeLeft + addedSecs);
    userState.pomo.totalTime = Math.max(userState.pomo.timeLeft, userState.pomo.totalTime + addedSecs);
    updatePomoDisplay();
    saveState();
  }
}

// 滑块与输入直接设置时长 (1~120分钟)
function setCustomPomoTime(mins) {
  mins = Math.max(1, Math.min(120, parseInt(mins) || 25));
  userState.pomo.customMins = mins;
  userState.pomo.mode = "custom";
  userState.pomo.totalTime = mins * 60;
  userState.pomo.timeLeft = mins * 60;
  userState.pomo.overtimeSecs = 0;
  userState.pomo.isRunning = false;
  clearInterval(pomoTimerInterval);

  document.querySelectorAll(".pomo-mode-btn").forEach(btn => btn.classList.remove("active"));

  updateSliderAndDisplay(mins);
  updatePomoDisplay();
  saveState();
}

function onPomoSliderInput(val) {
  const dispEl = document.getElementById("pomoDurationDisplay");
  if (dispEl) dispEl.textContent = val;
}

function onPomoSliderChange(val) {
  setCustomPomoTime(val);
}

function updateSliderAndDisplay(mins) {
  const slider = document.getElementById("pomoDurationSlider");
  const dispEl = document.getElementById("pomoDurationDisplay");
  if (slider) slider.value = mins;
  if (dispEl) dispEl.textContent = mins;
}

// 智能自适应开关
function toggleAutoFlow(checked) {
  userState.pomo.autoFlow = checked;
  saveState();
}

function toggleOvertimeCount(checked) {
  userState.pomo.overtimeCount = checked;
  saveState();
}

function togglePomodoro() {
  userState.pomo.isRunning = !userState.pomo.isRunning;
  const startBtn = document.getElementById("pomoStartBtn");
  if (userState.pomo.isRunning) {
    if (startBtn) startBtn.innerHTML = "⏸️ 暂停专注";
    pomoTimerInterval = setInterval(() => {
      if (userState.pomo.timeLeft > 0) {
        userState.pomo.timeLeft--;
        if (userState.pomo.mode !== "short" && userState.pomo.mode !== "long") {
          userState.pomo.totalFocusMins += (1 / 60);
        }
        updatePomoDisplay();
      } else {
        // 时间耗尽处理
        if (userState.pomo.overtimeCount) {
          // 超时心流模式：继续顺数累加
          userState.pomo.overtimeSecs = (userState.pomo.overtimeSecs || 0) + 1;
          if (userState.pomo.mode !== "short" && userState.pomo.mode !== "long") {
            userState.pomo.totalFocusMins += (1 / 60);
          }
          updatePomoDisplay();
        } else {
          onPomoComplete();
        }
      }
    }, 1000);
  } else {
    if (startBtn) startBtn.innerHTML = "▶️ 开始专注";
    clearInterval(pomoTimerInterval);
  }
}

function resetPomodoro() {
  const studiedSecs = userState.pomo.totalTime - userState.pomo.timeLeft;
  const savedState = {
    timeLeft: userState.pomo.timeLeft,
    totalTime: userState.pomo.totalTime,
    overtimeSecs: userState.pomo.overtimeSecs || 0,
    wasRunning: userState.pomo.isRunning
  };

  clearInterval(pomoTimerInterval);
  userState.pomo.isRunning = false;
  userState.pomo.overtimeSecs = 0;
  userState.pomo.timeLeft = userState.pomo.totalTime;
  const startBtn = document.getElementById("pomoStartBtn");
  if (startBtn) startBtn.innerHTML = "▶️ 开始专注";
  updatePomoDisplay();

  // 如果已经专注了超过 30 秒，提供撤销急救胶囊！
  if (studiedSecs >= 30) {
    const mins = Math.floor(savedState.timeLeft / 60);
    const secs = savedState.timeLeft % 60;
    const pad = (n) => String(n).padStart(2, "0");
    registerUndoAction(`已重置番茄钟 (原剩 ${pad(mins)}:${pad(secs)})`, () => {
      userState.pomo.timeLeft = savedState.timeLeft;
      userState.pomo.totalTime = savedState.totalTime;
      userState.pomo.overtimeSecs = savedState.overtimeSecs;
      updatePomoDisplay();
      if (savedState.wasRunning) togglePomodoro();
    }, 8000);
  }
}

function skipPomodoro() {
  clearInterval(pomoTimerInterval);
  userState.pomo.isRunning = false;
  onPomoComplete();
}

function onPomoComplete() {
  playChime();
  const wasFocus = userState.pomo.mode !== "short" && userState.pomo.mode !== "long";
  if (wasFocus) {
    userState.pomo.todayTomatoes = (userState.pomo.todayTomatoes || 0) + 1;
    defendTodayStreak("pomo", 1);
  }
  updateHeaderStats();

  // 检查是否开启了“自动连转模式”
  if (userState.pomo.autoFlow) {
    if (wasFocus) {
      alert("🎉 本段专注完成！已自动收割番茄，系统将为您自动切换并启动 5 分钟课间短休...");
      setPomoMode("short");
      togglePomodoro();
    } else {
      alert("☕ 休息结束！身心已舒展，系统将自动切换并重新开启专注心流...");
      setPomoMode("focus");
      togglePomodoro();
    }
  } else {
    alert("🎉 🎉 恭喜完成一段专注！疯狂过六级，每一分心流都在种下高分，已收获大红番茄 🍅！");
    resetPomodoro();
  }
  saveState();
}

function updatePomoDisplay() {
  let timeStr = "";
  if (userState.pomo.overtimeSecs && userState.pomo.overtimeSecs > 0) {
    const om = Math.floor(userState.pomo.overtimeSecs / 60);
    const os = userState.pomo.overtimeSecs % 60;
    timeStr = `+${String(om).padStart(2, "0")}:${String(os).padStart(2, "0")}`;
  } else {
    const m = Math.floor(userState.pomo.timeLeft / 60);
    const s = userState.pomo.timeLeft % 60;
    timeStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  const timerEl = document.getElementById("pomoTimerText");
  if (timerEl) timerEl.textContent = timeStr;

  const capsuleEl = document.getElementById("capsuleTimerText");
  if (capsuleEl) capsuleEl.textContent = timeStr;

  // SVG 环形进度
  const circle = document.getElementById("pomoRingProg");
  if (circle) {
    const total = userState.pomo.totalTime || 1500;
    const progress = Math.max(0, (total - userState.pomo.timeLeft) / total);
    const circumference = 2 * Math.PI * 116; // r=116
    const offset = circumference * (1 - progress);
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = offset;
  }

  // 5阶段植物生长机制
  const progressRatio = (userState.pomo.totalTime - userState.pomo.timeLeft) / userState.pomo.totalTime;
  let plantEmoji = "🌱";
  let stageName = "阶段一：播种期 (🌱)";
  if (userState.pomo.overtimeSecs > 0) {
    plantEmoji = "🍅🌟";
    stageName = "心流超频期 (🍅🌟 持续累加)";
  } else {
    if (progressRatio >= 0.25) { plantEmoji = "🌿"; stageName = "阶段二：破土发芽 (🌿)"; }
    if (progressRatio >= 0.50) { plantEmoji = "🌼"; stageName = "阶段三：迎风开花 (🌼)"; }
    if (progressRatio >= 0.75) { plantEmoji = "🍏"; stageName = "阶段四：结出青果 (🍏)"; }
    if (progressRatio >= 1.00) { plantEmoji = "🍅"; stageName = "阶段五：硕果累累 (🍅)"; }
  }

  const plantEl = document.getElementById("plantEmojiLarge");
  if (plantEl) plantEl.textContent = plantEmoji;
  const badgeEl = document.getElementById("plantStageBadge");
  if (badgeEl) badgeEl.textContent = stageName;

  // 同步智能开关状态
  const chkFlow = document.getElementById("chkAutoFlow");
  const chkOver = document.getElementById("chkOvertimeCount");
  if (chkFlow) chkFlow.checked = Boolean(userState.pomo.autoFlow);
  if (chkOver) chkOver.checked = Boolean(userState.pomo.overtimeCount);

  updateHeaderStats();
}

function updateHeaderStats() {
  const tomatoCountEl = document.getElementById("headerTomatoCount");
  if (tomatoCountEl) tomatoCountEl.textContent = userState.pomo.todayTomatoes || 0;

  const streakDaysEl = document.getElementById("headerStreakDays");
  if (streakDaysEl) streakDaysEl.textContent = userState.streakDays || 1;

  const harvestBasketEl = document.getElementById("harvestBasketDisplay");
  if (harvestBasketEl) {
    const tomatoes = userState.pomo.todayTomatoes || 0;
    if (tomatoes === 0) {
      harvestBasketEl.textContent = "今日暂未收获番茄，快开启第一个专注吧！";
    } else {
      harvestBasketEl.textContent = "🍅 ".repeat(Math.min(tomatoes, 40)) + ` (共 ${tomatoes} 颗)`;
    }
  }
}

// --- 8. 艾宾浩斯核心词库模块 (思维导图 / 派生词树 / 7+1矩阵 / 释义自测) ---
function initVocabSelectors() {
  const unitSelect = document.getElementById("vocabUnitSelect");
  const lessonSelect = document.getElementById("vocabLessonSelect");
  if (!unitSelect || !lessonSelect || !window.CET6_DATA || !window.CET6_DATA.coreUnits) return;

  unitSelect.innerHTML = "";
  window.CET6_DATA.coreUnits.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.unit;
    opt.textContent = u.title;
    if (u.unit === userState.currentUnit) opt.selected = true;
    unitSelect.appendChild(opt);
  });

  updateLessonOptions();
}

function updateLessonOptions() {
  const unitSelect = document.getElementById("vocabUnitSelect");
  const lessonSelect = document.getElementById("vocabLessonSelect");
  if (!unitSelect || !lessonSelect) return;

  const currentU = window.CET6_DATA.coreUnits.find(u => u.unit === parseInt(unitSelect.value));
  lessonSelect.innerHTML = "";
  if (currentU && currentU.lessons) {
    currentU.lessons.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.lesson;
      opt.textContent = `Lesson ${l.lesson} · ${l.theme}`;
      if (l.lesson === userState.currentLesson) opt.selected = true;
      lessonSelect.appendChild(opt);
    });
  }
}

function onVocabUnitChange() {
  const unitSelect = document.getElementById("vocabUnitSelect");
  userState.currentUnit = parseInt(unitSelect.value);
  userState.currentLesson = 1;
  updateLessonOptions();
  renderVocabSection();
  saveState();
}

function onVocabLessonChange() {
  const lessonSelect = document.getElementById("vocabLessonSelect");
  userState.currentLesson = parseInt(lessonSelect.value);
  renderVocabSection();
  saveState();
}

function toggleMindmap() {
  userState.mindmapOpen = !userState.mindmapOpen;
  const drawer = document.getElementById("mindmapDrawer");
  const btn = document.getElementById("btnToggleMindmap");
  if (drawer) drawer.classList.toggle("open", userState.mindmapOpen);
  if (btn) btn.classList.toggle("active", userState.mindmapOpen);
  saveState();
}

function toggleMaskMeaning() {
  userState.maskedMeaning = !userState.maskedMeaning;
  document.body.classList.toggle("masked-meaning", userState.maskedMeaning);
  const btn = document.getElementById("btnMaskMeaning");
  if (btn) {
    btn.classList.toggle("active", userState.maskedMeaning);
    btn.innerHTML = userState.maskedMeaning ? "👁️ 已开启遮挡自测" : "👁️ 遮挡中文释义";
  }
  saveState();
}

function toggleStarredFilter() {
  userState.filterStarred = !userState.filterStarred;
  const btn = document.getElementById("btnFilterStarred");
  if (btn) btn.classList.toggle("active", userState.filterStarred);
  renderVocabSection();
  saveState();
}

function toggleUnlearnedFilter() {
  userState.filterUnlearned = !userState.filterUnlearned;
  const btn = document.getElementById("btnFilterUnlearned");
  if (btn) btn.classList.toggle("active", userState.filterUnlearned);
  renderVocabSection();
  saveState();
}

function onVocabSearch(query) {
  userState.searchQuery = query.trim().toLowerCase();
  renderVocabSection();
  recordStreakActivity(1);
  defendTodayStreak("word", 1);
}

function renderVocabSection() {
  if (!window.CET6_DATA || !window.CET6_DATA.coreUnits) return;
  initVocabSelectors();

  const currentU = window.CET6_DATA.coreUnits.find(u => u.unit === userState.currentUnit);
  if (!currentU) return;
  const currentL = currentU.lessons.find(l => l.lesson === userState.currentLesson);
  if (!currentL) return;

  // 渲染思维导图
  const drawer = document.getElementById("mindmapDrawer");
  if (drawer && currentL.mindmap) {
    drawer.classList.toggle("open", userState.mindmapOpen);
    const mm = currentL.mindmap;
    let html = `
      <div class="mindmap-header">
        <span class="mindmap-core-pill">🗺️ 核心词群逻辑导图：${mm.core}</span>
        <span style="font-size:13px; color:var(--text-muted);">先理顺派生逻辑，再逐词击破</span>
      </div>
      <div class="mindmap-branches">
    `;
    mm.branches.forEach(b => {
      html += `
        <div class="mindmap-branch-card">
          <div class="mindmap-branch-title">${b.label}</div>
          <div class="mindmap-word-pills">
            ${b.words.map(w => `<span class="mindmap-word-pill" onclick="speakWord('${w}')">${w}</span>`).join("")}
          </div>
        </div>
      `;
    });
    html += `</div>`;
    drawer.innerHTML = html;
  }

  // 渲染词汇列表
  const listEl = document.getElementById("vocabCardList");
  if (!listEl) return;

  let words = currentL.words || [];

  // 全局搜索或过滤
  if (userState.searchQuery) {
    words = words.filter(w =>
      w.word.toLowerCase().includes(userState.searchQuery) ||
      w.meaning.toLowerCase().includes(userState.searchQuery) ||
      (w.tip && w.tip.toLowerCase().includes(userState.searchQuery))
    );
  }

  if (userState.filterStarred) {
    words = words.filter(w => userState.learned[w.id] && userState.learned[w.id].star);
  }

  if (userState.filterUnlearned) {
    words = words.filter(w => !isWordLearned(userState.learned[w.id]));
  }

  if (userState.filterDue) {
    words = words.filter(w => Boolean(getWordDueStage(w.id)));
  }

  // 更新到期复习计数显示
  const dueCountEl = document.getElementById("dueWordsCount");
  if (dueCountEl) dueCountEl.textContent = getDueReviewWordsCount();
  const btnFilterDue = document.getElementById("btnFilterDue");
  if (btnFilterDue) btnFilterDue.classList.toggle("due-alert-chip", getDueReviewWordsCount() > 0);

  if (words.length === 0) {
    listEl.innerHTML = `
      <div class="card" style="text-align:center; padding: 48px;">
        <p style="font-size: 18px; color: var(--text-muted);">暂无符合筛选条件的词汇</p>
      </div>
    `;
    return;
  }

  const stages = [
    { key: "first", label: "初学" },
    { key: "s0", label: "5分" },
    { key: "s1", label: "30分" },
    { key: "s2", label: "12时" },
    { key: "l0", label: "1天" },
    { key: "l1", label: "2天" },
    { key: "l2", label: "4天" },
    { key: "l3", label: "7天" }
  ];

  let cardsHtml = "";
  words.forEach(w => {
    const record = userState.learned[w.id] || {
      first: false,
      short: [false, false, false],
      long: [false, false, false, false],
      star: false
    };

    cardsHtml += `
      <div class="vocab-card" id="card_${w.id}">
        <div class="vocab-card-header">
          <div class="vocab-word-group">
            <span class="vocab-num-badge">#${w.num}</span>
            <span class="vocab-english-word">${w.word}</span>
            <span class="vocab-phonetic">${w.phonetic || ""}</span>
            <span class="vocab-pos-badge">${w.pos || ""}</span>
            ${getWordDueStage(w.id) ? `<span class="due-tag-badge">⏰ 到期建议复习: ${getWordDueStage(w.id)}</span>` : ""}
            <button class="audio-speak-btn" onclick="speakWord('${w.word}')" title="发音朗读">🔊 朗读</button>
          </div>
          <button class="star-btn ${record.star ? "starred" : ""}" onclick="toggleStar('${w.id}')" title="加入生词本">★</button>
        </div>

        <div class="vocab-chinese-meaning" title="悬停或点击透视">${w.meaning}</div>

        ${w.tip ? `
          <div class="vocab-tip-box">
            <span class="tip-tag">${w.tip_type || "速记"}</span>
            <span class="tip-content">${w.tip}</span>
          </div>
        ` : ""}

        ${w.example_en ? `
          <div class="vocab-example-box">
            <div class="example-en">${w.example_en} <button class="audio-speak-btn" onclick="speakWord('${w.example_en.replace(/'/g, "\\'")}')" style="margin-left:6px; font-size:12px;">🔊 例句朗读</button></div>
            <div class="example-cn">${w.example_cn}</div>
          </div>
        ` : ""}

        ${w.derivations && w.derivations.length > 0 ? `
          <div class="derivations-tree">
            ${w.derivations.map(d => `
              <div class="derivation-item">
                <span class="derivation-tag">派生</span>
                <span class="derivation-word">${d.word}</span>
                <span class="derivation-phonetic">${d.phonetic || ""}</span>
                <span class="vocab-pos-badge">${d.pos || ""}</span>
                <span class="derivation-meaning" title="悬停透视">${d.meaning}</span>
                <button class="audio-speak-btn" onclick="speakWord('${d.word}')" style="padding:2px 6px; font-size:12px;">🔊</button>
              </div>
            `).join("")}
          </div>
        ` : ""}

        <div class="ebing-check-matrix">
          <span class="ebing-matrix-label">📈 9+1 抗遗忘闭环：</span>
          <button class="ebing-pill-checkbox ${record.first ? "checked" : ""}" onclick="updateCheck('${w.id}', 'first')">初学</button>
          <button class="ebing-pill-checkbox ${record.short && record.short[0] ? "checked" : ""}" onclick="updateCheck('${w.id}', 's0')">5分</button>
          <button class="ebing-pill-checkbox ${record.short && record.short[1] ? "checked" : ""}" onclick="updateCheck('${w.id}', 's1')">30分</button>
          <button class="ebing-pill-checkbox ${record.short && record.short[2] ? "checked" : ""}" onclick="updateCheck('${w.id}', 's2')">12时</button>
          <button class="ebing-pill-checkbox ${record.long && record.long[0] ? "checked" : ""}" onclick="updateCheck('${w.id}', 'l0')">1天</button>
          <button class="ebing-pill-checkbox ${record.long && record.long[1] ? "checked" : ""}" onclick="updateCheck('${w.id}', 'l1')">2天</button>
          <button class="ebing-pill-checkbox ${record.long && record.long[2] ? "checked" : ""}" onclick="updateCheck('${w.id}', 'l2')">4天</button>
          <button class="ebing-pill-checkbox ${record.long && record.long[3] ? "checked" : ""}" onclick="updateCheck('${w.id}', 'l3')">7天</button>
          <button class="ebing-pill-checkbox ${record.long && record.long[4] ? "checked" : ""}" onclick="updateCheck('${w.id}', 'l4')">14天</button>
          <button class="ebing-pill-checkbox ${record.long && record.long[5] ? "checked" : ""}" onclick="updateCheck('${w.id}', 'l5')">21天</button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = cardsHtml;
  renderVocabPlanBanner();
}


// 学习状态高精度判定辅助函数 (只有抗遗忘打卡环上有被选中的项目才算已学习，全取消则立即扣减归零)
function isWordLearned(record) {
  if (!record) return false;
  return Boolean(
    record.first ||
    (record.short && record.short.some(Boolean)) ||
    (record.long && record.long.some(Boolean))
  );
}

function getLearnedWordsCount() {
  if (!userState.learned) return 0;
  return Object.values(userState.learned).filter(isWordLearned).length;
}

function getMasteredWordsCount() {
  if (!userState.learned) return 0;
  return Object.values(userState.learned).filter(r =>
    r && r.long && (r.long[5] || r.long[4] || r.long[3])
  ).length;
}

function updateCheck(wordId, stage) {
  if (!userState.learned[wordId]) {
    userState.learned[wordId] = {
      first: false,
      firstTime: Date.now(),
      short: [false, false, false],
      long: [false, false, false, false, false, false],
      star: false
    };
  }
  const r = userState.learned[wordId];
  if (!r.long) r.long = [false, false, false, false, false, false];
  while (r.long.length < 6) r.long.push(false);
  if (!r.short) r.short = [false, false, false];

  const wasLearned = isWordLearned(r);

  if (stage === "first") r.first = !r.first;
  else if (stage === "s0") r.short[0] = !r.short[0];
  else if (stage === "s1") r.short[1] = !r.short[1];
  else if (stage === "s2") r.short[2] = !r.short[2];
  else if (stage === "l0") r.long[0] = !r.long[0];
  else if (stage === "l1") r.long[1] = !r.long[1];
  else if (stage === "l2") r.long[2] = !r.long[2];
  else if (stage === "l3") r.long[3] = !r.long[3];
  else if (stage === "l4") r.long[4] = !r.long[4];
  else if (stage === "l5") r.long[5] = !r.long[5];

  const isNowLearned = isWordLearned(r);

  // 如果抗遗忘环上所有勾选均已取消，且未加入星标生词本，彻底删除该词的记录，实现精准计数扣减
  if (!isNowLearned && !r.star) {
    delete userState.learned[wordId];
    if (userState.planGoal && userState.planGoal.todayLearnedIds) {
      delete userState.planGoal.todayLearnedIds[wordId];
    }
  } else if (isNowLearned) {
    trackDailyPlanCheck(wordId);
  }

  // 连胜活动统计与打卡增减处理
  if (wasLearned && !isNowLearned) {
    recordStreakActivity(-1);
  } else if (!wasLearned && isNowLearned) {
    recordStreakActivity(1);
    defendTodayStreak("word", 1);
  }

  saveState();
  renderVocabSection();
  if (typeof renderBackupSection === "function") renderBackupSection();
  if (typeof renderPlanGoalDashboard === "function") renderPlanGoalDashboard();
  if (typeof updateStreakDisplay === "function") updateStreakDisplay();
}

function toggleStar(wordId) {
  if (!userState.learned[wordId]) {
    userState.learned[wordId] = {
      first: false,
      firstTime: Date.now(),
      short: [false, false, false],
      long: [false, false, false, false, false, false],
      star: false
    };
  }
  const r = userState.learned[wordId];
  r.star = !r.star;

  // 如果取消了星标，且抗遗忘环上无任何勾选，彻底删除
  if (!r.star && !isWordLearned(r)) {
    delete userState.learned[wordId];
  }

  saveState();
  renderVocabSection();
  recordStreakActivity(1);
  defendTodayStreak("word", 1);
}

// --- 14. 全新极速闪过卡工坊交互驱动引擎 (SRS 3D Cards & Flow) ---
let currentDeckWords = [];
let flashRoundErrors = [];
let isCardFlipped = false;
let flashSessionStats = {
  mastered: 0,
  hesitant: 0,
  forgot: 0
};
let speedFlashTimer = null;
let speedMeaningTimer = null;
let denseListMeaningsHidden = false;

// 1. 初始化闪过卡题库选择器
function initFlashcardSelectors() {
  const sel = document.getElementById("flashUnitSelect");
  if (!sel) return;

  let optionsHtml = `
    <option value="all_shuffled">🔀 全库 7,375 词大乱序 (极限总攻 · 默认)</option>
    <option value="core_all">🌟 核心高频母词全库 (2,164 词必过必背)</option>
  `;

  if (window.CET6_DATA && window.CET6_DATA.coreUnits) {
    window.CET6_DATA.coreUnits.forEach(u => {
      optionsHtml += `<option value="unit_${u.unit}">📚 Unit ${u.unit} 单元重点词</option>`;
    });
  }

  optionsHtml += `
    <option value="starred">⭐ 星标生词本专刷</option>
    <option value="errors">🔴 本轮生疏错词本</option>
  `;

  sel.innerHTML = optionsHtml;
  loadCurrentDeck();
}

// 2. 加载选中的题库并随机乱序
function loadCurrentDeck() {
  const sel = document.getElementById("flashUnitSelect");
  const deckKey = sel ? sel.value : "all_shuffled";

  let list = [];

  if (deckKey === "all_shuffled") {
    const raw = window.CET6_DATA && window.CET6_DATA.flashCardDecks && window.CET6_DATA.flashCardDecks.all_shuffled;
    list = raw && raw.words ? [...raw.words] : [];
  } else if (deckKey === "core_all") {
    if (window.CET6_DATA && window.CET6_DATA.coreUnits) {
      window.CET6_DATA.coreUnits.forEach(u => {
        if (u.lessons) u.lessons.forEach(l => {
          if (l.words) l.words.forEach(w => list.push({ word: w.word, meaning: w.meaning, phonetic: w.phonetic, tip: w.tip, id: w.id }));
        });
      });
    }
  } else if (deckKey.startsWith("unit_")) {
    const unitNum = parseInt(deckKey.replace("unit_", ""));
    const u = window.CET6_DATA && window.CET6_DATA.coreUnits && window.CET6_DATA.coreUnits.find(x => x.unit === unitNum);
    if (u && u.lessons) {
      u.lessons.forEach(l => {
        if (l.words) l.words.forEach(w => list.push({ word: w.word, meaning: w.meaning, phonetic: w.phonetic, tip: w.tip, id: w.id }));
      });
    }
  } else if (deckKey === "starred") {
    if (userState.learned && window.CET6_DATA && window.CET6_DATA.coreUnits) {
      window.CET6_DATA.coreUnits.forEach(u => {
        if (u.lessons) u.lessons.forEach(l => {
          if (l.words) l.words.forEach(w => {
            if (userState.learned[w.id] && userState.learned[w.id].star) {
              list.push({ word: w.word, meaning: w.meaning, phonetic: w.phonetic, tip: w.tip, id: w.id });
            }
          });
        });
      });
    }
    if (list.length === 0) {
      showToast("ℹ️ 当前星标生词本为空，可在背词卡片上点击 ★ 加入生词！");
    }
  } else if (deckKey === "errors") {
    list = [...flashRoundErrors];
    if (list.length === 0) {
      showToast("🎉 太棒了！本轮尚无生疏错词记录！");
    }
  }

  // 默认使用 Fisher-Yates 算法彻底打乱顺序
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }

  currentDeckWords = list;
  userState.speedFlash.currentIndex = 0;
  flashSessionStats = { mastered: 0, hesitant: 0, forgot: 0 };
  flashRoundErrors = [];
}

function onFlashUnitChange() {
  loadCurrentDeck();
  pauseSpeedFlash();
  renderFlashWorkspace();
  saveState();
}

// 🔀 重新乱序大洗牌 (Fisher-Yates 算法)
function reshuffleCurrentDeck() {
  if (!currentDeckWords || currentDeckWords.length <= 1) return;
  for (let i = currentDeckWords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentDeckWords[i], currentDeckWords[j]] = [currentDeckWords[j], currentDeckWords[i]];
  }
  userState.speedFlash.currentIndex = 0;
  pauseSpeedFlash();
  renderFlashWorkspace();
  if (typeof playPixelSound === "function") playPixelSound("coin");
  showToast("🔀 已完成全库随机打乱大洗牌！");
}

function switchFlashMode(mode) {
  userState.speedFlash.mode = mode;
  pauseSpeedFlash();
  document.querySelectorAll(".flash-mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  renderFlashWorkspace();
  saveState();
}

function setSpeedInterval(speedSec) {
  userState.speedFlash.speed = parseFloat(speedSec);
  document.querySelectorAll(".speed-btn-pill").forEach(btn => {
    btn.classList.toggle("active", parseFloat(btn.dataset.speed) === userState.speedFlash.speed);
  });
  if (userState.speedFlash.isPlaying) {
    pauseSpeedFlash();
    startSpeedFlash();
  }
  saveState();
}

function getFlashWords() {
  if (!currentDeckWords || currentDeckWords.length === 0) {
    loadCurrentDeck();
  }
  return currentDeckWords;
}

// 渲染工作区主调度器
function renderFlashWorkspace() {
  if (!currentDeckWords || currentDeckWords.length === 0) {
    initFlashcardSelectors();
  }
  const stage3D = document.getElementById("flipCardStage");
  const stageFlash = document.getElementById("speedFlashStage");
  const stageList = document.getElementById("flashListStage");
  const settleCard = document.getElementById("flashRoundSettlementCard");

  if (settleCard) settleCard.style.display = "none";

  const mode = userState.speedFlash.mode || "3d";

  if (stage3D) stage3D.style.display = mode === "3d" ? "block" : "none";
  if (stageFlash) stageFlash.style.display = mode === "flash" ? "block" : "none";
  if (stageList) stageList.style.display = mode === "list" ? "block" : "none";

  if (mode === "3d") {
    renderCurrent3DCard();
  } else if (mode === "flash") {
    renderCurrentSpeedWord();
  } else if (mode === "list") {
    renderFlashDenseList();
  }

  updateFlashDashboardProgress();
}

// 实时更新顶部进度条与统计胶囊
function updateFlashDashboardProgress() {
  const words = getFlashWords();
  const total = words.length || 1;
  const current = (userState.speedFlash.currentIndex || 0) + 1;

  const bar = document.getElementById("flashProgressBar");
  const progText = document.getElementById("flashStatProgressText");
  const masEl = document.getElementById("flashStatMastered");
  const hesEl = document.getElementById("flashStatHesitant");
  const forEl = document.getElementById("flashStatForgot");
  const accEl = document.getElementById("flashStatAccuracy");

  const pct = Math.min(100, Math.max(1, Math.round((current / total) * 100)));
  if (bar) bar.style.width = pct + "%";
  if (progText) progText.textContent = `第 ${current} / ${total} 词 ｜ ${pct}%`;

  if (masEl) masEl.textContent = `🟢 熟记: ${flashSessionStats.mastered}`;
  if (hesEl) hesEl.textContent = `🟡 模糊: ${flashSessionStats.hesitant}`;
  if (forEl) forEl.textContent = `🔴 生疏: ${flashSessionStats.forgot}`;

  const totalRated = flashSessionStats.mastered + flashSessionStats.hesitant + flashSessionStats.forgot;
  const acc = totalRated > 0 ? Math.round((flashSessionStats.mastered / totalRated) * 100) : 0;
  if (accEl) accEl.textContent = `掌握率: ${acc}%`;
}

// 3. 渲染当前 3D 拟真翻转卡片
function renderCurrent3DCard() {
  const words = getFlashWords();
  if (words.length === 0) return;

  if (userState.speedFlash.currentIndex >= words.length) {
    showFlashRoundSettlement();
    return;
  }
  if (userState.speedFlash.currentIndex < 0) userState.speedFlash.currentIndex = 0;

  const w = words[userState.speedFlash.currentIndex];
  const frontWord = document.getElementById("flipFrontWord");
  const frontPhon = document.getElementById("flipFrontPhonetic");
  const backMean = document.getElementById("flipBackMeaning");
  const trickBox = document.getElementById("flashTrickBox");
  const trickText = document.getElementById("flashTrickText");
  const starBtn = document.getElementById("flashStarBtn");

  if (frontWord) frontWord.textContent = w.word;
  if (frontPhon) frontPhon.textContent = w.phonetic || "";
  if (backMean) backMean.textContent = w.meaning;

  if (trickBox && trickText) {
    if (w.tip && w.tip.trim()) {
      trickText.textContent = w.tip;
      trickBox.style.display = "block";
    } else {
      trickBox.style.display = "none";
    }
  }

  // 标星状态更新
  if (starBtn) {
    const isStarred = w.id && userState.learned && userState.learned[w.id] && userState.learned[w.id].star;
    starBtn.classList.toggle("starred", Boolean(isStarred));
  }

  // 重置回正面
  isCardFlipped = false;
  const inner = document.getElementById("flipCardInner");
  if (inner) inner.classList.remove("flipped");

  updateFlashDashboardProgress();
}

// 翻转卡片
function flip3DCard() {
  isCardFlipped = !isCardFlipped;
  const inner = document.getElementById("flipCardInner");
  if (inner) inner.classList.toggle("flipped", isCardFlipped);

  // 翻到背面时自动播报一次发音
  if (isCardFlipped) {
    speakCurrentFlashcard();
  }
}

// 艾宾浩斯三档记忆打分 ('forgot' | 'hesitant' | 'mastered')
function grade3DCard(grade) {
  const words = getFlashWords();
  if (words.length === 0) return;
  const curIdx = userState.speedFlash.currentIndex;
  const currentWordObj = words[curIdx];

  // 记录撤销快照
  const prevSnapshot = {
    index: curIdx,
    stats: { ...flashSessionStats },
    wordObj: currentWordObj,
    grade: grade
  };

  // 计入统计
  if (grade === "mastered") {
    flashSessionStats.mastered++;
    if (typeof playPixelSound === "function") playPixelSound("correct");
    if (typeof recordStreakActivity === "function") recordStreakActivity(1);
  } else if (grade === "hesitant") {
    flashSessionStats.hesitant++;
    if (typeof playPixelSound === "function") playPixelSound("coin");
  } else if (grade === "forgot") {
    flashSessionStats.forgot++;
    if (typeof playPixelSound === "function") playPixelSound("wrong");
    // 加入本轮错词本
    if (!flashRoundErrors.some(x => x.word === currentWordObj.word)) {
      flashRoundErrors.push(currentWordObj);
    }
  }

  userState.speedFlash.currentIndex++;

  // 注册 8 秒反悔急救胶囊
  const gradeLabel = grade === "mastered" ? "🟢 熟记" : (grade === "hesitant" ? "🟡 模糊" : "🔴 生疏");
  registerUndoAction(`已将 [${currentWordObj.word}] 标为 ${gradeLabel}`, () => {
    userState.speedFlash.currentIndex = prevSnapshot.index;
    flashSessionStats = prevSnapshot.stats;
    renderCurrent3DCard();
  }, 6000);

  renderCurrent3DCard();
}

function undoLastFlashcardMark() {
  if (typeof performGlobalUndo === "function") {
    performGlobalUndo();
  }
}

// 朗读当前闪卡单词
function speakCurrentFlashcard() {
  const words = getFlashWords();
  if (words.length === 0) return;
  const w = words[userState.speedFlash.currentIndex];
  if (w && typeof speakWord === "function") {
    speakWord(w.word);
  }
}

// 为当前卡片加入/取消星标生词本
function toggleStarCurrentFlashcard() {
  const words = getFlashWords();
  if (words.length === 0) return;
  const w = words[userState.speedFlash.currentIndex];
  if (!w) return;

  if (w.id && typeof toggleStar === "function") {
    toggleStar(w.id);
  }
  const starBtn = document.getElementById("flashStarBtn");
  if (starBtn) {
    const isNowStarred = w.id && userState.learned && userState.learned[w.id] && userState.learned[w.id].star;
    starBtn.classList.toggle("starred", Boolean(isNowStarred));
  }
  showToast(`★ 已${starBtn && starBtn.classList.contains("starred") ? "加入" : "移出"}星标生词本！`);
}

// 4. 自动闪视心流引擎 (巡航播放模式)
function renderCurrentSpeedWord() {
  const words = getFlashWords();
  if (words.length === 0) return;
  if (userState.speedFlash.currentIndex >= words.length) userState.speedFlash.currentIndex = 0;
  if (userState.speedFlash.currentIndex < 0) userState.speedFlash.currentIndex = words.length - 1;

  const w = words[userState.speedFlash.currentIndex];
  const wordEl = document.getElementById("speedWordHero");
  const meanEl = document.getElementById("speedMeaningHero");
  const progEl = document.getElementById("speedProgressHero");

  if (wordEl) wordEl.textContent = w.word;
  if (meanEl) {
    meanEl.textContent = w.meaning;
    meanEl.classList.remove("revealed");
  }
  if (progEl) progEl.textContent = `第 ${userState.speedFlash.currentIndex + 1} / ${words.length} 词 · 自动巡航`;

  speakWord(w.word);

  clearTimeout(speedMeaningTimer);
  const delay = Math.max(300, (userState.speedFlash.speed * 1000) * 0.45);
  speedMeaningTimer = setTimeout(() => {
    if (meanEl) meanEl.classList.add("revealed");
  }, delay);

  updateFlashDashboardProgress();
}

function toggleSpeedFlash() {
  if (userState.speedFlash.isPlaying) {
    pauseSpeedFlash();
  } else {
    startSpeedFlash();
  }
}

function startSpeedFlash() {
  userState.speedFlash.isPlaying = true;
  const playBtn = document.getElementById("speedPlayBtn");
  if (playBtn) playBtn.innerHTML = "⏸️ 暂停巡航 (P)";

  renderCurrentSpeedWord();
  clearInterval(speedFlashTimer);
  speedFlashTimer = setInterval(() => {
    stepSpeedFlash(1);
  }, userState.speedFlash.speed * 1000);
}

function pauseSpeedFlash() {
  userState.speedFlash.isPlaying = false;
  clearInterval(speedFlashTimer);
  clearTimeout(speedMeaningTimer);
  const playBtn = document.getElementById("speedPlayBtn");
  if (playBtn) playBtn.innerHTML = "▶️ 开启闪视心流 (P)";
}

function stepSpeedFlash(dir) {
  const words = getFlashWords();
  if (words.length === 0) return;
  userState.speedFlash.currentIndex = (userState.speedFlash.currentIndex + dir + words.length) % words.length;
  renderCurrentSpeedWord();
}

// 5. 密集冲刺清单模式
function renderFlashDenseList() {
  const grid = document.getElementById("flashDenseListGrid");
  if (!grid) return;
  const words = getFlashWords();
  const displaySlice = words.slice(0, 120);

  let html = "";
  displaySlice.forEach(w => {
    html += `
      <div class="flash-dense-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:18px; color:var(--text-main); font-family:serif;">${w.word}</strong>
          <button type="button" class="audio-speak-btn" onclick="speakWord('${w.word}')" style="padding:2px 8px; font-size:12px;">🔊</button>
        </div>
        <div class="flash-dense-meaning ${denseListMeaningsHidden ? 'hidden-mask' : ''}" style="margin-top:6px; font-size:13.5px; color:var(--text-body);">
          ${w.meaning}
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}

function toggleFlashListMeanings() {
  denseListMeaningsHidden = !denseListMeaningsHidden;
  const btn = document.getElementById("btnToggleListMeanings");
  if (btn) btn.textContent = denseListMeaningsHidden ? "👁️ 显示释义" : "👁️ 隐藏释义 (自测)";
  document.querySelectorAll(".flash-dense-meaning").forEach(el => {
    el.classList.toggle("hidden-mask", denseListMeaningsHidden);
  });
}

// 6. 本轮刷词完成成就结算卡
function showFlashRoundSettlement() {
  pauseSpeedFlash();
  const stage3D = document.getElementById("flipCardStage");
  const stageFlash = document.getElementById("speedFlashStage");
  const stageList = document.getElementById("flashListStage");
  const settleCard = document.getElementById("flashRoundSettlementCard");

  if (stage3D) stage3D.style.display = "none";
  if (stageFlash) stageFlash.style.display = "none";
  if (stageList) stageList.style.display = "none";
  if (settleCard) settleCard.style.display = "block";

  const total = flashSessionStats.mastered + flashSessionStats.hesitant + flashSessionStats.forgot;
  const acc = total > 0 ? Math.round((flashSessionStats.mastered / total) * 100) : 0;

  const tEl = document.getElementById("settleTotalCount");
  const mEl = document.getElementById("settleMasteredCount");
  const fEl = document.getElementById("settleForgotCount");
  const aEl = document.getElementById("settleAccuracyRate");
  const btnErr = document.getElementById("btnRestartForgot");

  if (tEl) tEl.textContent = total;
  if (mEl) mEl.textContent = flashSessionStats.mastered;
  if (fEl) fEl.textContent = flashSessionStats.forgot;
  if (aEl) aEl.textContent = acc + "%";

  if (btnErr) {
    btnErr.style.display = flashRoundErrors.length > 0 ? "inline-block" : "none";
    btnErr.textContent = `🔴 只重刷本轮生疏词 (${flashRoundErrors.length})`;
  }

  if (typeof triggerConfettiBurst === "function") {
    triggerConfettiBurst(window.innerWidth / 2, window.innerHeight / 2);
  }
}

function restartFlashOnlyForgot() {
  if (flashRoundErrors.length === 0) return;
  const sel = document.getElementById("flashUnitSelect");
  if (sel) sel.value = "errors";
  loadCurrentDeck();
  switchFlashMode("3d");
  showToast(`🔥 已加载本轮生疏错词包，共 ${currentDeckWords.length} 词，开始精准强化！`);
}

// 7. 闪过卡全局快捷键监听 (Space / 1/2/3 / A/S/D / R / Z / F / P / V)
if (typeof document !== "undefined") {
  document.addEventListener("keydown", function(e) {
    if (userState.currentTab !== "flash") return;
    if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) return;

    const mode = userState.speedFlash.mode || "3d";

    if (e.code === "Space") {
      e.preventDefault();
      if (mode === "3d") flip3DCard();
      else if (mode === "flash") toggleSpeedFlash();
      return;
    }

    if (mode === "3d") {
      if (e.key === "1" || e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
        e.preventDefault();
        grade3DCard("forgot");
      } else if (e.key === "2" || e.key === "s" || e.key === "S" || e.key === "ArrowDown") {
        e.preventDefault();
        grade3DCard("hesitant");
      } else if (e.key === "3" || e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
        e.preventDefault();
        grade3DCard("mastered");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        reshuffleCurrentDeck();
      } else if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        undoLastFlashcardMark();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleStarCurrentFlashcard();
      } else if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        speakCurrentFlashcard();
      }
    } else if (mode === "flash") {
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        toggleSpeedFlash();
      }
    }
  });
}


// --- 15. 7 周通关计划与习惯打卡 (7-Week Planner) ---
function renderPlannerSection() {
  const morningCheck = document.getElementById("habitMorningCheck");
  const dayCheck = document.getElementById("habitDayCheck");
  const nightCheck = document.getElementById("habitNightCheck");

  if (morningCheck) morningCheck.checked = userState.habits.morning;
  if (dayCheck) dayCheck.checked = userState.habits.daytime;
  if (nightCheck) nightCheck.checked = userState.habits.evening;

  updateStreakDisplay();
  renderPlanGoalDashboard();
  renderStreakCalendar();
}

function onHabitChange(type, checkbox) {
  const isChecked = checkbox.checked;
  userState.habits[type] = isChecked;

  const habitNames = { morning: "晨诵", daytime: "日习", evening: "晚复盘" };
  const hName = habitNames[type] || type;

  const today = new Date().toISOString().slice(0, 10);
  if (!userState.streakHistory) userState.streakHistory = {};
  if (!userState.streakHistory[today]) {
    userState.streakHistory[today] = { words: 0, pomo: 0, morning: false, daytime: false, evening: false, isMakeup: false };
  }
  userState.streakHistory[today][type] = isChecked;

  if (isChecked) {
    // 勾选打卡
    if (typeof playChime === "function") playChime();
    showToast(`✅ 已完成【${hName}】打卡！`);

    // 检查是否三项全满贯
    if (userState.habits.morning && userState.habits.daytime && userState.habits.evening) {
      defendTodayStreak("habit", 1);
      if (typeof showAchievementReportModal === "function") {
        showAchievementReportModal();
      }
    }
  } else {
    // 取消打卡
    showToast(`↺ 已取消【${hName}】打卡！`);
    // 重新核算连胜状态
    userState.streakDays = calculateCurrentStreak();
  }

  updateStreakDisplay();
  renderStreakCalendar();
  saveState();
}

function updateStreakDisplay() {
  const days = userState.streakDays || 1;
  const isDefended = isTodayStreakDefended();
  const tier = getStreakTier(days);

  // 顶栏徽章更新
  const flameEl = document.getElementById("headerFlameIcon");
  const daysEl = document.getElementById("headerStreakDays");
  const tierEl = document.getElementById("headerStreakBadge");

  if (flameEl) {
    flameEl.className = isDefended ? "streak-flame-icon on-fire" : "streak-flame-icon";
    flameEl.title = isDefended ? `🔥 今日连胜已保卫！正在燃烧：${days} 天连胜` : `⚠️ 今日连胜未保卫，完成背词或番茄钟即可点亮！`;
  }
  if (daysEl) daysEl.textContent = days;
  if (tierEl) {
    tierEl.textContent = tier.name;
    tierEl.className = isDefended ? "pixel-live-tag" : "pixel-live-tag";
  }

  // 计划页数字与说明
  const plannerDaysEl = document.getElementById("plannerStreakDays");
  if (plannerDaysEl) {
    plannerDaysEl.innerHTML = `<span style="color:var(--tomato-red);">${days} 天</span> <span style="font-size:12px; font-weight:600; color:var(--text-muted);">[${tier.name}]</span>`;
  }
}

// --- 16. 数据备份与归档模块 (Data Backup & JSON Archive) ---
function renderBackupSection() {
  const totalWords = getLearnedWordsCount();
  const masterWords = getMasteredWordsCount();

  const wEl = document.getElementById("statTotalWords");
  const mEl = document.getElementById("statMasteredWords");
  const tEl = document.getElementById("statTotalTomatoes");
  const fEl = document.getElementById("statTotalFocusMins");

  if (wEl) wEl.textContent = totalWords;
  if (mEl) mEl.textContent = masterWords;
  if (tEl) tEl.textContent = userState.pomo ? userState.pomo.todayTomatoes : 0;
  if (fEl) fEl.textContent = Math.round(userState.pomo ? userState.pomo.totalFocusMins : 0);
  renderMidnightSnapshotList();
}

function exportUserData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userState, null, 2));
  const dlAnchor = document.createElement("a");
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `疯狂过六级_完整档案_${new Date().toISOString().slice(0, 10)}.json`);
  dlAnchor.click();
}

function importUserData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      userState = { ...userState, ...imported };
      saveState();
      alert("✅ 成功恢复学习存档！");
      location.reload();
    } catch (err) {
      alert("❌ 导入失败：文件格式不合法");
    }
  };
  reader.readAsText(file);
}

function resetAllData() {
  if (confirm("⚠️ 确定要清空全部学习进度和打卡记录吗？此操作不可撤销！")) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
}

// --- 17. 全局键盘快捷键与系统就绪启动 ---
document.addEventListener("keydown", function(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  // 全局撤销快捷键 Ctrl+Z
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    triggerGlobalUndo();
    return;
  }
  // 闪卡模式下单按 Z 撤销上一个单词
  if (e.key.toLowerCase() === "z" && userState.currentTab === "flash" && userState.speedFlash.mode === "3d") {
    e.preventDefault();
    undoLastFlashcardMark();
    return;
  }


  // Space 翻转卡片
  if (e.code === "Space") {
    e.preventDefault();
    if (userState.currentTab === "flash" && userState.speedFlash.mode === "3d") {
      flip3DCard();
    }
  }

  // 方向键左/右 标记翻转卡
  if (e.code === "ArrowLeft") {
    if (userState.currentTab === "flash" && userState.speedFlash.mode === "3d") {
      mark3DCard("vague");
    }
  }
  if (e.code === "ArrowRight") {
    if (userState.currentTab === "flash" && userState.speedFlash.mode === "3d") {
      mark3DCard("mastered");
    }
  }

  // Ctrl+K 或 / 激活快速搜索
  if ((e.ctrlKey && e.key.toLowerCase() === "k") || e.key === "/") {
    e.preventDefault();
    openGlobalSearchModal();
  }

  // 数字键 1-9 快速切换 Tab
  const tabs = ["pomodoro", "vocab", "flash", "planner", "backup"];
  const num = parseInt(e.key);
  if (num >= 1 && num <= tabs.length) {
    switchTab(tabs[num - 1]);
  }
});



// --- 20. 凌晨自动归档与快照持久化系统 (每日 00:00:00 自动捕获) ---
function performMidnightBackup(isCatchUp = false) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8);
  const formatted = `${dateStr} ${timeStr}`;

  const totalWords = getLearnedWordsCount();
  const masterWords = getMasteredWordsCount();

  const snapshot = {
    id: Date.now(),
    dateStr: dateStr,
    timestampStr: formatted,
    isCatchUp: isCatchUp,
    stats: {
      totalWords: totalWords,
      masteredWords: masterWords,
      todayTomatoes: userState.pomo ? userState.pomo.todayTomatoes : 0,
      totalFocusMins: userState.pomo ? Math.round(userState.pomo.totalFocusMins) : 0,
      streakDays: userState.streakDays || 1
    },
    // 保存核心复习进度快照
    stateSnapshot: {
      learned: JSON.parse(JSON.stringify(userState.learned || {})),
      pomo: JSON.parse(JSON.stringify(userState.pomo || {})),
      habits: JSON.parse(JSON.stringify(userState.habits || {})),
      streakDays: userState.streakDays || 1
    }
  };

  if (!userState.midnightSnapshots) userState.midnightSnapshots = [];
  // 保持最多保留 30 个每日快照
  userState.midnightSnapshots.unshift(snapshot);
  if (userState.midnightSnapshots.length > 30) {
    userState.midnightSnapshots = userState.midnightSnapshots.slice(0, 30);
  }

  userState.lastMidnightBackup = formatted;
  saveState();
  renderMidnightSnapshotList();
  console.log(`[AutoBackup] 成功生成凌晨归档快照: ${formatted}`);
}

function scheduleMidnightAutoBackup() {
  function getMsToMidnight() {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return nextMidnight.getTime() - now.getTime();
  }

  const ms = getMsToMidnight();
  setTimeout(() => {
    performMidnightBackup(false);
    scheduleMidnightAutoBackup(); // 递归预约次日凌晨
  }, ms);

  // 启动倒计时显示时钟
  setInterval(updateNextMidnightCountdown, 1000);
}

function checkMidnightCatchUp() {
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = userState.lastMidnightBackup ? userState.lastMidnightBackup.slice(0, 10) : "";

  // 如果从未归档或今天的归档还没做，立即补建一个基准快照
  if (!lastDate || lastDate !== today) {
    performMidnightBackup(true);
  }
}

function updateNextMidnightCountdown() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const diff = nextMidnight.getTime() - now.getTime();

  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff / (1000 * 60)) % 60);
  const s = Math.floor((diff / 1000) % 60);

  const el = document.getElementById("nextMidnightCountdown");
  if (el) {
    const pad = (n) => String(n).padStart(2, "0");
    el.textContent = `${pad(h)}时${pad(m)}分${pad(s)}秒`;
  }

  const lastEl = document.getElementById("lastMidnightTime");
  if (lastEl) {
    lastEl.textContent = userState.lastMidnightBackup || "暂无记录";
  }
}

function renderMidnightSnapshotList() {
  const container = document.getElementById("midnightSnapshotList");
  if (!container) return;

  const snapshots = userState.midnightSnapshots || [];
  if (snapshots.length === 0) {
    container.innerHTML = `<p style="font-size:14px; color:var(--text-muted); text-align:center; padding:20px;">历史池当前为空，系统将在今夜 00:00:00 自动生成第一份凌晨快照...</p>`;
    return;
  }

  let html = "";
  snapshots.forEach((snap, idx) => {
    const isLatest = idx === 0;
    html += `
      <div class="snapshot-item-card" id="snap_card_${snap.id}">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="snapshot-tag">${isLatest ? "⭐ 最新快照" : "📁 历史快照"}</span>
            <strong style="font-size:var(--font-md); color:var(--text-main);">${snap.timestampStr}</strong>
            ${snap.isCatchUp ? '<span style="font-size:11px; color:var(--text-muted); background:var(--bg-subtle); padding:2px 6px; border-radius:4px;">自动巡检归档</span>' : '<span style="font-size:11px; color:var(--sage-green); background:var(--sage-soft); padding:2px 6px; border-radius:4px;">00:00 准时自动</span>'}
          </div>
          <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">
            已掌握: <strong style="color:var(--text-main);">${snap.stats.totalWords}</strong> 词 |
            深度巩固(7~21天): <strong style="color:var(--sage-green);">${snap.stats.masteredWords}</strong> 词 |
            收获番茄: <strong style="color:var(--tomato-red);">${snap.stats.todayTomatoes}</strong> 颗 |
            连续打卡: ${snap.stats.streakDays} 天
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn-secondary" onclick="restoreSnapshot(${snap.id})" style="padding:6px 12px; font-size:13px;" title="恢复到该快照的学习进度">🔄 恢复此版本</button>
          <button class="btn-secondary" onclick="downloadSnapshot(${snap.id})" style="padding:6px 12px; font-size:13px;" title="将该快照导出为独立JSON文件">📥 导出JSON</button>
          <button class="btn-secondary btn-snap-del" onclick="deleteMidnightSnapshot(${snap.id})" style="padding:6px 12px; font-size:13px; color:var(--tomato-red); border-color:rgba(217,72,52,0.3);" title="删除此份历史快照">🗑️ 删除</button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function restoreSnapshot(snapId) {
  const snap = (userState.midnightSnapshots || []).find(s => s.id === snapId);
  if (!snap) return;

  if (confirm(`⚠️ 确定要将当前学习数据回滚到 [${snap.timestampStr}] 的凌晨快照吗？`)) {
    userState.learned = JSON.parse(JSON.stringify(snap.stateSnapshot.learned || {}));
    if (snap.stateSnapshot.pomo) userState.pomo = JSON.parse(JSON.stringify(snap.stateSnapshot.pomo));
    if (snap.stateSnapshot.habits) userState.habits = JSON.parse(JSON.stringify(snap.stateSnapshot.habits));
    if (snap.stateSnapshot.streakDays) userState.streakDays = snap.stateSnapshot.streakDays;
    saveState();
    alert("✅ 成功恢复到历史凌晨快照！");
    location.reload();
  }
}

function downloadSnapshot(snapId) {
  const snap = (userState.midnightSnapshots || []).find(s => s.id === snapId);
  if (!snap) return;
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snap, null, 2));
  const dlAnchor = document.createElement("a");
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `疯狂过六级_凌晨快照_${snap.dateStr}.json`);
  dlAnchor.click();
}


// 删除指定单份历史快照
function deleteMidnightSnapshot(snapId) {
  const snap = (userState.midnightSnapshots || []).find(s => s.id === snapId);
  if (!snap) return;

  if (confirm(`⚠️ 确定要删除 [${snap.timestampStr}] 这份历史快照吗？`)) {
    const backupSnap = JSON.parse(JSON.stringify(snap));
    userState.midnightSnapshots = userState.midnightSnapshots.filter(s => s.id !== snapId);
    saveState();
    renderMidnightSnapshotList();
    
    registerUndoAction(`已删除快照 [${backupSnap.timestampStr}]`, () => {
      userState.midnightSnapshots.unshift(backupSnap);
      userState.midnightSnapshots.sort((a, b) => b.id - a.id);
      saveState();
      renderMidnightSnapshotList();
    }, 8000);
  }
}

// 一键清空全部历史快照
function clearAllMidnightSnapshots() {
  if (!userState.midnightSnapshots || userState.midnightSnapshots.length === 0) {
    showToast("ℹ️ 当前历史池为空，无需清空。");
    return;
  }
  if (confirm("⚠️ 确定要清空历史池中的全部快照记录吗？此操作无法撤销！")) {
    userState.midnightSnapshots = [];
    saveState();
    renderMidnightSnapshotList();
    showToast("🗑️ 已成功清空全部凌晨历史快照！");
  }
}

function createManualSnapshot() {
  performMidnightBackup(false);
  alert("✅ 成功创建当前即时备份快照！");
}

// --- 18. 六级统考倒计时逻辑 (目标：12月12日 15:00) ---
function initExamCountdown() {
  function update() {
    const now = new Date();
    let year = now.getFullYear();
    let examTime = new Date(year, 11, 12, 15, 0, 0); // 月份11为12月，12日 15:00:00 开考
    if (now.getTime() > examTime.getTime()) {
      examTime = new Date(year + 1, 11, 12, 15, 0, 0);
    }

    const diff = examTime.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    const pad = (n) => String(n).padStart(2, "0");

    // 顶栏徽章
    const headDaysEl = document.getElementById("headerExamDays");
    const headHMSEl = document.getElementById("headerExamHMS");
    if (headDaysEl) headDaysEl.textContent = days;
    if (headHMSEl) headHMSEl.textContent = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;

    // 番茄钟看板
    const pomoDaysEl = document.getElementById("pomoExamDays");
    const pomoHoursEl = document.getElementById("pomoExamHours");
    const pomoMinsEl = document.getElementById("pomoExamMins");
    const pomoSecsEl = document.getElementById("pomoExamSecs");
    if (pomoDaysEl) pomoDaysEl.textContent = days;
    if (pomoHoursEl) pomoHoursEl.textContent = pad(hours);
    if (pomoMinsEl) pomoMinsEl.textContent = pad(mins);
    if (pomoSecsEl) pomoSecsEl.textContent = pad(secs);

    // 7周计划看板
    const planDaysEl = document.getElementById("planExamDays");
    const planHoursEl = document.getElementById("planExamHours");
    const planMinsEl = document.getElementById("planExamMins");
    const planSecsEl = document.getElementById("planExamSecs");
    if (planDaysEl) planDaysEl.textContent = days;
    if (planHoursEl) planHoursEl.textContent = pad(hours);
    if (planMinsEl) planMinsEl.textContent = pad(mins);
    if (planSecsEl) planSecsEl.textContent = pad(secs);
  }

  update();
  setInterval(update, 1000);
}

function initApp() {
  try { loadState(); } catch (e) { console.warn("loadState warning:", e); }
  try { setFontScale(userState.fontScale || 1.0); } catch (e) { console.warn("setFontScale warning:", e); }
  try { if (userState.darkMode && document.body && document.body.classList) document.body.classList.add("dark-mode"); } catch (e) {}
  try { switchTab(userState.currentTab || "pomodoro"); } catch (e) { console.warn("switchTab warning:", e); }
  try { updatePomoDisplay(); } catch (e) { console.warn("updatePomoDisplay warning:", e); }
  try { initExamCountdown(); } catch (e) { console.warn("initExamCountdown warning:", e); }
  try { checkMidnightCatchUp(); } catch (e) {}
  try { scheduleMidnightAutoBackup(); } catch (e) {}
  try { setInterval(checkScheduledReminders, 30000); checkScheduledReminders(); } catch (e) {}
  try { if (typeof updateTomatoPetBadge === "function") updateTomatoPetBadge(); } catch (e) {}
  try { if (typeof updateHeaderBlitzBadge === "function") updateHeaderBlitzBadge();
    if (typeof updateAudioPrefUI === "function") updateAudioPrefUI(); } catch (e) {}
}

if (typeof window !== "undefined") {
  window.initApp = initApp;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
}


// --- 21. 可爱番茄 Q 版像素人互动引擎 ---
const PIXEL_TOMATO_QUOTES = [
  "加油呀！今天也要疯狂过六级！🍅",
  "保持心流，每一颗番茄都在发光！✨",
  "星光不问赶路人，今天也超棒！💪",
  "战胜遗忘，你就是六级战神！🔥",
  "戳我干嘛~ 还不快去背单词！嘻嘻~ 😄",
  "词以群记，今天又消灭一个词群！🎉",
  "专注 25 分钟，离高分又进一步！⏳",
  "每一份努力，都是考场上的底气！🌟",
  "种下专注，收获六级大红番茄！🍅",
  "冲冲冲！12月12日稳稳过关！🏆"
];

let bubbleTimeout = null;
let lastQuoteIdx = -1;

function petPixelTomato() {
  const avatar = document.querySelector(".pixel-tomato-avatar");
  const bubble = document.getElementById("pixelTomatoBubble");
  
  // 1. 触发跳跃萌动动画
  if (avatar) {
    avatar.classList.remove("jumping");
    void avatar.offsetWidth; // 触发 reflow 重置动画
    avatar.classList.add("jumping");
    setTimeout(() => avatar.classList.remove("jumping"), 500);
  }

  // 2. 播放空灵轻音声学反馈
  if (typeof playChime === "function") {
    playChime();
  }

  // 3. 随机切换名师鼓励台词
  let nextIdx = Math.floor(Math.random() * PIXEL_TOMATO_QUOTES.length);
  if (nextIdx === lastQuoteIdx) nextIdx = (nextIdx + 1) % PIXEL_TOMATO_QUOTES.length;
  lastQuoteIdx = nextIdx;

  if (bubble) {
    bubble.textContent = PIXEL_TOMATO_QUOTES[nextIdx];
    bubble.classList.add("active");
    clearTimeout(bubbleTimeout);
    bubbleTimeout = setTimeout(() => {
      bubble.classList.remove("active");
    }, 3500);
  }
}


// 左上角可爱番茄 Q 版像素人点击互动
function onBrandClick() {
  const brandLogo = document.getElementById("brandPixelLogo");
  if (brandLogo) {
    brandLogo.classList.remove("jumping");
    void brandLogo.offsetWidth;
    brandLogo.classList.add("jumping");
    setTimeout(() => brandLogo.classList.remove("jumping"), 500);
  }
  if (typeof playChime === "function") {
    playChime();
  }
  switchTab("pomodoro");
}


// --- 22. 全场景智能备考提醒系统 (桌面通知 / 定时闹钟 / 护眼关怀) ---
function showToast(msg, duration = 3500) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const item = document.createElement("div");
  item.className = "toast-item";
  item.innerHTML = msg;
  container.appendChild(item);
  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(-12px) scale(0.95)";
    item.style.transition = "all 0.3s ease";
    setTimeout(() => item.remove(), 300);
  }, duration);
}

async function requestSystemNotificationPermission() {
  if (!("Notification" in window)) {
    showToast("⚠️ 当前环境不支持浏览器系统级通知，已为您启用站内声画弹窗提醒！");
    return false;
  }
  if (Notification.permission === "granted") {
    userState.reminders.systemNotification = true;
    saveState();
    showToast("✅ 系统级桌面通知已处于授权开启状态！");
    updateReminderModalUI();
    return true;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      userState.reminders.systemNotification = true;
      saveState();
      showToast("🎉 授权成功！系统级桌面提醒已开启！");
    } else {
      userState.reminders.systemNotification = false;
      saveState();
      showToast("ℹ️ 未获得桌面通知权限，系统将自动使用站内声画弹窗提醒。");
    }
  } catch (e) {
    showToast("ℹ️ 浏览器暂未授权系统通知，将采用站内弹窗提醒。");
  }
  updateReminderModalUI();
}

function sendSystemNotification(title, body) {
  // 触发小番茄人物形象动画弹窗 + 空灵颂钵轻音 + 系统通知
  showTomatoAlert(title, body);
}

function checkScheduledReminders() {
  if (!userState.reminders || !userState.reminders.enabled) return;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const curTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const today = now.toISOString().slice(0, 10);
  const rem = userState.reminders;

  // 晨诵提醒 (默认 07:30)
  if (rem.morningEnabled && curTime === rem.morningTime && rem.lastMorningDate !== today) {
    rem.lastMorningDate = today;
    sendSystemNotification("🌅 疯狂过六级 · 晨诵时间到！", "大声朗读 Unit 核心母词与高频真题句，唤醒英语语感！");
    saveState();
  }

  // 日习提醒 (默认 14:00)
  if (rem.daytimeEnabled && curTime === rem.daytimeTime && rem.lastDaytimeDate !== today) {
    rem.lastDaytimeDate = today;
    sendSystemNotification("☀️ 疯狂过六级 · 日习心流时间到！", "开启番茄心流工坊，今日专注攻克高频大纲词！");
    saveState();
  }

  // 晚复盘提醒 (默认 21:00)
  if (rem.eveningEnabled && curTime === rem.eveningTime && rem.lastEveningDate !== today) {
    rem.lastEveningDate = today;
    sendSystemNotification("🌙 疯狂过六级 · 晚复盘对账时间到！", "对账今日 9+1 艾宾浩斯记忆矩阵，击溃遗忘曲线！");
    saveState();
  }

  // 45分钟久坐与防眼疲劳关怀提醒
  if (rem.eyeCareEnabled && userState.pomo && userState.pomo.isRunning) {
    const focusMins = Math.floor(userState.pomo.totalFocusMins || 0);
    if (focusMins > 0 && focusMins % 45 === 0 && focusMins !== (rem.lastEyeCareCheckMins || 0)) {
      rem.lastEyeCareCheckMins = focusMins;
      sendSystemNotification("🍵 护眼与久坐关怀提醒", `您已累计专注 ${focusMins} 分钟！喝口温水、眺望远方或活动眼球，保护视力更高效哦~`);
      saveState();
    }
  }
}

function openReminderModal() {
  const modal = document.getElementById("reminderModal");
  if (modal) {
    try {
      updateReminderModalUI();
    } catch (err) {
      console.warn("updateReminderModalUI error:", err);
    }
    modal.classList.add("open");
  } else {
    alert("提醒设置弹窗加载中，请稍候重试");
  }
}

function closeReminderModal() {
  const modal = document.getElementById("reminderModal");
  if (modal) {
    modal.classList.remove("open");
  }
}

function updateReminderModalUI() {
  if (!userState.reminders) return;
  const rem = userState.reminders;

  // 1. 同步普通选项控件
  const chkPomo = document.getElementById("chkRemPomo");
  const chkMorn = document.getElementById("chkRemMorning");
  const timeMorn = document.getElementById("timeRemMorning");
  const chkDay = document.getElementById("chkRemDaytime");
  const timeDay = document.getElementById("timeRemDaytime");
  const chkEve = document.getElementById("chkRemEvening");
  const timeEve = document.getElementById("timeRemEvening");
  const chkEye = document.getElementById("chkRemEyeCare");
  const chkPlan = document.getElementById("chkRemPlanGoal");

  if (chkPomo) chkPomo.checked = Boolean(rem.pomoEnd);
  if (chkMorn) chkMorn.checked = Boolean(rem.morningEnabled);
  if (timeMorn) timeMorn.value = rem.morningTime || "07:30";
  if (chkDay) chkDay.checked = Boolean(rem.daytimeEnabled);
  if (timeDay) timeDay.value = rem.daytimeTime || "14:00";
  if (chkEve) chkEve.checked = Boolean(rem.eveningEnabled);
  if (timeEve) timeEve.value = rem.eveningTime || "21:00";
  if (chkEye) chkEye.checked = Boolean(rem.eyeCareEnabled);
  if (chkPlan && userState.planGoal) chkPlan.checked = Boolean(userState.planGoal.eveningCheckEnabled);

  // 2. 深度优化系统推送授权看板状态
  const card = document.getElementById("remPermCard");
  const badge = document.getElementById("remPermBadge");
  const desc = document.getElementById("remPermDesc");
  const btnArea = document.getElementById("remPermActionBtn");
  const guideBtn = document.getElementById("btnToggleGuide");
  const guideBox = document.getElementById("remPermGuideBox");

  if (!("Notification" in window)) {
    if (badge) {
      badge.textContent = "⚠️ 环境不支持";
      badge.className = "perm-status-badge perm-badge-default";
    }
    if (desc) desc.textContent = "当前浏览器环境不支持系统级通知，系统已全自动降级启用【Q版小番茄跳舞动画 ＋ 颂钵轻音】站内全景提醒。";
    if (btnArea) btnArea.innerHTML = "";
    if (guideBtn) guideBtn.style.display = "none";
    return;
  }

  const perm = Notification.permission;
  const sysActive = Boolean(rem.systemNotification) && perm === "granted";

  if (perm === "granted") {
    if (card) {
      card.classList.remove("denied");
      card.classList.add("granted");
    }
    if (badge) {
      badge.textContent = sysActive ? "🟢 系统桌面通知已激活" : "⚪ 已授权 · 处于静音模式";
      badge.className = "perm-status-badge perm-badge-granted";
    }
    if (desc) {
      desc.textContent = sysActive
        ? "已成功接入操作系统推送引擎。即使最小化窗口、切换至其他页面或手机息屏，系统也能准时在屏幕角落弹出番茄钟与备考提醒。"
        : "您已完成系统通知授权，当前处于静音模式（仅触发站内小番茄动画与轻音）。点击右侧可随时恢复系统推送。";
    }
    if (btnArea) {
      btnArea.innerHTML = sysActive
        ? `<button class="btn-secondary" onclick="toggleSystemNotification(false)" style="padding:6px 14px; font-size:13px;">✅ 切换为仅站内提醒</button>`
        : `<button class="btn-primary" onclick="toggleSystemNotification(true)" style="padding:6px 14px; font-size:13px;">🔔 恢复系统级桌面推送</button>`;
    }
    if (guideBtn) guideBtn.style.display = "none";
    if (guideBox) guideBox.classList.remove("open");
  } else if (perm === "denied") {
    if (card) {
      card.classList.remove("granted");
      card.classList.add("denied");
    }
    if (badge) {
      badge.textContent = "🔴 浏览器已静音阻止";
      badge.className = "perm-status-badge perm-badge-denied";
    }
    if (desc) {
      desc.textContent = "当前浏览器设置了阻止发送通知。如需在后台接收备考闹钟与番茄提醒，请点击右侧查看解除阻止图文指引。";
    }
    if (btnArea) {
      btnArea.innerHTML = `<button class="btn-secondary" onclick="togglePermGuide()" style="padding:6px 14px; font-size:13px; font-weight:700;">📖 查看解除阻止指引</button>`;
    }
    if (guideBtn) guideBtn.style.display = "none";
  } else {
    // default (待授权)
    if (card) {
      card.classList.remove("granted", "denied");
    }
    if (badge) {
      badge.textContent = "🟡 待授权开启";
      badge.className = "perm-status-badge perm-badge-default";
    }
    if (desc) {
      desc.textContent = "点击下方按钮开启系统通知。授权后，切屏查资料、查字典或最小化也不会错过心流番茄与备考闹钟！";
    }
    if (btnArea) {
      btnArea.innerHTML = `<button class="btn-primary" onclick="requestSystemNotificationPermission()" style="padding:6px 16px; font-size:13px; font-weight:700;">🔔 一键授权开启系统通知</button>`;
    }
    if (guideBtn) guideBtn.style.display = "none";
    if (guideBox) guideBox.classList.remove("open");
  }
}

async function requestSystemNotificationPermission() {
  if (!("Notification" in window)) {
    showToast("⚠️ 当前环境不支持浏览器系统级通知，已为您启用站内小番茄声画提醒！");
    return false;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      userState.reminders.systemNotification = true;
      saveState();
      showTomatoAlert("🎉 系统级桌面通知已激活！", "番茄Q酱已成功获得系统推送权限！今后即使切屏、最小化或息屏，也会准时为您播报心流与备考提醒！");
    } else {
      userState.reminders.systemNotification = false;
      saveState();
      showToast("🍅 番茄Q酱：未开启系统通知也没关系！本站已全自动启用【小番茄跳舞动画＋颂钵轻音】，依然能准时提醒您！");
    }
  } catch (e) {
    showToast("ℹ️ 浏览器暂未授权系统通知，将采用站内弹窗提醒。");
  }
  updateReminderModalUI();
}

function toggleSystemNotification(enable) {
  if (!userState.reminders) userState.reminders = {};
  userState.reminders.systemNotification = enable;
  saveState();
  updateReminderModalUI();
  showToast(enable ? "🔔 已恢复系统级桌面推送！" : "🔕 已切换为仅站内声画提醒，不弹出系统通知。");
}

function togglePermGuide() {
  const guideBox = document.getElementById("remPermGuideBox");
  if (guideBox) {
    guideBox.classList.toggle("open");
  }
}

function saveReminderSettings() {
  if (!userState.reminders) userState.reminders = {};
  const rem = userState.reminders;

  const chkPomo = document.getElementById("chkRemPomo");
  const chkMorn = document.getElementById("chkRemMorning");
  const timeMorn = document.getElementById("timeRemMorning");
  const chkDay = document.getElementById("chkRemDaytime");
  const timeDay = document.getElementById("timeRemDaytime");
  const chkEve = document.getElementById("chkRemEvening");
  const timeEve = document.getElementById("timeRemEvening");
  const chkEye = document.getElementById("chkRemEyeCare");
  const chkPlan = document.getElementById("chkRemPlanGoal");

  if (chkPomo) rem.pomoEnd = chkPomo.checked;
  if (chkMorn) rem.morningEnabled = chkMorn.checked;
  if (timeMorn) rem.morningTime = timeMorn.value;
  if (chkDay) rem.daytimeEnabled = chkDay.checked;
  if (timeDay) rem.daytimeTime = timeDay.value;
  if (chkEve) rem.eveningEnabled = chkEve.checked;
  if (timeEve) rem.eveningTime = timeEve.value;
  if (chkEye) rem.eyeCareEnabled = chkEye.checked;
  if (chkPlan && userState.planGoal) userState.planGoal.eveningCheckEnabled = chkPlan.checked;

  saveState();
  showToast("✅ 全量备考提醒设置已保存生效！");
  closeReminderModal();
}

function testReminderNotification() {
  sendSystemNotification("🎉 提醒功能测试成功！", "听到清脆磬声并看到此弹窗，表明您的备考提醒系统工作完全正常！");
}


// --- 23. 核心词及派生词专属通关计划与智能督学系统 ---
function initPlanGoal() {
  if (!userState.planGoal) {
    userState.planGoal = {
      enabled: true,
      targetDays: 30,
      startDate: new Date().toISOString().slice(0, 10),
      customDays: 30,
      todayLearnedIds: {},
      todayDate: new Date().toISOString().slice(0, 10),
      eveningCheckEnabled: true
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (!userState.planGoal.startDate) {
    userState.planGoal.startDate = today;
  }
  if (!userState.planGoal.todayDate || userState.planGoal.todayDate !== today) {
    userState.planGoal.todayDate = today;
    userState.planGoal.todayLearnedIds = {};
  }
}

function getPlanStats() {
  initPlanGoal();
  const totalCoreWords = 3304; // 10单元40课核心母词与派生词总量
  const learned = getLearnedWordsCount();
  const remaining = Math.max(0, totalCoreWords - learned);

  const now = new Date();
  const start = new Date(userState.planGoal.startDate || now);
  const diffMs = now.getTime() - start.getTime();
  const daysElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  
  const targetDays = userState.planGoal.targetDays || 30;
  const daysRemaining = Math.max(1, targetDays - daysElapsed);
  
  // 动态重算今日之后每日所需背诵量 (智能自动适配)
  const dailyQuota = Math.ceil(remaining / daysRemaining);

  // 今日已学打卡词数
  const todayCheckedCount = Object.keys(userState.planGoal.todayLearnedIds || {}).length;

  // 进度节奏判定 (Pace status)
  const expectedLearned = Math.min(totalCoreWords, Math.round((totalCoreWords / targetDays) * (daysElapsed + 1)));
  let paceStatus = "ontrack"; // "ahead", "ontrack", "behind"
  let paceText = "稳步推进中";
  let paceClass = "pace-ontrack";

  if (learned >= expectedLearned * 1.05 || (daysRemaining > 0 && dailyQuota <= Math.round(totalCoreWords / targetDays * 0.85))) {
    paceStatus = "ahead";
    paceText = "🟢 进度超前";
    paceClass = "pace-ahead";
  } else if (learned < expectedLearned * 0.85 || dailyQuota > Math.round(totalCoreWords / targetDays * 1.2)) {
    paceStatus = "behind";
    paceText = "🔴 进度落后 (每日指标已智能上调)";
    paceClass = "pace-behind";
  } else {
    paceStatus = "ontrack";
    paceText = "🟡 节奏正常";
    paceClass = "pace-ontrack";
  }

  const progressPercent = Math.min(100, Math.round((learned / totalCoreWords) * 1000) / 10);

  return {
    totalCoreWords,
    learned,
    remaining,
    targetDays,
    daysElapsed: daysElapsed + 1,
    daysRemaining,
    dailyQuota,
    todayCheckedCount,
    paceStatus,
    paceText,
    paceClass,
    progressPercent
  };
}

function setPlanDays(days) {
  initPlanGoal();
  userState.planGoal.targetDays = parseInt(days);
  userState.planGoal.customDays = parseInt(days);
  // 重置起算时间为今日，开启全新周期
  userState.planGoal.startDate = new Date().toISOString().slice(0, 10);
  saveState();
  renderPlanGoalDashboard();
  renderVocabPlanBanner();
  showToast(`🎯 已设定 ${days} 天搞定 3304 个核心词及派生词计划！`);
}

function setCustomPlanDays(days) {
  days = Math.max(1, Math.min(180, parseInt(days) || 30));
  setPlanDays(days);
}

function renderPlanGoalDashboard() {
  const container = document.getElementById("planGoalDashboard");
  if (!container) return;

  const s = getPlanStats();
  const presets = [15, 30, 45, 60];

  container.innerHTML = `
    <div class="plan-goal-card">
      <div class="plan-goal-header">
        <div>
          <span class="hero-badge" style="background:var(--tomato-soft); color:var(--tomato-dark); border-color:rgba(217,72,52,0.3);">🎯 核心词与派生词通关计划目标</span>
          <h3 style="font-size:var(--font-xl); font-weight:800; color:var(--text-main); margin-top:4px;">全书 3,304 词智能通关进度与每日任务看板</h3>
          <p style="font-size:var(--font-sm); color:var(--text-muted); margin-top:2px;">自主选择备考天数，系统根据剩余待学词量实时动态分配每日指标，智能纠偏！</p>
        </div>
        <div class="plan-preset-group">
          <span style="font-size:13px; font-weight:700; color:var(--text-muted);">计划周期：</span>
          ${presets.map(p => `
            <button class="plan-preset-btn ${s.targetDays === p ? "active" : ""}" onclick="setPlanDays(${p})">
              ${p}天 ${p === 15 ? "冲刺" : (p === 30 ? "强化" : (p === 45 ? "稳健" : "从容"))}
            </button>
          `).join("")}
          <div style="display:inline-flex; align-items:center; gap:4px; margin-left:6px;">
            <input type="number" min="1" max="180" value="${s.targetDays}" class="reminder-time-input" style="width:60px; text-align:center;" onchange="setCustomPlanDays(this.value)" title="自定义目标天数">
            <span style="font-size:12px; color:var(--text-muted);">天</span>
          </div>
        </div>
      </div>

      <!-- 核心指标网格 -->
      <div class="plan-stats-grid">
        <div class="plan-stat-box">
          <div class="plan-stat-val">${s.totalCoreWords}</div>
          <div class="plan-stat-lbl">词汇总量 (母词+派生)</div>
        </div>
        <div class="plan-stat-box">
          <div class="plan-stat-val" style="color:var(--sage-green);">${s.learned}</div>
          <div class="plan-stat-lbl">已背诵打卡 (词)</div>
        </div>
        <div class="plan-stat-box">
          <div class="plan-stat-val highlight-val">${s.remaining}</div>
          <div class="plan-stat-lbl">剩余待背 (词)</div>
        </div>
        <div class="plan-stat-box">
          <div class="plan-stat-val">${s.daysRemaining} / ${s.targetDays}</div>
          <div class="plan-stat-lbl">剩余天数 / 计划总期</div>
        </div>
        <div class="plan-stat-box" style="border-color:var(--tomato-coral); background:var(--tomato-soft);">
          <div class="plan-stat-val highlight-val" style="font-size:calc(26px * var(--font-scale));">${s.dailyQuota}</div>
          <div class="plan-stat-lbl" style="color:var(--tomato-dark); font-weight:700;">每日需背指标 (词/天)</div>
        </div>
      </div>

      <!-- 总体进度条与节奏状态 -->
      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px; flex-wrap:wrap; gap:8px;">
        <div style="font-size:13.5px; font-weight:700; color:var(--text-main);">
          通关总进度：<strong style="color:var(--tomato-red); font-size:16px;">${s.progressPercent}%</strong>
          <span style="font-size:12px; color:var(--text-muted); margin-left:8px;">(今日已打卡: <strong>${s.todayCheckedCount}</strong> / 目标 ${s.dailyQuota} 词)</span>
        </div>
        <div class="plan-pace-badge ${s.paceClass}">${s.paceText}</div>
      </div>
      <div class="plan-progress-container">
        <div class="plan-progress-bar" style="width: ${s.progressPercent}%;"></div>
      </div>
    </div>
  `;
}

function renderVocabPlanBanner() {
  const container = document.getElementById("vocabPlanBanner");
  if (!container) return;

  const s = getPlanStats();
  container.innerHTML = `
    <div class="vocab-plan-compact-banner">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span style="font-size:14px; font-weight:800; color:var(--text-main);">🎯 核心词通关计划 (${s.targetDays}天周期)：</span>
        <span style="font-size:13px; color:var(--text-body);">
          今日目标需背 <strong>${s.dailyQuota}</strong> 词 ｜ 今日已打卡 <strong style="color:var(--sage-green);">${s.todayCheckedCount}</strong> 词 ｜ 剩余待学 <strong>${s.remaining}</strong> 词
        </span>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="plan-pace-badge ${s.paceClass}" style="font-size:12px; padding:2px 10px;">${s.paceText}</div>
        <button class="btn-secondary" onclick="switchTab('planner')" style="padding:3px 10px; font-size:12px;">调整计划 ⚙️</button>
      </div>
    </div>
  `;
}

// 记录今日打卡并在达成指标时发声与弹窗激励
function trackDailyPlanCheck(wordId) {
  initPlanGoal();
  if (!userState.planGoal.todayLearnedIds) userState.planGoal.todayLearnedIds = {};
  userState.planGoal.todayLearnedIds[wordId] = true;
  saveState();

  const s = getPlanStats();
  // 检查是否恰好达成今日指标
  if (s.todayCheckedCount === s.dailyQuota && s.dailyQuota > 0) {
    if (typeof playChime === "function") playChime();
    showToast(`🎉 太棒了！今日 ${s.dailyQuota} 词背诵目标已圆满达成！继续保持，疯狂过六级！🏆`);
  }
}


// --- 24. 小番茄人物形象动画提醒专属弹窗 (声画双重沉浸提醒) ---
let tomatoAlertAutoTimer = null;

function showTomatoAlert(title, body, type = "normal") {
  // 1. 播放空灵轻音声学反馈
  if (typeof playChime === "function") {
    playChime();
  }

  // 2. 移除已有弹窗
  closeTomatoAlert();

  // 3. 构建小番茄人物形象专属动画弹窗
  const overlay = document.createElement("div");
  overlay.className = "tomato-alert-overlay";
  overlay.id = "tomatoAlertOverlay";
  overlay.onclick = function(e) {
    if (e.target === overlay) closeTomatoAlert();
  };

  overlay.innerHTML = `
    <div class="tomato-alert-card" onclick="event.stopPropagation()">
      <div class="tomato-avatar-stage">
        <!-- 粒子星星与小番茄 -->
        <div class="tomato-particles-wrap">
          <span class="tomato-particle p1">✨</span>
          <span class="tomato-particle p2">🍅</span>
          <span class="tomato-particle p3">🌟</span>
          <span class="tomato-particle p4">🎉</span>
        </div>
        <!-- 64x64 欢脱起舞小番茄人物像素画 -->
        <svg class="tomato-dancing-svg" viewBox="0 0 32 32" shape-rendering="crispEdges">
          <!-- 绿叶与叶柄 -->
          <rect x="14" y="2" width="4" height="4" fill="#2E7D32" />
          <rect x="12" y="4" width="8" height="2" fill="#43A047" />
          <rect x="10" y="6" width="12" height="2" fill="#66BB6A" />
          <rect x="8" y="6" width="2" height="2" fill="#388E3C" />
          <rect x="22" y="6" width="2" height="2" fill="#388E3C" />
          <rect x="6" y="8" width="4" height="2" fill="#4CAF50" />
          <rect x="22" y="8" width="4" height="2" fill="#4CAF50" />

          <!-- 番茄身体暗部轮廓 -->
          <rect x="8" y="8" width="16" height="2" fill="#C62828" />
          <rect x="6" y="10" width="20" height="2" fill="#D32F2F" />
          <rect x="4" y="12" width="24" height="12" fill="#E53935" />
          <rect x="6" y="24" width="20" height="2" fill="#D32F2F" />
          <rect x="8" y="26" width="16" height="2" fill="#C62828" />

          <!-- 高光亮点 -->
          <rect x="8" y="12" width="4" height="2" fill="#FF8A80" />
          <rect x="6" y="14" width="2" height="4" fill="#FF8A80" />

          <!-- 元气星星大眼睛 (眨眼动效) -->
          <rect class="pixel-eye" x="9" y="14" width="4" height="4" fill="#1A1A1A" />
          <rect x="9" y="14" width="2" height="2" fill="#FFFFFF" />
          <rect x="11" y="16" width="1" height="1" fill="#FFFFFF" />

          <rect class="pixel-eye" x="19" y="14" width="4" height="4" fill="#1A1A1A" />
          <rect x="19" y="14" width="2" height="2" fill="#FFFFFF" />
          <rect x="21" y="16" width="1" height="1" fill="#FFFFFF" />

          <!-- 元气红晕小腮红 -->
          <rect x="5" y="18" width="4" height="2" fill="#FF4081" opacity="0.9" />
          <rect x="23" y="18" width="4" height="2" fill="#FF4081" opacity="0.9" />

          <!-- 兴奋张开的大笑嘴巴 -->
          <rect x="13" y="18" width="6" height="3" fill="#880E4F" />
          <rect x="14" y="20" width="4" height="2" fill="#FF5252" />

          <!-- 像素欢脱小脚丫 (欢快踏步) -->
          <rect class="pixel-foot-left" x="9" y="28" width="4" height="3" fill="#B71C1C" />
          <rect class="pixel-foot-right" x="19" y="28" width="4" height="3" fill="#B71C1C" />
        </svg>
      </div>

      <div class="tomato-alert-tag">🍅 疯狂过六级 · 番茄Q酱提醒</div>
      <div class="tomato-alert-title">${title}</div>
      <div class="tomato-alert-body">${body}</div>

      <button class="tomato-alert-confirm-btn" onclick="closeTomatoAlert()">我知道啦！继续加油 ✨</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // 4. 自动在 5.5 秒后平滑淡出
  clearTimeout(tomatoAlertAutoTimer);
  tomatoAlertAutoTimer = setTimeout(() => {
    closeTomatoAlert();
  }, 5500);

  // 5. 触发系统级桌面通知 (如果授权)
  if (userState.reminders && userState.reminders.systemNotification && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body: body,
        icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='4' y='12' width='24' height='12' fill='%23E53935'/><rect x='14' y='2' width='4' height='6' fill='%234CAF50'/></svg>"
      });
    } catch (e) {
      console.log("Desktop notification error:", e);
    }
  }
}

function closeTomatoAlert() {
  clearTimeout(tomatoAlertAutoTimer);
  const overlay = document.getElementById("tomatoAlertOverlay");
  if (overlay) {
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.25s ease";
    setTimeout(() => overlay.remove(), 260);
  }
}


// --- 25. 打卡系统专项优化 (整课一键打卡 / 到期复习池 / 月历看板 / 成就战报) ---

// 1. 艾宾浩斯各周期时间窗口常量 (毫秒)
const EBING_INTERVALS = [
  { key: "s0", name: "5分", ms: 5 * 60 * 1000 },
  { key: "s1", name: "30分", ms: 30 * 60 * 1000 },
  { key: "s2", name: "12时", ms: 12 * 60 * 60 * 1000 },
  { key: "l0", name: "1天", ms: 24 * 60 * 60 * 1000 },
  { key: "l1", name: "2天", ms: 2 * 24 * 60 * 60 * 1000 },
  { key: "l2", name: "4天", ms: 4 * 24 * 60 * 60 * 1000 },
  { key: "l3", name: "7天", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "l4", name: "14天", ms: 14 * 24 * 60 * 60 * 1000 },
  { key: "l5", name: "21天", ms: 21 * 24 * 60 * 60 * 1000 }
];

// 检测单个单词是否有已到期且未复习的节点
function getWordDueStage(wordId) {
  const r = userState.learned ? userState.learned[wordId] : null;
  if (!r || !r.first || !r.firstTime) return null;

  const elapsed = Date.now() - r.firstTime;
  for (let i = 0; i < EBING_INTERVALS.length; i++) {
    const item = EBING_INTERVALS[i];
    let isChecked = false;
    if (item.key.startsWith("s")) {
      const idx = parseInt(item.key.slice(1));
      isChecked = r.short && r.short[idx];
    } else {
      const idx = parseInt(item.key.slice(1));
      isChecked = r.long && r.long[idx];
    }
    // 如果已到达该时间节点但尚未勾选，返回此建议节点
    if (elapsed >= item.ms && !isChecked) {
      return item.name;
    }
  }
  return null;
}

// 统计全库当前到期需复习的单词总数
function getDueReviewWordsCount() {
  if (!window.CET6_DATA || !window.CET6_DATA.coreUnits) return 0;
  let count = 0;
  window.CET6_DATA.coreUnits.forEach(u => {
    u.lessons.forEach(l => {
      l.words.forEach(w => {
        if (getWordDueStage(w.id)) count++;
      });
    });
  });
  return count;
}

function toggleDueFilter() {
  userState.filterDue = !userState.filterDue;
  const btn = document.getElementById("btnFilterDue");
  if (btn) btn.classList.toggle("active", userState.filterDue);
  renderVocabSection();
  recordStreakActivity(1);
  defendTodayStreak("word", 1);
}

// 2. 整课一键批量打卡与清空
function batchCheckCurrentLesson(markAll) {
  if (!window.CET6_DATA || !window.CET6_DATA.coreUnits) return;
  const currentU = window.CET6_DATA.coreUnits.find(u => u.unit === userState.currentUnit);
  if (!currentU) return;
  const currentL = currentU.lessons.find(l => l.lesson === userState.currentLesson);
  if (!currentL || !currentL.words) return;

  const wordCount = currentL.words.length;
  if (markAll) {
    currentL.words.forEach(w => {
      if (!userState.learned[w.id]) {
        userState.learned[w.id] = {
          first: true,
          firstTime: Date.now(),
          short: [false, false, false],
          long: [false, false, false, false, false, false],
          star: false
        };
      } else {
        userState.learned[w.id].first = true;
        if (!userState.learned[w.id].firstTime) userState.learned[w.id].firstTime = Date.now();
      }
      trackDailyPlanCheck(w.id);
    });

    // 记录今日足迹
    recordStreakActivity(wordCount);

    if (typeof playChime === "function") playChime();
    showToast(`⚡ 成功完成 Lesson ${userState.currentLesson} 整课一键打卡！共打卡 ${wordCount} 词！🎉`);
  } else {
    if (confirm(`确定要清空 Lesson ${userState.currentLesson} 当前课时所有单词的打卡标记吗？`)) {
      currentL.words.forEach(w => {
        if (userState.learned[w.id]) {
          if (!userState.learned[w.id].star) {
            delete userState.learned[w.id];
          } else {
            userState.learned[w.id].first = false;
            userState.learned[w.id].short = [false, false, false];
            userState.learned[w.id].long = [false, false, false, false, false, false];
          }
        }
      });
      showToast(`🔄 已清空当前课时的打卡标记。`);
    }
  }

  saveState();
  renderVocabSection();
  recordStreakActivity(1);
  defendTodayStreak("word", 1);
}

// 记录当日打卡历史活动
function recordStreakActivity(wordDelta = 1) {
  const today = new Date().toISOString().slice(0, 10);
  if (!userState.streakHistory) userState.streakHistory = {};
  if (!userState.streakHistory[today]) {
    userState.streakHistory[today] = { words: 0, pomo: 0 };
  }
  userState.streakHistory[today].words += wordDelta;
}

// 3. 动态渲染打卡足迹月历看板
function renderStreakCalendar() {
  const container = document.getElementById("streakCalendarContainer");
  if (!container) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayStr = getLocalDateStr(now);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const days = userState.streakDays || 1;
  const tier = getStreakTier(days);
  const isDefended = isTodayStreakDefended();

  let html = `
    <div class="streak-calendar-card">
      <!-- 连胜段位与今日状态横幅 -->
      <div class="streak-tier-banner">
        <div class="streak-tier-left">
          <div class="streak-tier-icon-wrap">
            <span class="streak-flame-icon ${isDefended ? "on-fire" : ""}">${tier.icon}</span>
          </div>
          <div class="streak-tier-info">
            <div class="streak-tier-name">
              <span>当前段位：【${tier.name}】</span>
              <span class="streak-defense-status-badge ${isDefended ? "defense-active" : "defense-risk"}">
                ${isDefended ? "🔥 今日连胜已保卫" : "⚠️ 今日待续火"}
              </span>
            </div>
            <div class="streak-tier-sub">
              已连续打卡 <strong>${days}</strong> 天 ｜ ${tier.desc}
              ${tier.nextTier ? ` ｜ 距【${tier.nextTier.name}】还差 <strong>${tier.daysToNext}</strong> 天` : ""}
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="streak-shield-capsule" title="断签时可用于拯救连胜记录">
            <span>❄️ 保卫盾牌：<strong id="makeupCardBalance">${userState.streakFreezes || 1}</strong> 张</span>
          </div>
          <button class="btn-primary" onclick="showAchievementReportModal()" style="padding:6px 14px; font-size:13px;">🏆 今日战报</button>
        </div>
      </div>

      <div class="calendar-header">
        <div>
          <h4 style="font-size:var(--font-md); font-weight:800; color:var(--text-main);">
            🗓️ ${year} 年 ${month + 1} 月备考打卡足迹
          </h4>
        </div>
        <div style="font-size:12px; color:var(--text-muted);">
          完成背词、番茄钟、闪卡或计划任务，均可全自动续火！
        </div>
      </div>

      <div class="calendar-grid">
        ${weekdays.map(w => `<div class="calendar-weekday-title">周${w}</div>`).join("")}
  `;

  // 空白占位
  for (let i = 0; i < firstDayOfWeek; i++) {
    html += `<div class="calendar-day-box empty-day"></div>`;
  }

  // 渲染日期格
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isToday = dStr === todayStr;
    const isFuture = dStr > todayStr;
    const rec = userState.streakHistory ? userState.streakHistory[dStr] : null;

    let hasStudy = false;
    let badgeText = "";
    let boxClass = "calendar-day-box";

    if (isFuture) {
      boxClass += " empty-day";
    } else if (rec) {
      if (rec.isMakeup) {
        boxClass += " active-day";
        hasStudy = true;
        badgeText = "❄️ 补签";
      } else if ((rec.words && rec.words >= 10) || (rec.pomo && rec.pomo >= 1) || (rec.morning && rec.daytime && rec.evening)) {
        boxClass += " active-day";
        hasStudy = true;
        badgeText = rec.pomo > 0 ? `🍅 ${rec.pomo}个` : (rec.words ? `${rec.words}词` : "🔥 达标");
      }
    }

    if (isToday) boxClass += " today-day";

    html += `
      <div class="${boxClass}" onclick="handleCalendarDayClick('${dStr}')" title="${dStr}${hasStudy ? (rec && rec.isMakeup ? '：❄️补卡保卫（点击可撤销并退还盾牌）' : '：🔥已打卡保卫（点击可撤销）') : (isToday ? '：今日打卡' : '：未打卡（点击可使用盾牌补签）')}">
        <span class="calendar-day-num">${d}</span>
        ${hasStudy ? `<span class="calendar-day-badge">${badgeText}</span>` : (isToday && !isDefended ? '<span style="font-size:10px; color:var(--tomato-red);">待续火</span>' : '')}
      </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// 补卡挽救机制
// 补卡挽救机制 (支持月历点击撤回退盾)
function useStreakFreeze() {
  if (!userState.streakFreezes || userState.streakFreezes <= 0) {
    showToast("⚠️ 当前没有剩余的能量保卫盾啦！每周坚持学习可自动获赠！");
    return;
  }
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getLocalDateStr(yesterdayDate);

  if (!userState.streakHistory) userState.streakHistory = {};
  if (userState.streakHistory[yesterday] && isDateStreakDefended(yesterday)) {
    showToast(`ℹ️ 昨日（${yesterday}）已处于保卫状态，无需补签。`);
    return;
  }

  userState.streakHistory[yesterday] = {
    words: 20,
    pomo: 1,
    flash: 15,
    morning: true,
    daytime: true,
    evening: true,
    isMakeup: true
  };
  userState.streakFreezes--;
  userState.streakDays = calculateCurrentStreak();
  saveState();
  renderStreakCalendar();
  updateStreakDisplay();
  if (typeof playChime === "function") playChime();
  showToast(`🎉 补签成功！已消耗 1 张保卫盾，为您成功守卫连胜天数！（月历点击该日可随时撤销退盾）🔥`);
}

// 4. 今日打卡成就战报海报弹窗
function showAchievementReportModal() {
  const modal = document.getElementById("achievementModal");
  if (!modal) return;

  const today = getLocalDateStr();
  const totalLearned = getLearnedWordsCount();
  const mastered = getMasteredWordsCount();
  const tomatoes = userState.pomo ? userState.pomo.todayTomatoes : 0;
  const streak = userState.streakDays || 1;
  const tier = getStreakTier(streak);
  const todayWords = (userState.streakHistory && userState.streakHistory[today]) ? (userState.streakHistory[today].words || 0) : 0;

  const posterText = `【🔥 疯狂过六级 · 今日通关战报】\n📅 日期：${today}\n🎯 连续打卡：${streak} 天【${tier.name}】\n📖 今日学习：${todayWords} 词 (累计已学 ${totalLearned} 词)\n🍅 收获番茄：${tomatoes} 颗\n🌟 9+1闭环深层掌握：${mastered} 词\n💬 战鼓长鸣：星光不问赶路人，12月12日稳稳过关！`;

  const txtEl = document.getElementById("achievementShareText");
  const numEl = document.getElementById("posterTodayWords");
  const streakEl = document.getElementById("posterStreakDays");
  const pomoEl = document.getElementById("posterTomatoes");

  if (txtEl) txtEl.value = posterText;
  if (numEl) numEl.textContent = todayWords;
  if (streakEl) streakEl.textContent = `${streak} 天`;
  if (pomoEl) pomoEl.textContent = `${tomatoes} 颗`;

  modal.classList.add("open");
  if (typeof playChime === "function") playChime();
}

function closeAchievementModal() {
  const modal = document.getElementById("achievementModal");
  if (modal) modal.classList.remove("open");
}

function copyAchievementText() {
  const txtEl = document.getElementById("achievementShareText");
  if (!txtEl) return;
  const text = txtEl.value;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("📋 战报文案已复制到剪贴板！快去朋友圈/备考打卡群晒一晒吧！✨");
    }).catch(() => {
      txtEl.select();
      document.execCommand("copy");
      showToast("📋 战报文案已复制到剪贴板！快去朋友圈/备考打卡群晒一晒吧！✨");
    });
  } else {
    txtEl.select();
    document.execCommand("copy");
    showToast("📋 战报文案已复制到剪贴板！快去朋友圈/备考打卡群晒一晒吧！✨");
  }
}

// 别名与全局函数挂载，保证任何方式调用均 100% 触发弹窗
const showAchievementReport = showAchievementReportModal;
if (typeof window !== "undefined") {
  window.showAchievementReportModal = showAchievementReportModal;
  window.showAchievementReport = showAchievementReportModal;
  window.closeAchievementModal = closeAchievementModal;
  window.copyAchievementText = copyAchievementText;
}


// --- 26. 全局双向倒排索引搜索引擎与 Spotlight 指挥台 (算法架构师 Carson & 设计师 Bailey 联合开发) ---
let globalWordIndex = null;
let currentFocusedResultIdx = -1;
let currentActiveSearchResults = [];

// 构建全库双向多字段倒排索引 (覆盖 3304 核心母词派生词 + 7375 闪过卡词)
function buildGlobalSearchIndex() {
  if (globalWordIndex) return globalWordIndex;
  if (!window.CET6_DATA) return [];

  const index = [];
  const seenWords = new Set();

  // 1. 索引核心词库 (带单元、课时、巧记秘籍与派生关系)
  if (window.CET6_DATA.coreUnits) {
    window.CET6_DATA.coreUnits.forEach(u => {
      if (!u.lessons) return;
      u.lessons.forEach(l => {
        if (!l.words) return;
        l.words.forEach(w => {
          const lower = (w.word || "").toLowerCase().trim();
          if (lower && !seenWords.has(lower)) {
            seenWords.add(lower);
            index.push({
              id: w.id,
              word: w.word,
              lowerWord: lower,
              phonetic: w.phonetic || "",
              pos: w.pos || "",
              meaning: w.meaning || "",
              tip_type: w.tip_type || "",
              tip: w.tip || "",
              unit: u.unit,
              lesson: l.lesson,
              isCore: true
            });
          }

          // 索引派生词
          if (w.derivations) {
            w.derivations.forEach(d => {
              const dLower = (d.word || "").toLowerCase().trim();
              if (dLower && !seenWords.has(dLower)) {
                seenWords.add(dLower);
                index.push({
                  id: w.id,
                  word: d.word,
                  lowerWord: dLower,
                  phonetic: d.phonetic || "",
                  pos: d.pos || "",
                  meaning: d.meaning || "",
                  tip_type: "派生",
                  tip: `母词: ${w.word} (Unit ${u.unit} · Lesson ${l.lesson})`,
                  unit: u.unit,
                  lesson: l.lesson,
                  isCore: true,
                  isDeriv: true
                });
              }
            });
          }
        });
      });
    });
  }

  // 2. 索引闪过卡专属基础词
  if (window.CET6_DATA.flashCardDecks && window.CET6_DATA.flashCardDecks.all_shuffled) {
    const flashList = window.CET6_DATA.flashCardDecks.all_shuffled.words || [];
    flashList.forEach(fw => {
      const lower = (fw.word || "").toLowerCase().trim();
      if (lower && !seenWords.has(lower)) {
        seenWords.add(lower);
        index.push({
          id: "",
          word: fw.word,
          lowerWord: lower,
          phonetic: "",
          pos: "",
          meaning: fw.meaning || "",
          tip_type: "闪卡",
          tip: "六级大纲闪过词",
          unit: 0,
          lesson: 0,
          isCore: false
        });
      }
    });
  }

  globalWordIndex = index;
  console.log(`[SearchEngine] 全局搜索索引构建完成，共索引 ${index.length} 个词汇条目！`);
  return globalWordIndex;
}

// 多字段加权打分检索算法
function searchGlobalWords(rawQuery) {
  const query = (rawQuery || "").trim().toLowerCase();
  if (!query) return [];

  const index = buildGlobalSearchIndex();
  const scored = [];

  for (let i = 0; i < index.length; i++) {
    const item = index[i];
    let score = 0;
    let matchField = "";

    // 1. 英文完全匹配 (最高权重 100)
    if (item.lowerWord === query) {
      score = 100;
      matchField = "word_exact";
    }
    // 2. 英文前缀匹配 (权重 80)
    else if (item.lowerWord.startsWith(query)) {
      score = 80 - Math.min(20, item.lowerWord.length - query.length);
      matchField = "word_prefix";
    }
    // 3. 英文子串包含 (权重 50)
    else if (item.lowerWord.includes(query)) {
      score = 50;
      matchField = "word_sub";
    }
    // 4. 中文释义精准包含 (权重 40)
    else if (item.meaning.includes(query)) {
      score = 40;
      matchField = "meaning";
    }
    // 5. 巧记秘籍关键词命中 (权重 30)
    else if (item.tip && item.tip.includes(query)) {
      score = 30;
      matchField = "tip";
    }

    if (score > 0) {
      // 核心母词额外轻微提权 (+5分)
      if (item.isCore && !item.isDeriv) score += 5;
      scored.push({ item, score, matchField });
    }
  }

  // 按得分由高到低降序排序，限制前 35 条以保障丝滑帧率
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 35);
}

// 打开 Spotlight 搜索大弹窗
function openGlobalSearchModal(initialQuery = "") {
  const modal = document.getElementById("globalSearchModal");
  const input = document.getElementById("spotlightSearchInput");
  if (!modal || !input) return;

  buildGlobalSearchIndex();
  modal.classList.add("open");

  if (initialQuery) {
    input.value = initialQuery;
  } else {
    const topInput = document.getElementById("globalSearchInput");
    if (topInput && topInput.value) input.value = topInput.value;
  }

  renderSearchHistoryAndTags();
  renderSearchResults(input.value);

  setTimeout(() => {
    try {
      if (input && typeof input.focus === "function") input.focus();
      if (input && typeof input.select === "function") input.select();
    } catch (e) {}
  }, 50);
}

// 关闭 Spotlight 搜索弹窗

// 全局搜索弹窗函数双向别名与 window 挂载
const openGlobalSearch = openGlobalSearchModal;
const closeGlobalSearch = closeGlobalSearchModal;
if (typeof window !== "undefined") {
  window.openGlobalSearchModal = openGlobalSearchModal;
  window.openGlobalSearch = openGlobalSearchModal;
  window.closeGlobalSearchModal = closeGlobalSearchModal;
  window.closeGlobalSearch = closeGlobalSearchModal;
}

function closeGlobalSearchModal() {
  const modal = document.getElementById("globalSearchModal");
  if (modal) modal.classList.remove("open");
  currentFocusedResultIdx = -1;
}

// 渲染搜索历史与常考热搜词群标签
// 渲染搜索历史与常考热搜词群标签 (支持逐项独立删除)
function renderSearchHistoryAndTags() {
  const historyWrap = document.getElementById("searchHistoryPills");
  const hotTagsWrap = document.getElementById("searchHotTagsPills");
  if (!historyWrap) return;

  // 1. 渲染历史搜索词 (带 ✕ 删除按钮)
  const history = userState.searchHistory || [];
  if (history.length === 0) {
    historyWrap.innerHTML = '<span style="font-size:11.5px;color:var(--text-dim);">无历史</span>';
  } else {
    historyWrap.innerHTML = history.slice(0, 6).map(term => `
      <span class="search-tag-pill" onclick="applySearchTerm('${term.replace(/'/g, "\'")}')" title="点击填入搜索">
        <span>${term}</span>
        <button class="pill-del-btn" onclick="deleteSingleSearchHistory('${term.replace(/'/g, "\'")}', event)" title="删除此条历史记录">✕</button>
      </span>
    `).join("");
  }

  // 2. 渲染常考词群标签 (带 ✕ 删除与重置能力)
  if (hotTagsWrap) {
    if (!userState.hotSearchTags) {
      userState.hotSearchTags = [
        { label: "🌟 抱负", term: "ambition" },
        { label: "📈 经济", term: "economic" },
        { label: "🌱 生态", term: "environment" },
        { label: "⚡ 科技", term: "technology" }
      ];
    }
    const tags = userState.hotSearchTags;
    if (tags.length === 0) {
      hotTagsWrap.innerHTML = '<button class="btn-secondary" onclick="resetDefaultHotTags()" style="padding:1px 6px; font-size:11px; border-radius:4px;">🔄 恢复预设词群</button>';
    } else {
      hotTagsWrap.innerHTML = tags.map((t, idx) => `
        <span class="search-tag-pill" onclick="applySearchTerm('${t.term.replace(/'/g, "\'")}')" title="点击搜索该词群核心词">
          <span>${t.label}</span>
          <button class="pill-del-btn" onclick="deleteHotSearchTag(${idx}, event)" title="移除此词群标签">✕</button>
        </span>
      `).join("");
    }
  }
}

// 单条删除历史搜索词
function deleteSingleSearchHistory(term, e) {
  if (e) e.stopPropagation();
  if (!userState.searchHistory) return;
  userState.searchHistory = userState.searchHistory.filter(t => t !== term);
  saveState();
  renderSearchHistoryAndTags();
  showToast(`🗑️ 已移除搜索词：“${term}”`);
}

// 单条删除常考词群标签
function deleteHotSearchTag(idx, e) {
  if (e) e.stopPropagation();
  if (!userState.hotSearchTags) return;
  const removed = userState.hotSearchTags.splice(idx, 1);
  saveState();
  renderSearchHistoryAndTags();
  showToast(`🗑️ 已移除词群标签：“${removed[0] ? removed[0].label : ""}”`);
}

// 恢复默认预设常考词群标签
function resetDefaultHotTags() {
  userState.hotSearchTags = [
    { label: "🌟 抱负", term: "ambition" },
    { label: "📈 经济", term: "economic" },
    { label: "🌱 生态", term: "environment" },
    { label: "⚡ 科技", term: "technology" }
  ];
  saveState();
  renderSearchHistoryAndTags();
  showToast("✨ 已恢复默认常考词群标签！");
}

function applySearchTerm(term) {
  const input = document.getElementById("spotlightSearchInput");
  if (!input) return;
  input.value = term;
  renderSearchResults(term);
  input.focus();
}

function addSearchHistory(term) {
  term = (term || "").trim();
  if (!term || term.length < 2) return;
  if (!userState.searchHistory) userState.searchHistory = [];
  userState.searchHistory = userState.searchHistory.filter(t => t.toLowerCase() !== term.toLowerCase());
  userState.searchHistory.unshift(term);
  if (userState.searchHistory.length > 10) userState.searchHistory = userState.searchHistory.slice(0, 10);
  saveState();
}

function clearSearchHistory() {
  userState.searchHistory = [];
  saveState();
  renderSearchHistoryAndTags();
  showToast("🗑️ 搜索历史已清空！");
}

// 关键词高亮辅助函数
function highlightText(text, query) {
  if (!query || !text) return text || "";
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}

// 渲染搜索结果列表
function renderSearchResults(query) {
  const listEl = document.getElementById("searchResultsList");
  const countEl = document.getElementById("searchResultCountDisplay");
  if (!listEl) return;

  currentFocusedResultIdx = -1;
  const results = searchGlobalWords(query);
  currentActiveSearchResults = results;

  if (countEl) {
    countEl.textContent = query ? `找到 ${results.length} 条匹配结果` : "输入英汉关键词搜索";
  }

  if (!query.trim()) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:36px 20px; color:var(--text-muted);">
        <div style="font-size:36px; margin-bottom:8px;">🔍</div>
        <p style="font-size:15px; font-weight:700;">支持中英文双向实时模糊检索</p>
        <p style="font-size:12.5px; color:var(--text-dim); margin-top:4px;">支持搜单词、搜音标、搜中文释义、搜名师口诀（如“俺必胜”反查 ambition）</p>
      </div>
    `;
    return;
  }

  if (results.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:36px 20px; color:var(--text-muted);">
        <div style="font-size:36px; margin-bottom:8px;">🍃</div>
        <p style="font-size:15px; font-weight:700;">未在全库中检索到包含 “${query}” 的条目</p>
        <p style="font-size:12.5px; color:var(--text-dim); margin-top:4px;">可尝试缩短关键词，或检索同义中文/前缀</p>
      </div>
    `;
    return;
  }

  let html = "";
  results.forEach((res, idx) => {
    const item = res.item;
    const wordHl = highlightText(item.word, query);
    const meanHl = highlightText(item.meaning, query);
    const tipHl = item.tip ? highlightText(item.tip, query) : "";

    html += `
      <div class="search-result-item ${idx === 0 ? "active-focused" : ""}" id="search_res_${idx}" onclick="onSearchResultClick(${idx})">
        <div class="search-item-left">
          <div class="search-item-title-row">
            <span class="search-item-word">${wordHl}</span>
            ${item.phonetic ? `<span class="search-item-phonetic">${item.phonetic}</span>` : ""}
            ${item.pos ? `<span class="search-item-pos">${item.pos}</span>` : ""}
            ${item.isCore ? `<span class="pixel-live-tag" style="font-size:10px;">Unit ${item.unit} · L${item.lesson}</span>` : `<span style="font-size:10px; color:var(--text-muted); background:var(--bg-subtle); padding:1px 5px; border-radius:4px;">闪过卡词</span>`}
          </div>
          <div class="search-item-meaning">${meanHl}</div>
          ${tipHl ? `<div class="search-item-tip">💡 [${item.tip_type || "巧记"}] ${tipHl}</div>` : ""}
        </div>
        
        <div class="search-item-actions" onclick="event.stopPropagation()">
          <button class="audio-speak-btn" onclick="speakWord('${item.word.replace(/'/g, "\\'")}')" title="朗读发音">🔊</button>
          ${item.isCore ? `
            <button class="search-locate-btn" onclick="jumpToWordUnit(${item.unit}, ${item.lesson}, '${item.id}')">🎯 定位课时</button>
          ` : `
            <button class="search-locate-btn" onclick="switchTab('flash'); closeGlobalSearchModal();" style="background:var(--bg-subtle); color:var(--text-body);">⚡ 闪卡</button>
          `}
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
  currentFocusedResultIdx = 0;
}

// 点击搜索条目逻辑
function onSearchResultClick(idx) {
  const res = currentActiveSearchResults[idx];
  if (!res) return;

  const item = res.item;
  addSearchHistory(document.getElementById("spotlightSearchInput").value);

  if (item.isCore && item.id) {
    jumpToWordUnit(item.unit, item.lesson, item.id);
  } else {
    speakWord(item.word);
    closeGlobalSearchModal();
    showToast(`📖 已检索到单词：<strong>${item.word}</strong><br>${item.meaning}`);
  }
}

// 一键定位跳转到单词所在单元并脉冲高亮
function jumpToWordUnit(unitNum, lessonNum, wordId) {
  closeGlobalSearchModal();
  switchTab("vocab");

  userState.currentUnit = parseInt(unitNum);
  userState.currentLesson = parseInt(lessonNum);
  userState.filterStarred = false;
  userState.filterUnlearned = false;
  userState.filterDue = false;
  userState.searchQuery = "";

  saveState();
  renderVocabSection();

  // 稍等 DOM 渲染后平滑滚动到该词
  setTimeout(() => {
    const card = document.getElementById(`card_${wordId}`);
    if (card) {
      if (card && typeof card.scrollIntoView === "function") { try { card.scrollIntoView({ behavior: "smooth", block: "center" }); } catch(e){ card.scrollIntoView(); } }
      card.classList.remove("search-pulse-focus");
      void card.offsetWidth; // 触发 reflow
      card.classList.add("search-pulse-focus");
      setTimeout(() => card.classList.remove("search-pulse-focus"), 2800);
      showToast(`🎯 已为你精准定位至 Unit ${unitNum} · Lesson ${lessonNum}！`);
    }
  }, 200);
}

// 全键盘上下与回车快捷导航
function handleSpotlightKeyDown(e) {
  if (e.key === "Escape") {
    closeGlobalSearchModal();
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (currentActiveSearchResults.length === 0) return;
    currentFocusedResultIdx = (currentFocusedResultIdx + 1) % currentActiveSearchResults.length;
    updateFocusedResultItem();
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (currentActiveSearchResults.length === 0) return;
    currentFocusedResultIdx = (currentFocusedResultIdx - 1 + currentActiveSearchResults.length) % currentActiveSearchResults.length;
    updateFocusedResultItem();
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    if (currentFocusedResultIdx >= 0 && currentFocusedResultIdx < currentActiveSearchResults.length) {
      onSearchResultClick(currentFocusedResultIdx);
    }
  }
}

function updateFocusedResultItem() {
  document.querySelectorAll(".search-result-item").forEach((el, i) => {
    el.classList.toggle("active-focused", i === currentFocusedResultIdx);
    if (i === currentFocusedResultIdx) {
      if (el && typeof el.scrollIntoView === "function") { try { el.scrollIntoView({ block: "nearest" }); } catch(e){} }
    }
  });
}


// --- 27. 全局智能撤销中枢与防误触回退系统 (Carson & Bailey 联合研发) ---
let globalUndoStack = []; // [{ id, description, undoFn }]
let undoCapsuleTimer = null;
let lastFlashcardState = null; // 记录闪卡上一张卡片状态

// 注册一项可撤回的操作 (在屏幕底部唤起优雅悬浮撤销胶囊)
function registerUndoAction(description, undoFn, timeoutMs = 6000) {
  const action = {
    id: Date.now(),
    description: description,
    undoFn: undoFn
  };
  globalUndoStack.push(action);
  // 保留最多 5 条撤销记录
  if (globalUndoStack.length > 5) globalUndoStack.shift();

  showUndoCapsule(action, timeoutMs);
}

// 触发撤回上一步操作
function triggerGlobalUndo() {
  if (globalUndoStack.length === 0) {
    showToast("ℹ️ 当前没有可撤销的操作");
    return;
  }
  const action = globalUndoStack.pop();
  if (action && typeof action.undoFn === "function") {
    action.undoFn();
    hideUndoCapsule();
    if (typeof playChime === "function") playChime();
    showToast(`↺ 已成功撤回操作：“${action.description}”！`);
  }
}

// 显示底部悬浮撤销胶囊
function showUndoCapsule(action, timeoutMs = 6000) {
  let capsule = document.getElementById("undoFloatingCapsule");
  if (!capsule) {
    capsule = document.createElement("div");
    capsule.id = "undoFloatingCapsule";
    capsule.className = "undo-floating-capsule";
    document.body.appendChild(capsule);
  }

  capsule.innerHTML = `
    <span class="undo-capsule-text">
      <span>⚡</span>
      <span>${action.description}</span>
    </span>
    <button class="undo-capsule-btn" onclick="triggerGlobalUndo()" title="快捷键 Ctrl+Z">
      <span>↺ 撤回</span>
      <kbd style="font-size:10px; opacity:0.85; margin-left:2px;">Ctrl+Z</kbd>
    </button>
    <button class="undo-capsule-close" onclick="hideUndoCapsule()" title="关闭">✕</button>
  `;

  capsule.classList.remove("active");
  void capsule.offsetWidth; // 触发 reflow
  capsule.classList.add("active");

  clearTimeout(undoCapsuleTimer);
  undoCapsuleTimer = setTimeout(() => {
    hideUndoCapsule();
  }, timeoutMs);
}

function hideUndoCapsule() {
  clearTimeout(undoCapsuleTimer);
  const capsule = document.getElementById("undoFloatingCapsule");
  if (capsule) {
    capsule.classList.remove("active");
  }
}

// 1. 3D 闪卡专用回退撤销
function undoLastFlashcardMark() {
  if (!lastFlashcardState) {
    showToast("ℹ️ 暂无可撤回的闪卡记录");
    return;
  }
  userState.speedFlash.currentIndex = lastFlashcardState.prevIndex;
  renderCurrent3DCard();
  hideUndoCapsule();
  if (typeof playChime === "function") playChime();
  showToast(`↺ 已回退至上一个单词：【${lastFlashcardState.prevWord}】`);
  lastFlashcardState = null;
}


// --- 28. 连胜打卡全场景深度优化系统 (段位火苗 / 双态保卫 / 全自动续火 / 历程图腾) ---
const STREAK_TIERS = [
  { min: 1, max: 3, name: "新芽破土", icon: "🌱", desc: "连胜起点，破土而出", color: "#4CAF50" },
  { min: 4, max: 7, name: "习惯初成", icon: "🔥", desc: "连续一周，炽热火苗", color: "#FF7043" },
  { min: 8, max: 14, name: "飞轮自驱", icon: "⚡", desc: "连续双周，心流蓝焰", color: "#29B6F6" },
  { min: 15, max: 21, name: "潜意识固化", icon: "💎", desc: "连续三周，永久神经突触", color: "#AB47BC" },
  { min: 22, max: 9999, name: "传奇封神", icon: "👑", desc: "月度全满贯，六级战神！", color: "#FBC02D" }
];

function getStreakTier(days) {
  days = Math.max(1, parseInt(days) || 1);
  for (let i = 0; i < STREAK_TIERS.length; i++) {
    const t = STREAK_TIERS[i];
    if (days >= t.min && days <= t.max) {
      const nextTier = STREAK_TIERS[i + 1] || null;
      const daysToNext = nextTier ? nextTier.min - days : 0;
      return { ...t, nextTier, daysToNext };
    }
  }
  return { ...STREAK_TIERS[0], nextTier: STREAK_TIERS[1], daysToNext: 3 };
}

// 检查今日连胜是否已经成功保卫
// 判定指定日期是否已达到续火/保卫标准
function isDateStreakDefended(dateStr) {
  if (!userState.streakHistory) return false;
  const r = userState.streakHistory[dateStr];
  if (!r) return false;
  return Boolean(
    (r.words && r.words >= 10) ||
    (r.pomo && r.pomo >= 1) ||
    (r.flash && r.flash >= 15) ||
    (r.morning && r.daytime && r.evening) ||
    r.isMakeup
  );
}

// 检查今日连胜是否已经成功保卫
function isTodayStreakDefended() {
  const today = new Date().toISOString().slice(0, 10);
  return isDateStreakDefended(today);
}

// 动态高精度计算当前连续打卡天数
function calculateCurrentStreak() {
  const today = new Date().toISOString().slice(0, 10);
  const isDefendedToday = isTodayStreakDefended();

  // 如果历史打卡池有记录，计算回溯连续天数
  let streak = isDefendedToday ? 1 : 0;
  const d = new Date();
  d.setDate(d.getDate() - 1);

  let historyCount = 0;
  while (historyCount < 365) {
    historyCount++;
    const dStr = getLocalDateStr(d);
    if (isDateStreakDefended(dStr)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  // 若历史打卡库刚开始记录，且历史推算值小于现有天数，则以安全基线结合今日状态计算
  if (streak <= 1 && userState.streakDays && userState.streakDays > 1) {
    return isDefendedToday ? userState.streakDays : Math.max(1, userState.streakDays - 1);
  }

  return Math.max(1, streak);
}

function _unused_isTodayStreakDefended() {
  const today = new Date().toISOString().slice(0, 10);
  const r = userState.streakHistory && userState.streakHistory[today];
  if (!r) return false;
  return Boolean(
    (r.words && r.words >= 10) ||
    (r.pomo && r.pomo >= 1) ||
    (r.morning && r.daytime && r.evening) ||
    r.isMakeup
  );
}

// 全场景多通道自动续火保卫 (背词 / 番茄 / 闪卡 / 习惯任一达成即自动点亮)
function defendTodayStreak(channel, delta = 1) {
  const today = new Date().toISOString().slice(0, 10);
  if (!userState.streakHistory) userState.streakHistory = {};
  if (!userState.streakHistory[today]) {
    userState.streakHistory[today] = { words: 0, pomo: 0, flash: 0, isMakeup: false };
  }
  const rec = userState.streakHistory[today];

  const wasDefendedBefore = isTodayStreakDefended();

  // 累加对应维度的活动量
  if (channel === 'word') rec.words = (rec.words || 0) + delta;
  if (channel === 'pomo') rec.pomo = (rec.pomo || 0) + delta;
  if (channel === 'flash') rec.flash = (rec.flash || 0) + delta;

  const isNowDefended = isTodayStreakDefended();

  // 今日首次成功点亮续火！
  if (!wasDefendedBefore && isNowDefended) {
    const oldTier = getStreakTier(userState.streakDays || 1);
    userState.streakDays = calculateCurrentStreak();
    const newTier = getStreakTier(userState.streakDays);

    saveState();
    updateStreakDisplay();
    renderStreakCalendar();

    if (typeof playChime === "function") playChime();

    // 检查是否晋升新段位
    if (newTier.name !== oldTier.name) {
      if (typeof showTomatoAlert === "function") {
        showTomatoAlert(`🏆 恭喜晋升连胜段位【${newTier.name}】！`, `已达成连续打卡 ${userState.streakDays} 天！${newTier.desc}，继续保持势头！`);
      }
    } else {
      showToast(`🔥 叮！今日连胜已成功点亮续火！已达成 <strong>${userState.streakDays}</strong> 天连胜！`);
    }
  } else {
    saveState();
    updateStreakDisplay();
    renderStreakCalendar();
  }
}


// --- 29. 取消打卡与连胜反悔中枢 (支持撤销今日打卡 / 撤销补卡) ---

// 一键取消今日全部打卡状态
function cancelTodayCheckin() {
  const today = new Date().toISOString().slice(0, 10);
  const hadHabits = Boolean(userState.habits && (userState.habits.morning || userState.habits.daytime || userState.habits.evening));
  const hadHistory = Boolean(userState.streakHistory && userState.streakHistory[today] && (
    userState.streakHistory[today].words > 0 ||
    userState.streakHistory[today].pomo > 0 ||
    userState.streakHistory[today].flash > 0 ||
    userState.streakHistory[today].morning ||
    userState.streakHistory[today].daytime ||
    userState.streakHistory[today].evening ||
    userState.streakHistory[today].isMakeup
  ));

  if (!hadHabits && !hadHistory && !isTodayStreakDefended()) {
    showToast("ℹ️ 今日尚未打卡，无需取消。");
    return;
  }

  if (confirm("⚠️ 确定要取消今日的所有打卡记录吗？\n此操作将重置今日晨诵/日习/晚复盘打卡与连胜续火状态，今日连胜火苗将恢复为【待续火】。")) {
    // 备份快照以便撤回 (Undo)
    const savedHabits = { ...(userState.habits || {}) };
    const savedHistory = userState.streakHistory ? JSON.parse(JSON.stringify(userState.streakHistory[today] || {})) : null;
    const savedDays = userState.streakDays || 1;

    // 1. 重置今日习惯打卡
    userState.habits.morning = false;
    userState.habits.daytime = false;
    userState.habits.evening = false;

    const mChk = document.getElementById("habitMorningCheck");
    const dChk = document.getElementById("habitDayCheck");
    const nChk = document.getElementById("habitNightCheck");
    if (mChk) mChk.checked = false;
    if (dChk) dChk.checked = false;
    if (nChk) nChk.checked = false;

    // 2. 清零今日连胜历史记录中的习惯与续火量
    if (userState.streakHistory && userState.streakHistory[today]) {
      userState.streakHistory[today].morning = false;
      userState.streakHistory[today].daytime = false;
      userState.streakHistory[today].evening = false;
      userState.streakHistory[today].words = 0;
      userState.streakHistory[today].pomo = 0;
      userState.streakHistory[today].flash = 0;
      userState.streakHistory[today].isMakeup = false;
    }

    // 3. 重新核算连续天数
    userState.streakDays = calculateCurrentStreak();
    saveState();
    updateStreakDisplay();
    renderStreakCalendar();
    if (typeof renderPlannerSection === "function") renderPlannerSection();
    if (typeof renderPlanGoalDashboard === "function") renderPlanGoalDashboard();

    // 4. 注册 8 秒反悔急救胶囊 (支持一键撤销取消操作)
    registerUndoAction("已取消今日打卡状态", () => {
      userState.habits = savedHabits;
      if (mChk) mChk.checked = Boolean(savedHabits.morning);
      if (dChk) dChk.checked = Boolean(savedHabits.daytime);
      if (nChk) nChk.checked = Boolean(savedHabits.evening);
      if (savedHistory && userState.streakHistory) {
        userState.streakHistory[today] = savedHistory;
      }
      userState.streakDays = savedDays;
      saveState();
      updateStreakDisplay();
      renderStreakCalendar();
      if (typeof renderPlannerSection === "function") renderPlannerSection();
      if (typeof renderPlanGoalDashboard === "function") renderPlanGoalDashboard();
      showToast("✨ 已恢复今日打卡记录与连胜火苗！");
    }, 8000);

    showToast("↺ 已成功取消今日全部打卡状态！火苗已恢复为待续火。");
  }
}

// 扩展日历点击逻辑，支持点击已打卡日期直接取消/撤销打卡
// 扩展日历点击逻辑，支持点击已打卡日期直接取消/撤销打卡与退还保卫盾牌
function handleCalendarDayClick(dateStr) {
  const todayStr = getLocalDateStr();
  const history = userState.streakHistory || {};
  const rec = history[dateStr];

  // 1. 如果点击的是【今日】
  if (dateStr === todayStr) {
    if (isTodayStreakDefended() || (rec && (rec.morning || rec.daytime || rec.evening || (rec.words && rec.words > 0) || (rec.pomo && rec.pomo > 0)))) {
      cancelTodayCheckin();
      return;
    } else {
      showToast("📝 今日尚未打卡，完成背词、番茄钟或能力闭环即可自动打卡保卫连胜！");
      return;
    }
  }

  // 2. 如果点击的是【未来日期】
  if (dateStr > todayStr) {
    showToast("⏳ 该日期为未来日期，请按计划稳步推进！");
    return;
  }

  // 3. 如果点击的是【已打卡或已补卡的历史日期】
  const isDefended = rec && Boolean(
    rec.isMakeup ||
    (rec.words && rec.words >= 10) ||
    (rec.pomo && rec.pomo >= 1) ||
    (rec.flash && rec.flash >= 15) ||
    (rec.morning && rec.daytime && rec.evening)
  );

  if (isDefended) {
    const isMakeupDay = Boolean(rec.isMakeup);
    const confirmMsg = isMakeupDay
      ? `⚠️ 确定要撤销【${dateStr}】的补卡记录吗？\n\n点击“确定”将彻底撤销该日补签，并将此前消耗的 1 张【能量保卫盾牌】全额退还 (+1)！`
      : `⚠️ 确定要撤销【${dateStr}】的历史打卡记录吗？\n（当时记录：背词 ${rec.words || 0} 词，专注番茄 ${rec.pomo || 0} 个）\n\n点击“确定”后该日期将恢复为未打卡状态，连胜天数将重新核算。 `;

    if (confirm(confirmMsg)) {
      // 备份以便 8 秒急救撤回
      const savedRec = JSON.parse(JSON.stringify(rec));
      const wasMakeup = isMakeupDay;

      // 彻底删除该日打卡记录，确保月历和连胜核算彻底恢复未打卡
      delete userState.streakHistory[dateStr];

      // 若为补签卡，全额退还保卫盾牌
      if (wasMakeup) {
        userState.streakFreezes = (userState.streakFreezes || 0) + 1;
      }

      // 重新高精度核算连续打卡天数
      userState.streakDays = calculateCurrentStreak();
      saveState();
      renderStreakCalendar();
      updateStreakDisplay();
      if (typeof renderPlanGoalDashboard === "function") renderPlanGoalDashboard();

      // 注册 8 秒反悔急救胶囊
      registerUndoAction(`已撤销【${dateStr}】${wasMakeup ? "补卡" : "打卡"}`, () => {
        if (!userState.streakHistory) userState.streakHistory = {};
        userState.streakHistory[dateStr] = savedRec;
        if (wasMakeup) {
          userState.streakFreezes = Math.max(0, (userState.streakFreezes || 1) - 1);
        }
        userState.streakDays = calculateCurrentStreak();
        saveState();
        renderStreakCalendar();
        updateStreakDisplay();
        if (typeof renderPlanGoalDashboard === "function") renderPlanGoalDashboard();
      }, 8000);

      const successToast = wasMakeup
        ? `↺ 已成功撤销【${dateStr}】补卡！能量保卫盾牌已退还 (+1)！`
        : `↺ 已成功撤销【${dateStr}】的打卡记录！`;
      showToast(successToast);
      return;
    }
    return;
  }

  // 4. 如果点击的是【未打卡的历史日期】 -> 触发补签
  const dayMs = 86400000;
  const todayDate = new Date(todayStr + "T00:00:00");
  const targetDate = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((todayDate - targetDate) / dayMs);

  if (diffDays > 31) {
    showToast("⚠️ 能量保卫盾仅支持补签 30 天以内的历史记录哦！");
    return;
  }

  if ((userState.streakFreezes || 0) <= 0) {
    showToast("❌ 当前没有剩余的【能量保卫盾】啦！每周坚持学习可自动获赠！");
    return;
  }

  if (confirm(`是否消耗 1 张能量保卫盾，补签【${dateStr}】并拯救连续打卡天数？\n\n（提示：补签后若误触，再次点击该日期即可随时撤销并全额退还盾牌！）`)) {
    userState.streakFreezes--;
    if (!userState.streakHistory) userState.streakHistory = {};
    userState.streakHistory[dateStr] = {
      words: 20,
      pomo: 1,
      flash: 15,
      morning: true,
      daytime: true,
      evening: true,
      isMakeup: true
    };

    userState.streakDays = calculateCurrentStreak();
    saveState();
    renderStreakCalendar();
    updateStreakDisplay();
    if (typeof playChime === "function") playChime();
    showToast(`✨ 补卡成功！连续打卡天数已成功拯救为 ${userState.streakDays} 天！（再次点击此日可随时撤销退盾）`);
  }
}

// --- 30. 趣味性与互动游戏化系统 ---

// =========================================================================
// 《疯狂过六级》趣味性与互动游戏化核心引擎 (Fun & Gamification Engine)
// 包含：番茄Q酱5级成长树、8-bit复古音效合成、每日欧气刮刮乐盲盒、30秒极速词霸战、Canvas彩带
// 架构师：游戏化与内容交互架构师 Bailey & 网站总工程师
// =========================================================================

// 1. 纯 Web Audio 8-bit 复古像素音效引擎 (零外部音频依赖，100%离线顺畅运行)
let sharedPixelAudioCtx = null;
function getSharedAudioContext() {
  try {
    if (!sharedPixelAudioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) sharedPixelAudioCtx = new AudioContextClass();
    }
    if (sharedPixelAudioCtx && sharedPixelAudioCtx.state === "suspended") {
      sharedPixelAudioCtx.resume().catch(() => {});
    }
    return sharedPixelAudioCtx;
  } catch (e) {
    return null;
  }
}

function playPixelSound(type) {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === "coin") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(987.77, now);
      osc.frequency.setValueAtTime(1318.51, now + 0.08);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === "correct") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === "wrong") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(164.81, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === "combo") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const baseFreq = 440 + Math.min(600, (blitzState.combo || 1) * 60);
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
        } else if (type === "tick") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === "celebrate") {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.18, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.22);
      });
    }
  } catch (e) {}
}

// 2. 全屏 Canvas 七彩纸屑粒子喷泉动画 (Confetti Particle Burst)
function triggerConfettiBurst(originX, originY) {
  try {
    let canvas = document.getElementById("confettiCanvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "confettiCanvas";
      canvas.style.position = "fixed";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "99999";
      if (document.body && typeof document.body.appendChild === "function") {
        document.body.appendChild(canvas);
      }
    }

    if (!canvas || typeof canvas.getContext !== "function") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth || 1440;
    canvas.height = window.innerHeight || 900;

    const startX = originX || (canvas.width / 2);
    const startY = originY || (canvas.height / 2);

    const colors = ["#E05A47", "#5B8C5A", "#D4A373", "#F4A261", "#E76F51", "#2A9D8F", "#FFD166", "#06D6A0"];
    const particles = [];
    const particleCount = 70;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 4;
      particles.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vRotation: (Math.random() - 0.5) * 10,
        alpha: 1,
        gravity: 0.22
      });
    }

    if (typeof playPixelSound === "function") playPixelSound("celebrate");

    let animationFrame;
    function update() {
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = 0;

        particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;
          p.rotation += p.vRotation;
          p.alpha -= 0.012;

          if (p.alpha > 0) {
            alive++;
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
          }
        });

        if (alive > 0 && typeof window.requestAnimationFrame === "function") {
          animationFrame = window.requestAnimationFrame(update);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (typeof window.cancelAnimationFrame === "function") {
            window.cancelAnimationFrame(animationFrame);
          }
        }
      } catch (errLoop) {}
    }

    update();
  } catch (errBurst) {
    console.warn("triggerConfettiBurst fallback warning:", errBurst);
  }
}

// 3. 番茄Q酱养成成长体系 (Tomato Pet Tamagotchi)
const TOMATO_PET_STAGES = [
  { level: 1, name: "萌芽小番茄", icon: "🌱", minXP: 0, maxXP: 100, desc: "刚破土新生，渴望六级词汇甘霖！" },
  { level: 2, name: "抽枝小番茄", icon: "🌿", minXP: 100, maxXP: 300, desc: "枝繁叶茂，已掌握大量同根词汇！" },
  { level: 3, name: "翡翠青番茄", icon: "🍏", minXP: 300, maxXP: 600, desc: "青翠茁壮，听力阅读如入无人之境！" },
  { level: 4, name: "烈火红番茄", icon: "🍅", minXP: 600, maxXP: 1000, desc: "红润饱满，3304核心词信手拈来！" },
  { level: 5, name: "考神博士番茄", icon: "👑", minXP: 1000, maxXP: 99999, desc: "头戴博士帽，手持晓燕魔杖，600+稳过！" }
];

const TOMATO_MASCOT_QUOTES = [
  "“连单词都背不下来，你还怎么征服星辰大海？冲！”",
  "“晓燕老师说了：同根派生一网打尽，六级核心词根本不用死记硬背！”",
  "“刚才的番茄钟专注很棒！你的脑细胞正在光速建立神经连接！”",
  "“12月12日你就是考场上做题最快、涂卡最帅的仔！”",
  "“抗遗忘矩阵对账走起！战胜艾宾浩斯，六级高分稳稳拿捏！”",
  "“学累了吗？快来玩一把【30秒极速词霸大挑战】给大脑热热身！”",
  "“坚持连胜打卡，我的能量保卫盾牌时刻为你保驾护航！”",
  "“听说今天去【欧气刮刮乐】刮卡，能抽中今日压轴锦鲤考词哦！”",
  "“星光不问赶路人，时光不负有心人！加油！”",
  "“核心词母词搞定，阅读理解长难句一眼就能看透谓语动词！”"
];

function calculatePetXP() {
  const words = typeof getLearnedWordsCount === "function" ? getLearnedWordsCount() : 0;
  const tomatoes = userState.pomo ? (userState.pomo.todayTomatoes || 0) : 0;
  const streak = userState.streakDays || 1;
  const blitzScore = userState.blitzHighScore || 0;
  return (words * 2) + (tomatoes * 15) + (streak * 20) + Math.floor(blitzScore / 5);
}

function getPetCurrentStage(xp) {
  for (let i = TOMATO_PET_STAGES.length - 1; i >= 0; i--) {
    if (xp >= TOMATO_PET_STAGES[i].minXP) {
      return TOMATO_PET_STAGES[i];
    }
  }
  return TOMATO_PET_STAGES[0];
}

function updateTomatoPetBadge() {
  const xp = calculatePetXP();
  const stage = getPetCurrentStage(xp);

  const badgeEl = document.getElementById("headerPetBadge");
  const iconEl = document.getElementById("headerPetIcon");
  const xpBarEl = document.getElementById("headerPetXpBar");

  if (badgeEl) badgeEl.textContent = `LV.${stage.level} ${stage.name}`;
  if (iconEl) iconEl.textContent = stage.icon;

  if (xpBarEl) {
    let progress = 100;
    if (stage.level < 5) {
      const range = stage.maxXP - stage.minXP;
      const current = xp - stage.minXP;
      progress = Math.min(100, Math.max(0, Math.round((current / range) * 100)));
    }
    xpBarEl.style.width = `${progress}%`;
    xpBarEl.title = `经验值：${xp} XP (本级进度 ${progress}%)`;
  }
}

function onTomatoPetClick(event) {
  if (event) event.stopPropagation();
  playPixelSound("coin");

  const quote = TOMATO_MASCOT_QUOTES[Math.floor(Math.random() * TOMATO_MASCOT_QUOTES.length)];

  let bubble = document.getElementById("petSpeechBubble");
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.id = "petSpeechBubble";
    bubble.className = "pet-speech-bubble";
    document.body.appendChild(bubble);
  }

  const target = event ? event.currentTarget : document.querySelector(".tomato-pet-pill");
  const rect = target ? target.getBoundingClientRect() : { top: 70, left: 200, width: 60 };

  bubble.innerHTML = `
    <div style="font-weight:800; font-size:12px; color:var(--tomato-red); margin-bottom:4px;">🍅 番茄Q酱的悄悄话：</div>
    <div style="font-size:13.5px; line-height:1.6; color:var(--text-main);">${quote}</div>
  `;

  bubble.style.top = `${rect.top + window.scrollY + 45}px`;
  bubble.style.left = `${Math.max(10, Math.min(window.innerWidth - 280, rect.left + window.scrollX - 40))}px`;
  bubble.classList.add("show");

  clearTimeout(bubble._hideTimer);
  bubble._hideTimer = setTimeout(() => {
    bubble.classList.remove("show");
  }, 4500);
}

function showTomatoPetModal() {
  const xp = calculatePetXP();
  const stage = getPetCurrentStage(xp);
  const words = typeof getLearnedWordsCount === "function" ? getLearnedWordsCount() : 0;
  const streak = userState.streakDays || 1;
  const tomatoes = userState.pomo ? (userState.pomo.todayTomatoes || 0) : 0;

  const modal = document.getElementById("petGrowthModal");
  if (!modal) return;

  const stageIcon = document.getElementById("petModalStageIcon");
  const stageName = document.getElementById("petModalStageName");
  const stageDesc = document.getElementById("petModalStageDesc");
  const totalXpEl = document.getElementById("petModalTotalXp");
  const wordsXpEl = document.getElementById("petModalWordsXp");
  const pomoXpEl = document.getElementById("petModalPomoXp");
  const streakXpEl = document.getElementById("petModalStreakXp");
  const nextXpEl = document.getElementById("petModalNextXp");

  if (stageIcon) stageIcon.textContent = stage.icon;
  if (stageName) stageName.textContent = `LV.${stage.level} 【${stage.name}】`;
  if (stageDesc) stageDesc.textContent = stage.desc;
  if (totalXpEl) totalXpEl.textContent = `${xp} XP`;
  if (wordsXpEl) wordsXpEl.textContent = `+${words * 2} XP (${words}词)`;
  if (pomoXpEl) pomoXpEl.textContent = `+${tomatoes * 15} XP (${tomatoes}番茄)`;
  if (streakXpEl) streakXpEl.textContent = `+${streak * 20} XP (${streak}天连胜)`;

  if (nextXpEl) {
    if (stage.level >= 5) {
      nextXpEl.textContent = "已达最高考神等级！👑";
    } else {
      nextXpEl.textContent = `距下一级还需 ${Math.max(0, stage.maxXP - xp)} XP`;
    }
  }

  modal.classList.add("open");
  playPixelSound("coin");
}

function closeTomatoPetModal() {
  const modal = document.getElementById("petGrowthModal");
  if (modal) modal.classList.remove("open");
}

// =========================================================================
// 4. 30秒极速词霸大挑战竞技场 (Enlarged & Optimized Speed Word Blitz)
// 包含：倒计时、急促音效、Combo连击加成、键盘快捷键(A/B/←/→)、本轮词汇复盘清单
// =========================================================================
let blitzState = {
  active: false,
  timeLeft: 30,
  score: 0,
  combo: 0,
  maxCombo: 0,
  correctCount: 0,
  totalAnswered: 0,
  currentQuestion: null,
  timerInterval: null,
  roundReview: [] // 记录本轮测试的所有单词，用于对决结束后深度复盘
};

function showWordBlitzModal() {
  const modal = document.getElementById("wordBlitzModal");
  if (!modal) return;

  const highScoreEl = document.getElementById("blitzHighScoreText");
  if (highScoreEl) highScoreEl.textContent = userState.blitzHighScore || 0;

  document.getElementById("blitzLobbyScreen").style.display = "block";
  document.getElementById("blitzArenaScreen").style.display = "none";
  document.getElementById("blitzResultScreen").style.display = "none";

  modal.classList.add("open");
  playPixelSound("coin");
}

function closeWordBlitzModal() {
  clearInterval(blitzState.timerInterval);
  blitzState.active = false;
  const modal = document.getElementById("wordBlitzModal");
  if (modal) modal.classList.remove("open");
}

function startWordBlitzGame() {
  blitzState.active = true;
  blitzState.timeLeft = 30;
  blitzState.score = 0;
  blitzState.combo = 0;
  blitzState.maxCombo = 0;
  blitzState.correctCount = 0;
  blitzState.totalAnswered = 0;
  blitzState.roundReview = [];

  document.getElementById("blitzLobbyScreen").style.display = "none";
  document.getElementById("blitzArenaScreen").style.display = "block";
  document.getElementById("blitzResultScreen").style.display = "none";

  updateBlitzUI();
  generateNextBlitzQuestion();

  clearInterval(blitzState.timerInterval);
  blitzState.timerInterval = setInterval(() => {
    blitzState.timeLeft--;
    updateBlitzUI();

    // 剩余最后 5 秒触发心跳脉动警报音效
    if (blitzState.timeLeft <= 5 && blitzState.timeLeft > 0) {
      playPixelSound("tick");
    }

    if (blitzState.timeLeft <= 0) {
      endWordBlitzGame();
    }
  }, 1000);

  playPixelSound("coin");
}

function updateBlitzUI() {
  const timeEl = document.getElementById("blitzTimerNumber");
  const timeBarEl = document.getElementById("blitzTimerBar");
  const scoreEl = document.getElementById("blitzScoreLive");
  const comboEl = document.getElementById("blitzComboLive");

  if (timeEl) timeEl.textContent = blitzState.timeLeft;
  if (timeBarEl) {
    const pct = Math.max(0, (blitzState.timeLeft / 30) * 100);
    timeBarEl.style.width = pct + "%";
    timeBarEl.classList.toggle("urgent", blitzState.timeLeft <= 8);
  }
  if (scoreEl) scoreEl.textContent = blitzState.score;

  if (comboEl) {
    if (blitzState.combo >= 2) {
      let comboText = `🔥 COMBO x${blitzState.combo}!`;
      if (blitzState.combo >= 8) comboText = `👑 COMBO x${blitzState.combo} 考神降临!`;
      else if (blitzState.combo >= 5) comboText = `⚡ COMBO x${blitzState.combo} 超凡绝伦!`;
      else if (blitzState.combo >= 3) comboText = `🌟 COMBO x${blitzState.combo} 渐入佳境!`;
      comboEl.textContent = comboText;
      comboEl.style.display = "inline-block";
    } else {
      comboEl.style.display = "none";
    }
  }
}

function speakCurrentBlitzWord() {
  if (blitzState.currentQuestion && typeof speakWord === "function") {
    speakWord(blitzState.currentQuestion.word);
  }
}

function generateNextBlitzQuestion() {
  let list = window.CET6_FLASH_DATA || [];
  if (list.length < 5 && window.CET6_DATA && window.CET6_DATA.coreUnits) {
    list = [];
    window.CET6_DATA.coreUnits.forEach(u => {
      if (u.lessons) u.lessons.forEach(l => {
        if (l.words) l.words.forEach(w => list.push(w));
      });
    });
  }

  if (list.length === 0) return;

  const qWord = list[Math.floor(Math.random() * list.length)];
  let wrongWord = list[Math.floor(Math.random() * list.length)];
  let searchTries = 0;
  while (wrongWord.meaning === qWord.meaning && searchTries < 25) {
    searchTries++;
    wrongWord = list[Math.floor(Math.random() * list.length)];
  }

  const isOptionACorrect = Math.random() > 0.5;
  const optA = isOptionACorrect ? qWord.meaning : wrongWord.meaning;
  const optB = isOptionACorrect ? wrongWord.meaning : qWord.meaning;

  blitzState.currentQuestion = {
    word: qWord.word,
    phonetic: qWord.phonetic || "",
    correctMeaning: qWord.meaning,
    optA: optA,
    optB: optB,
    correctChoice: isOptionACorrect ? "A" : "B"
  };

  const wordEl = document.getElementById("blitzQuestionWord");
  const phonEl = document.getElementById("blitzQuestionPhonetic");
  const txtA = document.getElementById("blitzTextOptA");
  const txtB = document.getElementById("blitzTextOptB");
  const btnA = document.getElementById("blitzBtnOptA");
  const btnB = document.getElementById("blitzBtnOptB");

  if (wordEl) wordEl.textContent = qWord.word;
  if (phonEl) phonEl.textContent = qWord.phonetic || "";
  if (txtA) txtA.textContent = optA;
  if (txtB) txtB.textContent = optB;

  if (btnA) btnA.className = "blitz-choice-card";
  if (btnB) btnB.className = "blitz-choice-card";
}

function handleBlitzAnswer(choice) {
  if (!blitzState.active || !blitzState.currentQuestion) return;

  blitzState.totalAnswered++;
  const isCorrect = choice === blitzState.currentQuestion.correctChoice;
  const btn = choice === "A" ? document.getElementById("blitzBtnOptA") : document.getElementById("blitzBtnOptB");

  // 记录本轮复盘清单
  blitzState.roundReview.push({
    word: blitzState.currentQuestion.word,
    phonetic: blitzState.currentQuestion.phonetic,
    correctMeaning: blitzState.currentQuestion.correctMeaning,
    isCorrect: isCorrect
  });

  if (isCorrect) {
    blitzState.correctCount++;
    blitzState.combo++;
    if (blitzState.combo > blitzState.maxCombo) {
      blitzState.maxCombo = blitzState.combo;
    }
    const comboBonus = Math.min(30, (blitzState.combo - 1) * 5);
    blitzState.score += (10 + comboBonus);

    if (btn) btn.classList.add("correct-flash");
    playPixelSound(blitzState.combo >= 3 ? "combo" : "correct");

    if (typeof recordStreakActivity === "function") recordStreakActivity(1);
  } else {
    blitzState.combo = 0;
    blitzState.timeLeft = Math.max(0, blitzState.timeLeft - 2); // 答错扣 2 秒
    if (btn) btn.classList.add("wrong-flash");
    playPixelSound("wrong");
  }

  updateBlitzUI();
  setTimeout(generateNextBlitzQuestion, 160);
}

function endWordBlitzGame() {
  clearInterval(blitzState.timerInterval);
  blitzState.active = false;

  document.getElementById("blitzArenaScreen").style.display = "none";
  document.getElementById("blitzResultScreen").style.display = "block";

  const finalScoreEl = document.getElementById("blitzFinalScore");
  const maxComboEl = document.getElementById("blitzFinalCombo");
  const rankStampEl = document.getElementById("blitzRankStamp");
  const recordTipEl = document.getElementById("blitzRecordTip");
  const reviewListEl = document.getElementById("blitzReviewList");

  if (finalScoreEl) finalScoreEl.textContent = blitzState.score;
  const accRate = blitzState.totalAnswered > 0 ? Math.round((blitzState.correctCount / blitzState.totalAnswered) * 100) : 0;
  if (maxComboEl) maxComboEl.textContent = `🔥 巅峰连击：${blitzState.maxCombo} ｜ 答对：${blitzState.correctCount}/${blitzState.totalAnswered} 题 (正确率 ${accRate}%)`;

  // 评级大印章
  let rank = "B";
  let rankColor = "#2A9D8F";
  let rankTitle = "🌱 潜力新星";
  if (blitzState.score >= 180) { rank = "SSS"; rankColor = "#D4AF37"; rankTitle = "👑 词霸封神"; }
  else if (blitzState.score >= 120) { rank = "S"; rankColor = "#E05A47"; rankTitle = "🍅 单词收割机"; }
  else if (blitzState.score >= 70) { rank = "A"; rankColor = "#5B8C5A"; rankTitle = "🌿 进阶达人"; }

  if (rankStampEl) {
    rankStampEl.textContent = rank;
    rankStampEl.style.borderColor = rankColor;
    rankStampEl.style.color = rankColor;
  }

  // 破纪录判定
  const oldHigh = userState.blitzHighScore || 0;
  if (blitzState.score > oldHigh) {
    userState.blitzHighScore = blitzState.score;
    saveState();
    if (recordTipEl) recordTipEl.innerHTML = `🎉 <strong>恭喜打破历史最高纪录！</strong> (前纪录 ${oldHigh} 分 ｜ 荣获称号：${rankTitle})`;
    triggerConfettiBurst(window.innerWidth / 2, window.innerHeight / 2);
  } else {
    if (recordTipEl) recordTipEl.innerHTML = `当前历史最高纪录：${oldHigh} 分 ｜ 本轮战绩：${rankTitle}`;
    playPixelSound("celebrate");
  }

  // 渲染本轮对决词汇深度复盘清单
  if (reviewListEl) {
    if (blitzState.roundReview.length === 0) {
      reviewListEl.innerHTML = "<div style='color:var(--text-muted); font-size:13px; text-align:center;'>本轮暂无答题记录</div>";
    } else {
      let revHtml = "";
      blitzState.roundReview.forEach((item, idx) => {
        revHtml += `
          <div class="blitz-review-item ${item.isCorrect ? 'is-correct' : 'is-wrong'}">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:800; color:var(--text-main);">#${idx + 1} ${item.word}</span>
              <span style="font-size:12px; color:var(--text-muted);">${item.phonetic || ''}</span>
              <button type="button" class="audio-speak-btn" onclick="speakWord('${item.word}')" style="padding:2px 8px; font-size:11px;">🔊</button>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="color:var(--text-body); font-size:13px;">${item.correctMeaning}</span>
              <span style="font-weight:900; font-size:13px; color:${item.isCorrect ? 'var(--sage-green)' : 'var(--tomato-red)'};">
                ${item.isCorrect ? '✅ 答对' : '❌ 答错'}
              </span>
            </div>
          </div>
        `;
      });
      reviewListEl.innerHTML = revHtml;
    }
  }

  updateTomatoPetBadge(); if (typeof updateHeaderBlitzBadge === 'function') updateHeaderBlitzBadge();
}

// 键盘快捷键监听：支持 A / B 选项与空格键快速挑战
if (typeof document !== "undefined") {
  document.addEventListener("keydown", function(e) {
    const modal = document.getElementById("wordBlitzModal");
    if (!modal || !modal.classList.contains("open")) return;

    // 空格键：在大厅或结算页面一键开始/再战一把
    if (e.code === "Space" && !blitzState.active) {
      e.preventDefault();
      startWordBlitzGame();
      return;
    }

    // 竞技场答题快捷键
    if (blitzState.active) {
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft" || e.key === "1") {
        e.preventDefault();
        handleBlitzAnswer("A");
      } else if (e.key === "b" || e.key === "B" || e.key === "ArrowRight" || e.key === "2") {
        e.preventDefault();
        handleBlitzAnswer("B");
      }
    }
  });
}



// 动态更新顶栏图标按钮副标题 (显示用户历史战报)
function updateHeaderBlitzBadge() {
  const tagEl = document.getElementById("headerBlitzScoreTag");
  if (!tagEl) return;
  const high = userState.blitzHighScore || 0;
  if (high > 0) {
    tagEl.textContent = `🏆 纪录: ${high}分`;
  } else {
    tagEl.textContent = "⚡ 极速对决";
  }
}
