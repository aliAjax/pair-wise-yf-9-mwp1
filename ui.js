// 界面层：负责渲染、表单与弹窗交互；规则校验走 RuleLogic，存档与版本走 RuleVersions。
let state = RuleVersions.loadState();
if (!state.selectedId) state.selectedId = state.games[0]?.id || "";

const today = new Date();

const ACTION_LABELS = {
  create: "初始版本",
  add: "新增",
  correct: "改正",
  remove: "移除",
  rollback: "回滚"
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  playerFilter: document.querySelector("#playerFilter"),
  complexityFilter: document.querySelector("#complexityFilter"),
  sortMode: document.querySelector("#sortMode"),
  gameForm: document.querySelector("#gameForm"),
  nameInput: document.querySelector("#nameInput"),
  minPlayersInput: document.querySelector("#minPlayersInput"),
  maxPlayersInput: document.querySelector("#maxPlayersInput"),
  durationInput: document.querySelector("#durationInput"),
  complexityInput: document.querySelector("#complexityInput"),
  lastPlayedInput: document.querySelector("#lastPlayedInput"),
  coverInput: document.querySelector("#coverInput"),
  gameList: document.querySelector("#gameList"),
  detailView: document.querySelector("#detailView"),
  gameCount: document.querySelector("#gameCount"),
  ruleCount: document.querySelector("#ruleCount"),
  staleGame: document.querySelector("#staleGame"),
  visibleCount: document.querySelector("#visibleCount"),

  revisionModal: document.querySelector("#revisionModal"),
  revisionTitle: document.querySelector("#revisionTitle"),
  revisionError: document.querySelector("#revisionError"),
  sectionGroup: document.querySelector("#sectionGroup"),
  revisionRuleKey: document.querySelector("#revisionRuleKey"),
  oldRuleGroup: document.querySelector("#oldRuleGroup"),
  oldRuleText: document.querySelector("#oldRuleText"),
  newRuleGroup: document.querySelector("#newRuleGroup"),
  newRuleText: document.querySelector("#newRuleText"),
  newRuleLabel: document.querySelector("#newRuleLabel"),
  revisionEditor: document.querySelector("#revisionEditor"),
  revisionReason: document.querySelector("#revisionReason"),
  revisionConfirm: document.querySelector("#revisionConfirm"),
  revisionClose: document.querySelector("#revisionClose"),
  revisionCancel: document.querySelector("#revisionCancel"),

  versionModal: document.querySelector("#versionModal"),
  versionTitle: document.querySelector("#versionTitle"),
  versionMeta: document.querySelector("#versionMeta"),
  versionBody: document.querySelector("#versionBody"),
  versionError: document.querySelector("#versionError"),
  rollbackPanel: document.querySelector("#rollbackPanel"),
  currentVersionHint: document.querySelector("#currentVersionHint"),
  rollbackEditor: document.querySelector("#rollbackEditor"),
  rollbackReason: document.querySelector("#rollbackReason"),
  rollbackConfirmBtn: document.querySelector("#rollbackConfirmBtn"),
  versionClose: document.querySelector("#versionClose"),
  versionCancel: document.querySelector("#versionCancel")
};

// 当前打开的修订 / 查看上下文
let revisionContext = null;
let versionContext = null;

function saveState() {
  RuleVersions.saveState(state);
}

function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function getFilteredGames() {
  const keyword = els.searchInput.value.trim();
  const player = els.playerFilter.value;
  const complexity = els.complexityFilter.value;
  const games = state.games.filter((game) => {
    const text = `${game.name}${RuleLogic.getAllRules(game).join("")}`;
    const matchesKeyword = !keyword || text.includes(keyword);
    const matchesPlayer =
      player === "all" || (Number(player) >= game.minPlayers && Number(player) <= game.maxPlayers);
    const matchesComplexity = complexity === "all" || game.complexity === complexity;
    return matchesKeyword && matchesPlayer && matchesComplexity;
  });

  if (els.sortMode.value === "name")
    return games.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  if (els.sortMode.value === "complexity") {
    const rank = { 轻: 1, 中: 2, 重: 3 };
    return games.sort((a, b) => rank[b.complexity] - rank[a.complexity]);
  }
  return games.sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed));
}

function renderSummary() {
  const stale = [...state.games].sort(
    (a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed)
  )[0];
  els.gameCount.textContent = state.games.length;
  els.ruleCount.textContent = RuleLogic.countAllRules(state.games);
  els.staleGame.textContent = stale ? `${daysSince(stale.lastPlayed)}天` : "-";
}

