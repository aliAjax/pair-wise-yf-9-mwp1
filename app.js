// 界面层：渲染列表与详情、处理表单事件；规则逻辑找 RuleService，存档与版本找 RuleStore。
const state = RuleStore.getState();
if (!state.selectedId) state.selectedId = state.games[0]?.id || "";

// 界面临时状态，不写入存档（刷新后回到当前版本视图）。
const ui = {
  viewVersion: null,
  pending: null,
  drafts: { add: {}, remove: {}, correct: {}, rollback: {} },
  formError: "",
  formSuccess: ""
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
  visibleCount: document.querySelector("#visibleCount")
};

function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Math.max(0, Math.floor((Date.now() - date) / 86400000));
}

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectedGame() {
  return RuleStore.findGame(state.selectedId) || state.games[0] || null;
}

function getFilteredGames() {
  const keyword = els.searchInput.value.trim();
  const player = els.playerFilter.value;
  const complexity = els.complexityFilter.value;
  const games = state.games.filter((game) => {
    const text = `${game.name}${RuleService.allRules(game).join("")}`;
    const matchesKeyword = !keyword || text.includes(keyword);
    const matchesPlayer =
      player === "all" || (Number(player) >= game.minPlayers && Number(player) <= game.maxPlayers);
    const matchesComplexity = complexity === "all" || game.complexity === complexity;
    return matchesKeyword && matchesPlayer && matchesComplexity;
  });

  if (els.sortMode.value === "name") {
    return games.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }
  if (els.sortMode.value === "complexity") {
    const rank = { 轻: 1, 中: 2, 重: 3 };
    return games.sort((a, b) => rank[b.complexity] - rank[a.complexity]);
  }
  return games.sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed));
}

function renderSummary() {
  const allRuleCount = state.games.reduce(
    (sum, game) => sum + RuleService.allRules(game).length,
    0
  );
  const stale = [...state.games].sort(
    (a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed)
  )[0];
  els.gameCount.textContent = state.games.length;
  els.ruleCount.textContent = allRuleCount;
  els.staleGame.textContent = stale ? `${daysSince(stale.lastPlayed)}天` : "-";
}

