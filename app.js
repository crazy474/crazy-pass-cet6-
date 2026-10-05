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
  }
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

// --- 5. Web Speech API 真人朗读引擎 ---
function speakWord(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = 0.92;
  window.speechSynthesis.speak(utter);
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

  window.scrollTo({ top: 0, behavior: "smooth" });
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
  clearInterval(pomoTimerInterval);
  userState.pomo.isRunning = false;
  userState.pomo.overtimeSecs = 0;
  userState.pomo.timeLeft = userState.pomo.totalTime;
  const startBtn = document.getElementById("pomoStartBtn");
  if (startBtn) startBtn.innerHTML = "▶️ 开始专注";
  updatePomoDisplay();
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

  // 如果抗遗忘环上所有勾选均已取消，且未加入星标生词本，彻底删除该词的记录，实现精准计数扣减
  if (!isWordLearned(r) && !r.star) {
    delete userState.learned[wordId];
    if (userState.planGoal && userState.planGoal.todayLearnedIds) {
      delete userState.planGoal.todayLearnedIds[wordId];
    }
  } else if (isWordLearned(r)) {
    trackDailyPlanCheck(wordId);
  }

  saveState();
  renderVocabSection();
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
}

// --- 9. 极速闪视流与 3D 拟真翻转卡片 (Speed Flash & 3D Flashcards - 只要单词与词意，乱序随机模式) ---
let speedFlashTimer = null;
let speedMeaningTimer = null;
let isFlipped = false;

// 当前卡片包与洗牌状态
let currentDeckWords = [];

function initFlashcardSelectors() {
  const select = document.getElementById("flashUnitSelect");
  if (!select || !window.CET6_DATA || !window.CET6_DATA.flashCardDecks) return;
  select.innerHTML = "";
  
  const decks = window.CET6_DATA.flashCardDecks;
  Object.keys(decks).forEach(deckKey => {
    const opt = document.createElement("option");
    opt.value = deckKey;
    opt.textContent = decks[deckKey].title;
    if (deckKey === (userState.speedFlash.currentDeck || "all_shuffled")) opt.selected = true;
    select.appendChild(opt);
  });
  
  loadCurrentDeck();
}

function loadCurrentDeck() {
  const select = document.getElementById("flashUnitSelect");
  const deckKey = select ? select.value : (userState.speedFlash.currentDeck || "all_shuffled");
  userState.speedFlash.currentDeck = deckKey;
  
  const decks = window.CET6_DATA.flashCardDecks;
  if (decks && decks[deckKey]) {
    // 每次加载时保留其打乱顺序，同时克隆一份便于动态洗牌
    currentDeckWords = [...decks[deckKey].words];
  } else {
    currentDeckWords = [];
  }
  userState.speedFlash.currentIndex = 0;
}

function onFlashUnitChange() {
  loadCurrentDeck();
  pauseSpeedFlash();
  renderFlashWorkspace();
  saveState();
}

// 🔀 重新乱序洗牌 (Fisher-Yates 算法)
function reshuffleCurrentDeck() {
  if (!currentDeckWords || currentDeckWords.length <= 1) return;
  for (let i = currentDeckWords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentDeckWords[i], currentDeckWords[j]] = [currentDeckWords[j], currentDeckWords[i]];
  }
  userState.speedFlash.currentIndex = 0;
  pauseSpeedFlash();
  renderFlashWorkspace();
  
  // 提示动画或轻音
  if (typeof playChime === "function") playChime();
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

function renderFlashWorkspace() {
  if (!currentDeckWords || currentDeckWords.length === 0) {
    initFlashcardSelectors();
  }
  const stageFlash = document.getElementById("speedFlashStage");
  const stage3D = document.getElementById("flipCardStage");

  if (userState.speedFlash.mode === "flash") {
    if (stageFlash) stageFlash.style.display = "flex";
    if (stage3D) stage3D.style.display = "none";
    renderCurrentSpeedWord();
  } else {
    if (stageFlash) stageFlash.style.display = "none";
    if (stage3D) stage3D.style.display = "block";
    renderCurrent3DCard();
  }
}

// 极速闪视流播放控制 (只显示单词与词意)
function renderCurrentSpeedWord() {
  const words = getFlashWords();
  if (words.length === 0) return;
  if (userState.speedFlash.currentIndex >= words.length) userState.speedFlash.currentIndex = 0;
  if (userState.speedFlash.currentIndex < 0) userState.speedFlash.currentIndex = words.length - 1;

  const w = words[userState.speedFlash.currentIndex];
  const wordEl = document.getElementById("speedWordHero");
  const phonEl = document.getElementById("speedPhoneticHero");
  const meanEl = document.getElementById("speedMeaningHero");
  const progEl = document.getElementById("speedProgressHero");

  // 只要单词，以及词意
  if (wordEl) wordEl.textContent = w.word;
  if (phonEl) phonEl.textContent = ""; // 纯净模式不显示音标杂项
  if (meanEl) {
    meanEl.textContent = w.meaning;
    meanEl.classList.remove("revealed");
  }
  if (progEl) progEl.textContent = `第 ${userState.speedFlash.currentIndex + 1} / ${words.length} 词 · 乱序模式`;

  // 单词自动朗读
  speakWord(w.word);

  // 释义延时半透明浮现 (训练眼脑直觉)
  clearTimeout(speedMeaningTimer);
  const delay = Math.max(300, (userState.speedFlash.speed * 1000) * 0.45);
  speedMeaningTimer = setTimeout(() => {
    if (meanEl) meanEl.classList.add("revealed");
  }, delay);
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
  if (playBtn) playBtn.innerHTML = "⏸️ 暂停闪视";

  renderCurrentSpeedWord();
  speedFlashTimer = setInterval(() => {
    stepSpeedFlash(1);
  }, userState.speedFlash.speed * 1000);
}