function renderList() {
  const games = getFilteredGames();
  els.visibleCount.textContent = `${games.length}个匹配`;
  els.gameList.innerHTML =
    games
      .map((game) => {
        const selected = game.id === state.selectedId ? "selected" : "";
        return `
          <article class="game-card ${selected}" data-game-id="${game.id}">
            <div class="cover">
              ${
                game.cover
                  ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />`
                  : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`
              }
              <span class="stale-ribbon">${daysSince(game.lastPlayed)}天未玩</span>
            </div>
            <div class="game-body">
              <h3>${escapeHtml(game.name)}</h3>
              <div class="game-meta">
                <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
                <span class="pill">${game.duration}分钟</span>
                <span class="pill heavy">${escapeHtml(game.complexity)}</span>
              </div>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有符合筛选的桌游。</p>`;
}

function renderRuleSection(title, key, items) {
  return `
    <section class="rule-section">
      <h3>${title}</h3>
      <ul class="rule-list">
        ${
          items
            .map(
              (item, index) => `
                <li>
                  <span>${escapeHtml(item)}</span>
                  <span class="rule-ops">
                    <button type="button" title="改正这条规则" data-revise-action="correct" data-rule-key="${key}" data-rule-index="${index}">改</button>
                    <button type="button" title="移除这条规则" data-revise-action="remove" data-rule-key="${key}" data-rule-index="${index}">删</button>
                  </span>
                </li>
              `
            )
            .join("") || `<li><span class="empty">暂无内容。</span></li>`
        }
      </ul>
    </section>
  `;
}

function renderVersionList(game) {
  const versions = RuleVersions.getVersions(game);
  const currentNumber = RuleVersions.currentVersion(game).number;
  return `
    <ul class="version-list">
      ${versions
        .map((version) => {
          const isCurrent = version.number === currentNumber;
          return `
            <li class="${isCurrent ? "current" : ""}">
              <div class="version-main">
                <span class="version-badge act-${version.action}">v${version.number} · ${
            ACTION_LABELS[version.action] || version.action
          }</span>
                ${isCurrent ? `<span class="version-tag">当前</span>` : ""}
                <span class="version-reason">${escapeHtml(version.reason)}</span>
              </div>
              <div class="version-meta">
                <span>${formatTime(version.createdAt)}</span>
                <span>修订人：${version.editor ? escapeHtml(version.editor) : "—"}</span>
                <button type="button" data-version-number="${version.number}">查看</button>
              </div>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function renderDetail() {
  const game = state.games.find((item) => item.id === state.selectedId) || state.games[0];
  if (!game) {
    els.detailView.innerHTML = `<p class="empty">先添加一个桌游。</p>`;
    return;
  }
  state.selectedId = game.id;
  const current = RuleVersions.currentVersion(game);
  els.detailView.innerHTML = `
    <div class="quick-card">
      <div class="detail-cover">
        ${game.cover ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />` : `<span>${escapeHtml(
    game.name.slice(0, 2)
  )}</span>`}
      </div>
      <div>
        <h2>${escapeHtml(game.name)}</h2>
        <div class="game-meta">
          <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
          <span class="pill">${game.duration}分钟</span>
          <span class="pill heavy">${escapeHtml(game.complexity)}</span>
          <span class="pill">${daysSince(game.lastPlayed)}天未玩</span>
          <span class="pill version-pill">当前 v${current.number} · ${
    ACTION_LABELS[current.action] || current.action
  }</span>
        </div>
      </div>
      ${RuleLogic.RULE_SECTIONS.map((section) =>
        renderRuleSection(section.title, section.key, game[section.key])
      ).join("")}
      <button class="primary add-rule-btn" type="button" id="addRuleBtn">＋ 新增规则（需填写修订人与原因）</button>
      <section class="version-section">
        <div class="panel-head version-head">
          <h3>修订历史 <span class="version-count">共${game.versions.length}版</span></h3>
          <button type="button" id="historyBtn">查看当前版本</button>
        </div>
        ${renderVersionList(game)}
      </section>
      <div class="detail-actions">
        <button id="playedTodayBtn" type="button">标记今天玩过</button>
        <button id="deleteGameBtn" type="button">删除桌游</button>
      </div>
    </div>
  `;
}

function renderAll() {
  saveState();
  renderSummary();
  renderList();
  renderDetail();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function setDefaultDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 2);
  els.lastPlayedInput.value = date.toISOString().slice(0, 10);
}

async function addGame(event) {
  event.preventDefault();
  const minPlayers = Number(els.minPlayersInput.value);
  const maxPlayers = Math.max(minPlayers, Number(els.maxPlayersInput.value));
  const cover = await readFileAsDataUrl(els.coverInput.files[0]);
  const game = {
    id: crypto.randomUUID(),
    name: els.nameInput.value.trim(),
    minPlayers,
    maxPlayers,
    duration: Number(els.durationInput.value),
    complexity: els.complexityInput.value,
    lastPlayed: els.lastPlayedInput.value,
    cover,
    forgets: ["本局开始前先补充容易忘的规则。"],
    disputes: [],
    setup: ["整理组件并按人数调整初始设置。"],
    scoring: ["确认终局计分项和即时得分项。"]
  };
  RuleVersions.initHistory(game, 1, {
    action: "create",
    reason: "创建桌游并录入初始规则"
  });
  state.games.unshift(game);
  state.selectedId = game.id;
  els.gameForm.reset();
  setDefaultDate();
  renderAll();
}

/* ---------------- 修订弹窗（新增 / 改正 / 移除） ---------------- */

function openRevision(action, game, key, index) {
  revisionContext = { gameId: game.id, action, key, index: index ?? null };
  els.revisionError.textContent = "";
  els.revisionError.hidden = true;
  els.revisionEditor.value = state.lastEditor || "";
  els.revisionReason.value = "";

  if (action === "add") {
    els.revisionTitle.textContent = "新增规则";
    els.revisionConfirm.textContent = "确认新增";
    els.sectionGroup.hidden = false;
    els.revisionRuleKey.disabled = false;
    els.revisionRuleKey.value = key || "forgets";
    els.oldRuleGroup.hidden = true;
    els.newRuleGroup.hidden = false;
    els.newRuleLabel.textContent = "规则内容";
    els.newRuleText.value = "";
  } else {
    const section = RuleLogic.RULE_SECTIONS.find((item) => item.key === key);
    const oldText = game[key]?.[index] ?? "";
    els.revisionTitle.textContent = action === "correct" ? "改正规则" : "移除规则";
    els.revisionConfirm.textContent = action === "correct" ? "确认改正" : "确认移除";
    els.sectionGroup.hidden = false;
    els.revisionRuleKey.disabled = true;
    els.revisionRuleKey.value = key;
    els.oldRuleGroup.hidden = false;
    els.oldRuleText.textContent = `${section ? section.title : ""}：${oldText}`;
    if (action === "correct") {
      els.newRuleGroup.hidden = false;
      els.newRuleLabel.textContent = "改正后内容";
      els.newRuleText.value = oldText;
    } else {
      els.newRuleGroup.hidden = true;
      els.newRuleText.value = "";
    }
  }

  els.revisionModal.hidden = false;
  if (revisionContext.action === "remove") els.revisionReason.focus();
  else els.newRuleText.focus();
}

function closeRevision() {
  els.revisionModal.hidden = true;
  revisionContext = null;
}

function submitRevision() {
  if (!revisionContext) return;
  const game = state.games.find((item) => item.id === revisionContext.gameId);
  if (!game) {
    closeRevision();
    return;
  }
  const draft = {
    action: revisionContext.action,
    key: els.revisionRuleKey.disabled ? revisionContext.key : els.revisionRuleKey.value,
    index: revisionContext.index,
    text: els.newRuleText.value
  };
  const editor = els.revisionEditor.value;
  const reason = els.revisionReason.value;
  const result = RuleVersions.commitRuleRevision(game, draft, editor, reason);
  if (result.error) {
    // 整次拒绝：规则不变，也不产生版本。
    els.revisionError.textContent = result.error;
    els.revisionError.hidden = false;
    return;
  }
  state.lastEditor = editor.trim();
  closeRevision();
  renderAll();
}

/* ---------------- 版本查看 / 回滚弹窗 ---------------- */

function renderVersionRules(rules) {
  return RuleLogic.RULE_SECTIONS.map((section) => {
    const items = rules[section.key] || [];
    return `
      <section class="rule-section viewer-section">
        <h3>${section.title}（${items.length}条）</h3>
        <ul class="rule-list">
          ${
            items
              .map((item) => `<li><span>${escapeHtml(item)}</span></li>`)
              .join("") || `<li><span class="empty">暂无内容。</span></li>`
          }
        </ul>
      </section>
    `;
  }).join("");
}

function openVersionModal(game, number) {
  const version = (game.versions || []).find((item) => item.number === number);
  if (!version) return;
  versionContext = { gameId: game.id, number };
  const current = RuleVersions.currentVersion(game);
  const isCurrent = version.number === current.number;

  els.versionTitle.textContent = `版本 v${version.number} · ${
    ACTION_LABELS[version.action] || version.action
  }`;
  els.versionMeta.innerHTML = `
    <span>版本号：v${version.number}${isCurrent ? "（当前版本）" : ""}</span>
    <span>时间：${formatTime(version.createdAt)}</span>
    <span>修订人：${version.editor ? escapeHtml(version.editor) : "—"}</span>
    <span class="version-reason-line">原因：${escapeHtml(version.reason)}</span>
  `;
  els.versionBody.innerHTML = renderVersionRules(version.rules);
  els.versionError.textContent = "";
  els.versionError.hidden = true;

  els.currentVersionHint.hidden = !isCurrent;
  els.rollbackPanel.hidden = isCurrent;
  els.rollbackConfirmBtn.hidden = isCurrent;
  els.rollbackEditor.value = state.lastEditor || "";
  els.rollbackReason.value = isCurrent ? "" : `回滚至 v${version.number} 的规则内容`;

  els.versionModal.hidden = false;
}

function closeVersionModal() {
  els.versionModal.hidden = true;
  versionContext = null;
}

function submitRollback() {
  if (!versionContext) return;
  const game = state.games.find((item) => item.id === versionContext.gameId);
  if (!game) {
    closeVersionModal();
    return;
  }
  const targetNumber = versionContext.number;
  const result = RuleVersions.rollbackToVersion(
    game,
    targetNumber,
    els.rollbackEditor.value,
    els.rollbackReason.value
  );
  if (result.error) {
    els.versionError.textContent = result.error;
    els.versionError.hidden = false;
    return;
  }
  state.lastEditor = els.rollbackEditor.value.trim();
  els.versionModal.hidden = true;
  renderAll();
  // 打开刚生成的回滚版本，旧版本仍然保留在历史里。
  openVersionModal(game, result.version.number);
}

/* ---------------- 事件绑定 ---------------- */

els.searchInput.addEventListener("input", renderAll);
els.playerFilter.addEventListener("change", renderAll);
els.complexityFilter.addEventListener("change", renderAll);
els.sortMode.addEventListener("change", renderAll);
els.gameForm.addEventListener("submit", addGame);

els.gameList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-game-id]");
  if (!card) return;
  state.selectedId = card.dataset.gameId;
  renderAll();
});

els.detailView.addEventListener("click", (event) => {
  const addButton = event.target.closest("#addRuleBtn");
  const reviseButton = event.target.closest("[data-revise-action]");
  const versionButton = event.target.closest("[data-version-number]");
  const historyButton = event.target.closest("#historyBtn");
  const playedButton = event.target.closest("#playedTodayBtn");
  const deleteButton = event.target.closest("#deleteGameBtn");
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;

  if (addButton) {
    openRevision("add", game, "forgets");
  }

  if (reviseButton) {
    openRevision(
      reviseButton.dataset.reviseAction,
      game,
      reviseButton.dataset.ruleKey,
      Number(reviseButton.dataset.ruleIndex)
    );
  }

  if (versionButton) {
    openVersionModal(game, Number(versionButton.dataset.versionNumber));
  }

  if (historyButton) {
    openVersionModal(game, RuleVersions.currentVersion(game).number);
  }

  if (playedButton) {
    game.lastPlayed = new Date().toISOString().slice(0, 10);
    renderAll();
  }

  if (deleteButton) {
    state.games = state.games.filter((item) => item.id !== game.id);
    state.selectedId = state.games[0]?.id || "";
    renderAll();
  }
});

els.revisionConfirm.addEventListener("click", submitRevision);
els.revisionClose.addEventListener("click", closeRevision);
els.revisionCancel.addEventListener("click", closeRevision);

els.rollbackConfirmBtn.addEventListener("click", submitRollback);
els.versionClose.addEventListener("click", closeVersionModal);
els.versionCancel.addEventListener("click", closeVersionModal);

els.revisionModal.addEventListener("click", (event) => {
  if (event.target === els.revisionModal) closeRevision();
});
els.versionModal.addEventListener("click", (event) => {
  if (event.target === els.versionModal) closeVersionModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!els.versionModal.hidden) closeVersionModal();
  else if (!els.revisionModal.hidden) closeRevision();
});

setDefaultDate();
renderAll();