function renderList() {
  const games = getFilteredGames();
  els.visibleCount.textContent = `${games.length}个匹配`;
  els.gameList.innerHTML =
    games
      .map((game) => {
        const selectedClass = game.id === state.selectedId ? "selected" : "";
        return `
          <article class="game-card ${selectedClass}" data-game-id="${game.id}">
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

function renderRuleSections(rules, readonly) {
  return RuleService.RULE_KEYS.map((key) => {
    const items = rules[key];
    const pending = ui.pending;
    const listHtml = items
      .map((item, index) => {
        if (
          !readonly &&
          pending &&
          pending.key === key &&
          pending.index === index
        ) {
          return `
            <li class="rule-row pending">
              ${
                pending.action === "remove"
                  ? renderRemoveForm(key, index, item)
                  : renderCorrectForm(key, index, item)
              }
            </li>
          `;
        }
        const controls = readonly
          ? ""
          : `
            <span class="rule-ops">
              <button type="button" title="改正" data-action="correct" data-rule-key="${key}" data-rule-index="${index}">改</button>
              <button type="button" title="移除" data-action="remove" data-rule-key="${key}" data-rule-index="${index}">×</button>
            </span>
          `;
        return `
          <li class="rule-row">
            <span>${escapeHtml(item)}</span>
            ${controls}
          </li>
        `;
      })
      .join("") || `<li class="rule-row"><span class="empty">暂无内容。</span></li>`;

    return `
      <section class="rule-section">
        <h3>${RuleService.RULE_LABELS[key]}</h3>
        <ul class="rule-list">${listHtml}</ul>
      </section>
    `;
  }).join("");
}

function draftValue(kind, field) {
  return escapeHtml(ui.drafts[kind][field] || "");
}

function formNotice(kind) {
  // 同一时刻只有一个表单会产生提交结果；行内表单激活时，新增表单不提示。
  const inlineActive = Boolean(ui.pending);
  if (kind === "remove" || kind === "correct") {
    return ui.formError
      ? `<p class="form-error" role="alert">${escapeHtml(ui.formError)}</p>`
      : "";
  }
  if (inlineActive) return "";
  if (ui.formError) return `<p class="form-error" role="alert">${escapeHtml(ui.formError)}</p>`;
  if (ui.formSuccess) return `<p class="form-success">${escapeHtml(ui.formSuccess)}</p>`;
  return "";
}

function renderRemoveForm(key, index, item) {
  return `
    <form class="inline-revision" data-form="remove" data-rule-key="${key}" data-rule-index="${index}">
      <p class="pending-target">移除：${escapeHtml(item)}</p>
      <div class="revision-grid">
        <label>修订人<input name="editor" required value="${draftValue("remove", "editor")}" placeholder="谁做的移除" /></label>
        <label>原因<input name="reason" required value="${draftValue("remove", "reason")}" placeholder="为什么移除" /></label>
      </div>
      ${formNotice("remove")}
      <div class="revision-actions">
        <button class="danger" type="submit">确认移除</button>
        <button type="button" data-action="cancel-pending">取消</button>
      </div>
    </form>
  `;
}

function renderCorrectForm(key, index, item) {
  const text = ui.drafts.correct.text != null ? ui.drafts.correct.text : item;
  return `
    <form class="inline-revision" data-form="correct" data-rule-key="${key}" data-rule-index="${index}">
      <label>改正为
        <textarea name="text" rows="2" required placeholder="输入改正后的规则">${escapeHtml(text)}</textarea>
      </label>
      <div class="revision-grid">
        <label>修订人<input name="editor" required value="${draftValue("correct", "editor")}" placeholder="谁做的改正" /></label>
        <label>原因<input name="reason" required value="${draftValue("correct", "reason")}" placeholder="为什么改正" /></label>
      </div>
      ${formNotice("correct")}
      <div class="revision-actions">
        <button class="primary" type="submit">确认改正</button>
        <button type="button" data-action="cancel-pending">取消</button>
      </div>
    </form>
  `;
}

function renderAddRuleForm() {
  return `
    <form class="add-rule" id="ruleForm" data-form="add">
      <label>新增到哪一类
        <select id="ruleTypeInput" name="key">
          ${RuleService.RULE_KEYS.map(
            (key) =>
              `<option value="${key}" ${ui.drafts.add.key === key ? "selected" : ""}>${RuleService.RULE_LABELS[key]}</option>`
          ).join("")}
        </select>
      </label>
      <textarea id="ruleTextInput" name="text" rows="3" placeholder="补充一条聚会前要看的提醒" required>${escapeHtml(
        ui.drafts.add.text || ""
      )}</textarea>
      <div class="revision-grid">
        <label>修订人<input id="ruleEditorInput" name="editor" required value="${draftValue(
          "add",
          "editor"
        )}" placeholder="谁新增的" /></label>
        <label>原因<input id="ruleReasonInput" name="reason" required value="${draftValue(
          "add",
          "reason"
        )}" placeholder="为什么新增" /></label>
      </div>
      ${formNotice("add")}
      <button class="primary" type="submit">加入规则卡片</button>
    </form>
  `;
}

function describeChange(record) {
  const detail = record.detail;
  if (!detail) return "建立初始规则版本。";
  const label = RuleService.RULE_LABELS[detail.key] || "";
  if (detail.action === "add") return `在「${label}」新增：${detail.text}`;
  if (detail.action === "remove") return `从「${label}」移除：${detail.text}`;
  if (detail.action === "correct") {
    return `改正「${label}」：${detail.from} → ${detail.to}`;
  }
  if (detail.action === "rollback") {
    return `用第 ${detail.to} 版规则替换第 ${detail.from} 版内容`;
  }
  return "";
}

function renderHistory(game) {
  const current = game.versions[game.versions.length - 1];
  const items = [...game.versions]
    .reverse()
    .map((record) => {
      const isCurrent = record.version === current.version;
      return `
        <li class="version-item ${isCurrent ? "current" : ""}">
          <div class="version-head">
            <strong>v${record.version} · ${RuleService.ACTION_LABELS[record.action] || record.action}</strong>
            ${isCurrent ? '<span class="version-tag">当前版本</span>' : ""}
          </div>
          <p class="version-meta">${formatTime(record.timestamp)} · ${escapeHtml(record.editor)}</p>
          <p class="version-detail">${escapeHtml(describeChange(record))}</p>
          <p class="version-reason">原因：${escapeHtml(record.reason)}</p>
          <div class="version-actions">
            <button type="button" data-action="view-version" data-version="${record.version}">
              ${ui.viewVersion === record.version ? "正在查看" : "查看版本"}
            </button>
          </div>
        </li>
      `;
    })
    .join("");

  return `
    <section class="history">
      <h3>修订记录（共 ${game.versions.length} 版）</h3>
      <ul class="version-list">${items}</ul>
    </section>
  `;
}

function renderVersionView(game, record) {
  return `
    <div class="quick-card">
      <div class="version-banner">
        <div>
          <h2>${escapeHtml(game.name)} · 第 ${record.version} 版</h2>
          <p class="version-meta">
            ${RuleService.ACTION_LABELS[record.action] || record.action} ·
            ${formatTime(record.timestamp)} · 修订人：${escapeHtml(record.editor)}
          </p>
        </div>
        <button type="button" data-action="back-current">返回当前版本</button>
      </div>
      ${renderRuleSections(record.rules, true)}
      <form class="rollback-form" data-form="rollback" data-version="${record.version}">
        <p class="rollback-tip">回滚只会把上面第 ${record.version} 版的规则内容复制为新版本，游戏信息和所有旧版本都会保留。</p>
        <div class="revision-grid">
          <label>回滚操作人<input name="editor" required value="${draftValue(
            "rollback",
            "editor"
          )}" placeholder="谁执行回滚" /></label>
          <label>回滚原因<input name="reason" required value="${draftValue(
            "rollback",
            "reason"
          )}" placeholder="为什么回滚到这一版" /></label>
        </div>
        ${formNotice("rollback")}
        <button class="primary" type="submit">回滚到第 ${record.version} 版</button>
      </form>
    </div>
  `;
}

function renderDetail() {
  const game = selectedGame();
  if (!game) {
    ui.viewVersion = null;
    els.detailView.innerHTML = `<p class="empty">先添加一个桌游。</p>`;
    return;
  }
  state.selectedId = game.id;

  if (ui.viewVersion != null) {
    const record = game.versions.find((item) => item.version === ui.viewVersion);
    if (record) {
      els.detailView.innerHTML = renderVersionView(game, record);
      return;
    }
    ui.viewVersion = null;
  }

  els.detailView.innerHTML = `
    <div class="quick-card">
      <div class="detail-cover">
        ${game.cover ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />` : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`}
      </div>
      <div>
        <h2>${escapeHtml(game.name)}</h2>
        <div class="game-meta">
          <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
          <span class="pill">${game.duration}分钟</span>
          <span class="pill heavy">${escapeHtml(game.complexity)}</span>
          <span class="pill">${daysSince(game.lastPlayed)}天未玩</span>
        </div>
      </div>
      ${renderRuleSections(RuleService.snapshot(game), false)}
      ${renderAddRuleForm()}
      ${renderHistory(game)}
      <div class="detail-actions">
        <button id="playedTodayBtn" type="button">标记今天玩过</button>
        <button id="deleteGameBtn" type="button">删除桌游</button>
      </div>
    </div>
  `;
}

function renderAll() {
  renderSummary();
  renderList();
  renderDetail();
}

function resetRevisionUi() {
  ui.pending = null;
  Object.keys(ui.drafts).forEach((kind) => {
    ui.drafts[kind] = {};
  });
  ui.formError = "";
  ui.formSuccess = "";
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
  RuleStore.addGame(game);
  els.gameForm.reset();
  setDefaultDate();
  ui.viewVersion = null;
  resetRevisionUi();
  renderAll();
}

function setDefaultDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 2);
  els.lastPlayedInput.value = date.toISOString().slice(0, 10);
}

els.searchInput.addEventListener("input", renderAll);
els.playerFilter.addEventListener("change", renderAll);
els.complexityFilter.addEventListener("change", renderAll);
els.sortMode.addEventListener("change", renderAll);
els.gameForm.addEventListener("submit", addGame);

els.gameList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-game-id]");
  if (!card) return;
  RuleStore.setSelected(card.dataset.gameId);
  ui.viewVersion = null;
  resetRevisionUi();
  renderAll();
});

// 所有留痕表单（新增/移除/改正/回滚）统一在此提交。
els.detailView.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const game = selectedGame();
  if (!game) return;

  const kind = form.dataset.form;
  const editor = form.elements.editor.value;
  const reason = form.elements.reason.value;
  ui.formError = "";
  ui.formSuccess = "";

  if (kind === "add") {
    ui.drafts.add = {
      key: document.querySelector("#ruleTypeInput").value,
      text: document.querySelector("#ruleTextInput").value,
      editor,
      reason
    };
    const result = RuleStore.commitRuleChange(game.id, "add", ui.drafts.add);
    if (!result.ok) {
      ui.formError = result.error;
    } else {
      resetRevisionUi();
      ui.formSuccess = `已生成第 ${result.record.version} 版（新增）。`;
    }
    renderAll();
    return;
  }

  const key = form.dataset.ruleKey;
  const index = Number(form.dataset.ruleIndex);

  if (kind === "remove") {
    ui.drafts.remove = { editor, reason };
    const result = RuleStore.commitRuleChange(game.id, "remove", { key, index, editor, reason });
    if (!result.ok) {
      ui.formError = result.error;
    } else {
      resetRevisionUi();
      ui.formSuccess = `已生成第 ${result.record.version} 版（移除）。`;
    }
    renderAll();
    return;
  }

  if (kind === "correct") {
    const text = form.elements.text.value;
    ui.drafts.correct = { text, editor, reason };
    const result = RuleStore.commitRuleChange(game.id, "correct", {
      key,
      index,
      text,
      editor,
      reason
    });
    if (!result.ok) {
      ui.formError = result.error;
    } else {
      resetRevisionUi();
      ui.formSuccess = `已生成第 ${result.record.version} 版（改正）。`;
    }
    renderAll();
    return;
  }

  if (kind === "rollback") {
    const targetVersion = Number(form.dataset.version);
    ui.drafts.rollback = { editor, reason };
    const result = RuleStore.rollback(game.id, targetVersion, { editor, reason });
    if (!result.ok) {
      ui.formError = result.error;
      renderAll();
    } else {
      ui.viewVersion = null;
      resetRevisionUi();
      ui.formSuccess = `已回滚并生成第 ${result.record.version} 版。`;
      renderAll();
    }
  }
});

els.detailView.addEventListener("click", (event) => {
  const game = selectedGame();
  if (!game) return;

  const backButton = event.target.closest('[data-action="back-current"]');
  if (backButton) {
    ui.viewVersion = null;
    resetRevisionUi();
    renderAll();
    return;
  }

  const cancelButton = event.target.closest('[data-action="cancel-pending"]');
  if (cancelButton) {
    ui.pending = null;
    ui.formError = "";
    ui.drafts.remove = {};
    ui.drafts.correct = {};
    renderAll();
    return;
  }

  const viewButton = event.target.closest('[data-action="view-version"]');
  if (viewButton) {
    ui.viewVersion = Number(viewButton.dataset.version);
    ui.pending = null;
    resetRevisionUi();
    renderAll();
    return;
  }

  const ruleOpButton = event.target.closest("[data-rule-key][data-action]");
  if (ruleOpButton) {
    ui.pending = {
      action: ruleOpButton.dataset.action,
      key: ruleOpButton.dataset.ruleKey,
      index: Number(ruleOpButton.dataset.ruleIndex)
    };
    ui.formError = "";
    ui.formSuccess = "";
    renderAll();
    return;
  }

  const playedButton = event.target.closest("#playedTodayBtn");
  if (playedButton) {
    RuleStore.markPlayedToday(game.id);
    renderAll();
  }

  const deleteButton = event.target.closest("#deleteGameBtn");
  if (deleteButton) {
    RuleStore.removeGame(game.id);
    ui.viewVersion = null;
    resetRevisionUi();
    renderAll();
  }
});

setDefaultDate();
renderAll();