function pauseSpeedFlash() {
  userState.speedFlash.isPlaying = false;
  clearInterval(speedFlashTimer);
  clearTimeout(speedMeaningTimer);
  const playBtn = document.getElementById("speedPlayBtn");
  if (playBtn) playBtn.innerHTML = "▶️ 开启闪视流";
}

function stepSpeedFlash(dir) {
  const words = getFlashWords();
  if (words.length === 0) return;
  userState.speedFlash.currentIndex = (userState.speedFlash.currentIndex + dir + words.length) % words.length;
  renderCurrentSpeedWord();
}

// 3D 拟真翻转卡片 (正面单词，反面词意)
function renderCurrent3DCard() {
  const words = getFlashWords();
  if (words.length === 0) return;
  if (userState.speedFlash.currentIndex >= words.length) userState.speedFlash.currentIndex = 0;
  if (userState.speedFlash.currentIndex < 0) userState.speedFlash.currentIndex = words.length - 1;

  const w = words[userState.speedFlash.currentIndex];
  const frontWord = document.getElementById("flipFrontWord");
  const frontPhon = document.getElementById("flipFrontPhonetic");
  const backMean = document.getElementById("flipBackMeaning");
  const progEl = document.getElementById("flipCardProgress");

  if (frontWord) frontWord.textContent = w.word;
  if (frontPhon) frontPhon.textContent = "";
  if (backMean) backMean.textContent = w.meaning;
  if (progEl) progEl.textContent = `第 ${userState.speedFlash.currentIndex + 1} / ${words.length} 张卡片 · 乱序模式`;

  // 重置正面
  isFlipped = false;
  const inner = document.getElementById("flipCardInner");
  if (inner) inner.classList.remove("flipped");
}

function flip3DCard() {
  isFlipped = !isFlipped;
  const inner = document.getElementById("flipCardInner");
  if (inner) inner.classList.toggle("flipped", isFlipped);
  if (isFlipped) {
    const words = getFlashWords();
    const w = words[userState.speedFlash.currentIndex];
    if (w) speakWord(w.word);
  }
}

function mark3DCard(status) {
  const words = getFlashWords();
  userState.speedFlash.currentIndex = (userState.speedFlash.currentIndex + 1) % words.length;
  renderCurrent3DCard();
}

function shuffle3DCards() {
  reshuffleCurrentDeck();
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
}

function onHabitChange(type, checkbox) {
  userState.habits[type] = checkbox.checked;
  // 检查是否三项全完成
  if (userState.habits.morning && userState.habits.daytime && userState.habits.evening) {
    playChime();
    alert("🎉 🎉 太棒了！今日【疯狂过六级】能力闭环打卡全部完成！连续打卡天数 +1！");
  }
  updateStreakDisplay();
  saveState();
}

function updateStreakDisplay() {
  const el = document.getElementById("plannerStreakDays");
  if (el) el.textContent = `${userState.streakDays} 天`;
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
    const searchInput = document.getElementById("globalSearchInput");
    if (searchInput) searchInput.focus();
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
    container.innerHTML = `<p style="font-size:14px; color:var(--text-muted); text-align:center; padding:20px;">系统运行中，将在今夜 00:00:00 自动生成第一份凌晨快照...</p>`;
    return;
  }

  let html = "";
  snapshots.forEach((snap, idx) => {
    const isLatest = idx === 0;
    html += `
      <div class="snapshot-item-card">
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
        <div style="display:flex; gap:8px;">
          <button class="btn-secondary" onclick="restoreSnapshot(${snap.id})" style="padding:6px 12px; font-size:13px;">🔄 恢复此版本</button>
          <button class="btn-secondary" onclick="downloadSnapshot(${snap.id})" style="padding:6px 12px; font-size:13px;">📥 导出JSON</button>
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

window.addEventListener("DOMContentLoaded", () => {
  loadState();
  setFontScale(userState.fontScale || 1.0);
  if (userState.darkMode) document.body.classList.add("dark-mode");
  switchTab(userState.currentTab || "pomodoro");
  updatePomoDisplay();
  initExamCountdown();
  checkMidnightCatchUp();
  scheduleMidnightAutoBackup();
  setInterval(checkScheduledReminders, 30000);
  checkScheduledReminders();
});


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

  if (chkPomo) rem.pomoEnd = chkPomo.checked;
  if (chkMorn) rem.morningEnabled = chkMorn.checked;
  if (timeMorn) rem.morningTime = timeMorn.value;
  if (chkDay) rem.daytimeEnabled = chkDay.checked;
  if (timeDay) rem.daytimeTime = timeDay.value;
  if (chkEve) rem.eveningEnabled = chkEve.checked;
  if (timeEve) rem.eveningTime = timeEve.value;
  if (chkEye) rem.eyeCareEnabled = chkEye.checked;

  saveState();
  showToast("✅ 备考提醒设置已保存生效！");
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
