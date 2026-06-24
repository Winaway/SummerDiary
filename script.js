(function () {
  "use strict";

  const STORAGE_KEY = "summerDiaryCardMachine.v1";
  const TOTAL_DAYS = 56;
  const DAYS_PER_WEEK = 7;
  const TOTAL_WEEKS = 8;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const EMPTY_STATE = Object.freeze({ startDate: null, records: {} });

  const app = document.querySelector("#app");
  const toast = document.querySelector("#toast");
  const templates = window.DIARY_TEMPLATES;
  const templateById = new Map(templates.map((template) => [template.id, template]));

  let state = cloneEmptyState();
  let shouldAnimateCard = false;
  let toastTimer = null;

  window.addEventListener("hashchange", render);

  document.addEventListener("click", (event) => {
    const navButton = event.target.closest("[data-nav]");
    if (navButton) {
      navigateTo(navButton.dataset.nav);
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.action;
    if (action === "drawToday") drawTodayCard();
    if (action === "changeToday") changeTodayCard();
    if (action === "chooseTopic") chooseTodayTopic(Number(actionButton.dataset.topicIndex));
    if (action === "completeToday") completeTodayCard();
    if (action === "fillDay") fillPastDay(Number(actionButton.dataset.day));
    if (action === "exportCollection") exportCollectionImage();
    if (action === "resetStartDate") resetStartDate();
    if (action === "clearRecords") clearRecords();
    if (action === "clearBrokenStorage") clearBrokenStorage();
  });

  try {
    state = readState();
    render();
  } catch (error) {
    state = cloneEmptyState();
    renderStorageError(error);
  }

  function readState() {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return cloneEmptyState();
    }

    let parsedState;
    try {
      parsedState = JSON.parse(saved);
    } catch (error) {
      throw new Error(`本地记录不是有效 JSON：${saved.slice(0, 120)}`);
    }

    return validateState(parsedState);
  }

  function validateState(savedState) {
    if (!savedState || typeof savedState !== "object" || Array.isArray(savedState)) {
      throw new Error(`本地记录格式不正确：${JSON.stringify(savedState)}`);
    }

    const startDate = savedState.startDate === null ? null : requireDateString(savedState.startDate, "startDate");
    const records = {};
    const savedRecords = savedState.records || {};
    if (typeof savedRecords !== "object" || Array.isArray(savedRecords)) {
      throw new Error(`records 必须是对象：${JSON.stringify(savedRecords)}`);
    }

    Object.keys(savedRecords).forEach((dayKey) => {
      const day = Number(dayKey);
      if (!Number.isInteger(day) || day < 1 || day > TOTAL_DAYS) {
        throw new Error(`records 里有不正确的 Day 编号：${dayKey}`);
      }
      records[String(day)] = validateRecord(savedRecords[dayKey], day);
    });

    return { startDate, records };
  }

  function validateRecord(record, day) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`Day ${day} 的记录格式不正确：${JSON.stringify(record)}`);
    }

    const templateId = record.templateId === null || record.templateId === undefined ? null : String(record.templateId);
    if (templateId !== null && !templateById.has(templateId)) {
      throw new Error(`Day ${day} 的模板不存在：${templateId}`);
    }

    const topicIndex = record.topicIndex === null || record.topicIndex === undefined ? null : Number(record.topicIndex);
    if (topicIndex !== null && (!Number.isInteger(topicIndex) || topicIndex < 0 || topicIndex > 6)) {
      throw new Error(`Day ${day} 的题目编号不正确：${record.topicIndex}`);
    }

    if (templateId === null && topicIndex !== null) {
      throw new Error(`Day ${day} 只有题目没有模板：${JSON.stringify(record)}`);
    }

    if (record.completed && templateId !== null && topicIndex === null) {
      throw new Error(`Day ${day} 已点亮但还没有选题：${JSON.stringify(record)}`);
    }

    return {
      date: record.date ? requireDateString(record.date, `Day ${day} date`) : null,
      templateId,
      topicIndex,
      changed: Boolean(record.changed),
      completed: Boolean(record.completed),
      manualCompleted: Boolean(record.manualCompleted)
    };
  }

  function requireDateString(value, fieldName) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`${fieldName} 不是 YYYY-MM-DD 日期：${value}`);
    }
    const date = parseLocalDate(value);
    if (formatDate(date) !== value) {
      throw new Error(`${fieldName} 不是有效日期：${value}`);
    }
    return value;
  }

  function cloneEmptyState() {
    return { startDate: EMPTY_STATE.startDate, records: {} };
  }

  function saveState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function render() {
    const route = getRoute();
    setActiveNavigation(route);

    if (route === "today") app.innerHTML = renderTodayView();
    if (route === "collection") app.innerHTML = renderCollectionView();
    if (route === "settings") app.innerHTML = renderSettingsView();
    if (route === "home") app.innerHTML = renderHomeView();

    shouldAnimateCard = false;
    app.focus({ preventScroll: true });
  }

  function renderHomeView() {
    const currentDay = getCurrentDay();
    const completedCount = getCompletedCount();
    const progressPercent = Math.round((completedCount / TOTAL_DAYS) * 100);
    const record = currentDay ? getRecord(currentDay) : null;
    const canDrawToday = currentDay !== null && currentDay >= 1 && currentDay <= TOTAL_DAYS;
    const isPastSummer = currentDay !== null && currentDay > TOTAL_DAYS;
    const buttonLabel = record ? "查看今日卡片" : "抽取今日日记卡";
    const action = record ? "today" : "drawToday";

    if (isPastSummer) {
      return `
        <section class="hero">
          <div class="hero-copy">
            <p class="kicker">56 天小卡片</p>
            <h1>暑假日记收集册已完成</h1>
            <p class="lead">新的抽卡先停在这里。你还可以看看收集册，或者导出一张图片留作纪念。</p>
            ${renderProgress(completedCount, progressPercent)}
            <div class="hero-actions">
              <button class="button primary" type="button" data-nav="collection">查看收集册</button>
              <button class="button secondary" type="button" data-nav="settings">调整设置</button>
            </div>
          </div>
          ${renderPreviewCard()}
        </section>
        ${renderParentNote()}
      `;
    }

    return `
      <section class="hero">
        <div class="hero-copy">
          <p class="kicker">${state.startDate ? `今天是 Day ${currentDay}` : "每天一点点"}</p>
          <h1>暑假日记抽卡机</h1>
          <p class="lead">每天抽一张卡，写 5 句话。</p>
          <p class="support">不用写作文，只记录今天真实发生的一点点。写之前，可以先对自己说一遍，再写下来。</p>
          <div class="hero-actions">
            ${
              canDrawToday || !state.startDate
                ? `<button class="button primary" type="button" ${action === "today" ? 'data-nav="today"' : 'data-action="drawToday"'}>${buttonLabel}</button>`
                : `<button class="button primary" type="button" disabled>还没到开始日</button>`
            }
            <button class="button secondary" type="button" data-nav="collection">打开收集册</button>
          </div>
          ${renderProgress(completedCount, progressPercent)}
          <div class="quick-links">
            <button class="button quiet" type="button" data-nav="settings">给家长的话</button>
          </div>
        </div>
        ${renderPreviewCard()}
      </section>
      ${renderParentNote()}
    `;
  }

  function renderTodayView() {
    const currentDay = getCurrentDay();
    if (!state.startDate) {
      return `
        <section class="empty-state">
          <p class="kicker">还没开始</p>
          <h1>先抽一张今天的小卡片</h1>
          <p class="lead">第一次抽卡的这一天，会成为 Day 1。</p>
          <div class="hero-actions">
            <button class="button primary" type="button" data-action="drawToday">抽取今日日记卡</button>
          </div>
        </section>
      `;
    }

    if (currentDay > TOTAL_DAYS) {
      return `
        <section class="empty-state">
          <p class="kicker">56 天小卡片</p>
          <h1>这个暑假的卡片已经抽完啦</h1>
          <p class="lead">可以去收集册看看被点亮的小卡片。</p>
          <div class="hero-actions">
            <button class="button primary" type="button" data-nav="collection">查看收集册</button>
          </div>
        </section>
      `;
    }

    if (currentDay < 1) {
      return `
        <section class="empty-state">
          <p class="kicker">开始日期还没到</p>
          <h1>小卡片会在 Day 1 出现</h1>
          <p class="lead">可以到设置页把 Day 1 日期改成今天或更早。</p>
          <div class="hero-actions">
            <button class="button primary" type="button" data-nav="settings">打开设置</button>
          </div>
        </section>
      `;
    }

    const record = getRecord(currentDay);
    if (!record) {
      return `
        <section class="empty-state">
          <p class="kicker">Day ${currentDay}</p>
          <h1>今天还没有抽卡</h1>
          <p class="lead">抽一张看看今天可以写什么。</p>
          <div class="hero-actions">
            <button class="button primary" type="button" data-action="drawToday">抽取今日日记卡</button>
          </div>
        </section>
      `;
    }

    const template = record.templateId ? templateById.get(record.templateId) : null;
    const hasChosenTopic = Boolean(template && record.topicIndex !== null);
    const topic = hasChosenTopic ? template.topics[record.topicIndex] : "这一天是后来补点亮的，没有保存小题目。";
    const cardStyle = template ? `--template-color: ${template.color}; --template-bg: ${template.background};` : "";

    return `
      <div class="page-heading">
        <div>
          <p class="kicker">Day ${currentDay}</p>
          <h1>${hasChosenTopic || !template ? "今天写这个" : "先选一个小题目"}</h1>
          <p class="support">${hasChosenTopic || !template ? "写 5 句话就可以，多写也可以。" : "从这张模板卡的 7 个题目里，选一个今天最想写的。"}</p>
        </div>
        ${record.completed ? '<span class="status-pill">今天的小卡片已点亮</span>' : ""}
      </div>
      <section class="today-layout">
        <article class="draw-card ${shouldAnimateCard ? "is-flipping" : ""}" style="${cardStyle}">
          ${
            template
              ? `
                <div class="template-head">
                  <span class="template-mark">${escapeHtml(template.mark)}</span>
                  <div>
                    <h2>${escapeHtml(template.name)}</h2>
                    <div class="template-meta">${escapeHtml(template.description)}</div>
                  </div>
                </div>
              `
              : ""
          }
          ${
            hasChosenTopic || !template
              ? `
                <p class="task-label">今天写这个：</p>
                <div class="topic">${escapeHtml(topic)}</div>
              `
              : `
                <p class="task-label">从 7 个小题目里选一个：</p>
                <p class="topic-intro">不用选“最好写”的，选一个今天有话想说的就行。</p>
              `
          }
          ${template ? renderTopicChoices(template, record.topicIndex, record.completed) : ""}
          <p class="goal-line">${hasChosenTopic || !template ? "写 5 句话就可以，多写也可以。" : "选好以后，写 5 句话就可以。"}</p>
          <p class="soft-line">写之前，可以先对自己说一遍，再写下来。</p>
          ${template ? renderTemplateHints(template) : ""}
        </article>
        <aside>
          <div class="panel">
            <h3>写完以后</h3>
            <p>${hasChosenTopic || !template ? "回到这里，点亮今天的小卡片。正文还是写在纸质日记本里。" : "先选一个小题目，再去纸质日记本里写。"}</p>
            <div class="button-row">
              <button class="button primary" type="button" data-action="completeToday" ${record.completed || (template && !hasChosenTopic) ? "disabled" : ""}>
                ${record.completed ? "太棒了，已经点亮" : hasChosenTopic || !template ? "我写完了" : "先选一个题目"}
              </button>
            </div>
          </div>
          <div class="panel">
            <h3>今天想换一个吗？</h3>
            <p>${getChangeCardText(record)}</p>
            <div class="button-row">
              <button class="button secondary" type="button" data-action="changeToday" ${record.changed || record.completed || !template ? "disabled" : ""}>换一张</button>
            </div>
          </div>
        </aside>
      </section>
    `;
  }

  function renderTopicChoices(template, selectedTopicIndex, disabled) {
    return `
      <div class="topic-choice-block" aria-label="${escapeHtml(template.name)}的 7 个小题目">
        ${template.topics
          .map((topic, index) => {
            const isSelected = selectedTopicIndex === index;
            return `
              <button
                class="topic-choice ${isSelected ? "is-selected" : ""}"
                type="button"
                data-action="chooseTopic"
                data-topic-index="${index}"
                ${disabled ? "disabled" : ""}
                aria-pressed="${isSelected}"
              >
                <span>${index + 1}</span>
                <strong>${escapeHtml(topic)}</strong>
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderTemplateHints(template) {
    return `
      <details class="hint-panel">
        <summary>不知道怎么写？展开提示</summary>
        <div class="hint-content">
          <div>
            <h3>可以照着写</h3>
            <ul>
              ${template.sentenceStarters.map((starter) => `<li>${escapeHtml(starter)}</li>`).join("")}
            </ul>
          </div>
          <div>
            <h3>想一想</h3>
            <ul>
              ${template.detailPrompts.map((prompt) => `<li>${escapeHtml(prompt)}</li>`).join("")}
            </ul>
          </div>
        </div>
      </details>
    `;
  }

  function renderCollectionView() {
    if (!state.startDate) {
      return `
        <section class="empty-state">
          <p class="kicker">收集册</p>
          <h1>抽第一张卡后，这里会出现 56 个小格子</h1>
          <p class="lead">有空白也没关系，暑假本来就会有很多变化。</p>
          <div class="hero-actions">
            <button class="button primary" type="button" data-action="drawToday">抽取今日日记卡</button>
          </div>
        </section>
      `;
    }

    const completedCount = getCompletedCount();
    const dateRange = `${formatDisplayDate(state.startDate)} 到 ${formatDisplayDate(formatDate(addDays(parseLocalDate(state.startDate), TOTAL_DAYS - 1)))}`;

    return `
      <div class="page-heading">
        <div>
          <p class="kicker">我的暑假日记收集册</p>
          <h1>已经点亮 ${completedCount} / ${TOTAL_DAYS} 天</h1>
          <p class="support">${dateRange}。有空白也没关系，真实的小记录最重要。</p>
        </div>
      </div>
      <div class="collection-toolbar">
        <div class="collection-meta">点击已经写完的过去空格，可以把它补点亮。</div>
        <button class="button primary" type="button" data-action="exportCollection">导出收集册图片</button>
      </div>
      <section class="collection-board" aria-label="8 周 56 天收集册">
        ${renderCollectionRows()}
      </section>
    `;
  }

  function renderCollectionRows() {
    const rows = [];
    for (let week = 1; week <= TOTAL_WEEKS; week += 1) {
      const cells = [];
      for (let dayOfWeek = 1; dayOfWeek <= DAYS_PER_WEEK; dayOfWeek += 1) {
        const day = (week - 1) * DAYS_PER_WEEK + dayOfWeek;
        cells.push(renderCollectionCell(day));
      }
      rows.push(`
        <div class="week-row">
          <div class="week-label">第 ${week} 周</div>
          ${cells.join("")}
        </div>
      `);
    }
    return rows.join("");
  }

  function renderCollectionCell(day) {
    const record = getRecord(day);
    const isReachable = day <= getReachedDay();
    const isComplete = Boolean(record && record.completed);
    const template = record && record.templateId ? templateById.get(record.templateId) : null;
    const topic = template && record.topicIndex !== null ? template.topics[record.topicIndex] : "";
    const stateClass = isComplete ? "is-complete" : isReachable ? "is-waiting" : "is-future";
    const disabled = !isReachable || isComplete ? "disabled" : "";
    const style = template ? `--template-bg: ${template.background};` : "";

    return `
      <button
        class="collection-cell ${stateClass}"
        type="button"
        data-action="fillDay"
        data-day="${day}"
        style="${style}"
        ${disabled}
        aria-label="Day ${day}${isComplete ? "，已点亮" : isReachable ? "，可以补点亮" : "，还没到"}"
      >
        <span class="cell-day">Day ${day}</span>
        <span class="cell-name">${isComplete ? escapeHtml(template ? template.shortName : "已亮") : " "}</span>
        <span class="cell-topic">${escapeHtml(topic)}</span>
      </button>
    `;
  }

  function renderSettingsView() {
    const displayStartDate = state.startDate ? formatDisplayDate(state.startDate) : "还没有开始";
    const resetValue = state.startDate || getTodayString();
    return `
      <div class="page-heading">
        <div>
          <p class="kicker">设置</p>
          <h1>一点点家长设置</h1>
          <p class="support">记录只保存在这台设备的浏览器里。换设备或清理缓存后，记录可能会消失。</p>
        </div>
      </div>
      <section class="settings-grid">
        <div class="settings-block">
          <h3>开始日期</h3>
          <p class="support">当前 Day 1：${escapeHtml(displayStartDate)}</p>
          <div class="date-row">
            <input id="reset-date" type="date" value="${resetValue}" max="${getTodayString()}" aria-label="新的 Day 1 日期" />
            <button class="button secondary" type="button" data-action="resetStartDate">重置开始日期</button>
          </div>
        </div>
        <div class="settings-block">
          <h3>清空本地记录</h3>
          <p class="support">会清除抽卡、换卡、点亮和开始日期，恢复到首次使用状态。</p>
          <button class="button danger" type="button" data-action="clearRecords">清空本地记录</button>
        </div>
        <div class="settings-block wide">
          <h3>给家长的话</h3>
          <div class="parent-letter">
            <p>这个小工具不是作文批改器，也不是打卡监督器。它只是帮孩子轻松开始写日记。</p>
            <p>建议每次写 5 句话就可以，多写也可以。不用追求好词好句，不用写满一页。</p>
            <p>家长最好不要批改，不要打分，也不要把它变成新的暑假作业。可以只问孩子一句：“你今天写的这件事里，哪一句最想让我知道？”</p>
            <p>今天没写也没关系，明天继续开始。</p>
          </div>
        </div>
      </section>
    `;
  }

  function renderPreviewCard() {
    return `
      <div class="preview-card" aria-hidden="true">
        <div class="sample-stack">
          <div class="sample-line" style="--tilt: -2deg"><b>观</b><span>我发现家里一个以前没注意的地方</span></div>
          <div class="sample-line" style="--tilt: 1.5deg"><b>心</b><span>今天我忍住没发火的一次</span></div>
          <div class="sample-line" style="--tilt: -1deg"><b>动</b><span>今天运动时最累的一刻</span></div>
        </div>
      </div>
    `;
  }

  function renderProgress(completedCount, progressPercent) {
    return `
      <div class="progress-strip" aria-label="已点亮 ${completedCount} / ${TOTAL_DAYS} 天">
        <div class="progress-label">
          <span>已点亮 ${completedCount} / ${TOTAL_DAYS} 天</span>
          <span>${progressPercent}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
      </div>
    `;
  }

  function renderParentNote() {
    return `
      <aside class="parent-note">
        给家长的小提醒：不用批改，不用打分，只鼓励孩子写真实的一点点。
      </aside>
    `;
  }

  function drawTodayCard() {
    const currentDay = ensureCurrentDayForDrawing();
    if (currentDay > TOTAL_DAYS) {
      showToast("56 天收集册已经完成，可以去看看点亮的小卡片。");
      navigateTo("collection");
      return;
    }

    if (getRecord(currentDay)) {
      navigateTo("today");
      return;
    }

    setRecord(currentDay, createDrawnRecord(currentDay, null));
    saveState();
    shouldAnimateCard = true;
    navigateTo("today");
  }

  function changeTodayCard() {
    const currentDay = getCurrentDay();
    const record = currentDay ? getRecord(currentDay) : null;
    if (!record) {
      throw new Error(`今天没有可更换的卡片：Day ${currentDay}`);
    }
    if (record.completed) {
      showToast("今天的小卡片已经点亮啦。");
      return;
    }
    if (record.changed) {
      showToast("今天已经换过一次啦。");
      return;
    }

    setRecord(currentDay, createDrawnRecord(currentDay, record));
    saveState();
    shouldAnimateCard = true;
    render();
    showToast("已经换成新的小卡片。");
  }

  function chooseTodayTopic(topicIndex) {
    const currentDay = getCurrentDay();
    const record = currentDay ? getRecord(currentDay) : null;
    if (!record) {
      throw new Error(`今天没有可选题的模板卡：Day ${currentDay}`);
    }
    if (!record.templateId) {
      throw new Error(`今天的记录没有模板卡，不能选题：Day ${currentDay}`);
    }
    if (!Number.isInteger(topicIndex) || topicIndex < 0 || topicIndex > 6) {
      throw new Error(`题目编号不正确：${topicIndex}`);
    }
    if (record.completed) {
      showToast("今天的小卡片已经点亮啦。");
      return;
    }

    record.topicIndex = topicIndex;
    setRecord(currentDay, record);
    saveState();
    render();
    showToast("好，就写这个小题目。");
  }

  function completeTodayCard() {
    const currentDay = getCurrentDay();
    const record = currentDay ? getRecord(currentDay) : null;
    if (!record) {
      throw new Error(`今天没有可点亮的卡片：Day ${currentDay}`);
    }
    if (record.templateId && record.topicIndex === null) {
      showToast("先选一个小题目，再点亮今天的小卡片。");
      return;
    }
    record.completed = true;
    record.manualCompleted = false;
    setRecord(currentDay, record);
    saveState();
    render();
    showToast("太棒了，今天的小卡片已经点亮！");
  }

  function fillPastDay(day) {
    if (!Number.isInteger(day) || day < 1 || day > TOTAL_DAYS) {
      throw new Error(`补点亮的 Day 编号不正确：${day}`);
    }
    if (day > getReachedDay()) {
      showToast("未来的小格子先留给未来。");
      return;
    }

    const record = getRecord(day);
    if (record && record.completed) {
      return;
    }

    const confirmed = window.confirm("这一天已经写完了吗？\n点亮后会加入你的暑假日记收集册。");
    if (!confirmed) {
      return;
    }

    const nextRecord = record || {
      date: getDateStringForDay(day),
      templateId: null,
      topicIndex: null,
      changed: false,
      completed: false,
      manualCompleted: true
    };
    if (nextRecord.templateId && nextRecord.topicIndex === null) {
      nextRecord.templateId = null;
      nextRecord.changed = false;
    }
    nextRecord.completed = true;
    nextRecord.manualCompleted = !nextRecord.templateId;
    setRecord(day, nextRecord);
    saveState();
    render();
    showToast(`Day ${day} 已经点亮。`);
  }

  function resetStartDate() {
    const input = document.querySelector("#reset-date");
    const nextStartDate = input ? input.value : "";
    requireDateString(nextStartDate, "新的 Day 1 日期");
    if (parseLocalDate(nextStartDate) > parseLocalDate(getTodayString())) {
      throw new Error(`新的 Day 1 日期不能是未来：${nextStartDate}`);
    }

    const firstConfirm = window.confirm(`要把 Day 1 改成 ${formatDisplayDate(nextStartDate)} 吗？\n这会影响 Day 编号和收集册日期。`);
    if (!firstConfirm) {
      return;
    }
    const secondConfirm = window.confirm("请再确认一次：已有点亮记录会保留在原来的 Day 编号下。");
    if (!secondConfirm) {
      return;
    }

    state.startDate = nextStartDate;
    saveState();
    render();
    showToast("开始日期已经更新。");
  }

  function clearRecords() {
    const firstConfirm = window.confirm("清空后，所有点亮记录都会消失，无法恢复。确定清空吗？");
    if (!firstConfirm) {
      return;
    }
    const secondConfirm = window.confirm("请再确认一次：这会恢复到首次使用状态。");
    if (!secondConfirm) {
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
    state = cloneEmptyState();
    navigateTo("home");
    render();
    showToast("本地记录已经清空。");
  }

  function clearBrokenStorage() {
    window.localStorage.removeItem(STORAGE_KEY);
    state = cloneEmptyState();
    navigateTo("home");
    render();
    showToast("本地记录已经清空，可以重新开始。");
  }

  function ensureCurrentDayForDrawing() {
    if (!state.startDate) {
      state.startDate = getTodayString();
      saveState();
      return 1;
    }
    return getCurrentDay();
  }

  function createDrawnRecord(day, previousRecord) {
    const templateId = drawTemplateCard(previousRecord);
    return {
      date: getDateStringForDay(day),
      templateId,
      topicIndex: null,
      changed: Boolean(previousRecord),
      completed: false,
      manualCompleted: false
    };
  }

  function drawTemplateCard(previousRecord) {
    let template = null;
    let attempts = 0;

    do {
      template = templates[randomInteger(templates.length)];
      attempts += 1;
    } while (previousRecord && attempts < 20 && previousRecord.templateId === template.id);

    return template.id;
  }

  function randomInteger(max) {
    return Math.floor(Math.random() * max);
  }

  function getChangeCardText(record) {
    if (record.completed) {
      return "今天的小卡片已经点亮，就让它留在收集册里吧。";
    }
    if (record.changed) {
      return "今天已经换过一次啦。";
    }
    return "如果今天这张模板卡不太想写，可以换一次。";
  }

  function getCurrentDay() {
    if (!state.startDate) {
      return null;
    }
    return getDaysBetween(state.startDate, getTodayString()) + 1;
  }

  function getReachedDay() {
    const currentDay = getCurrentDay();
    if (currentDay === null) {
      return 0;
    }
    return Math.min(Math.max(currentDay, 0), TOTAL_DAYS);
  }

  function getCompletedCount() {
    let count = 0;
    for (let day = 1; day <= TOTAL_DAYS; day += 1) {
      const record = getRecord(day);
      if (record && record.completed) count += 1;
    }
    return count;
  }

  function getRecord(day) {
    return state.records[String(day)] || null;
  }

  function setRecord(day, record) {
    state.records[String(day)] = record;
  }

  function getDateStringForDay(day) {
    if (!state.startDate) {
      return getTodayString();
    }
    return formatDate(addDays(parseLocalDate(state.startDate), day - 1));
  }

  function getDaysBetween(startDate, endDate) {
    return Math.floor((parseLocalDate(endDate) - parseLocalDate(startDate)) / ONE_DAY_MS);
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function getTodayString() {
    return formatDate(new Date());
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDisplayDate(dateString) {
    const date = parseLocalDate(dateString);
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }

  function getRoute() {
    const route = window.location.hash.replace("#", "");
    if (["today", "collection", "settings"].includes(route)) {
      return route;
    }
    return "home";
  }

  function navigateTo(route) {
    const nextHash = route === "home" ? "#home" : `#${route}`;
    if (window.location.hash === nextHash) {
      render();
      return;
    }
    window.location.hash = nextHash;
  }

  function setActiveNavigation(route) {
    document.querySelectorAll("[data-nav]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.nav === route);
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function exportCollectionImage() {
    if (!state.startDate) {
      showToast("抽第一张卡后，就可以导出收集册图片。");
      return;
    }

    try {
      const canvas = createCollectionCanvas();
      const link = document.createElement("a");
      link.download = "我的暑假日记收集册.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      showToast("收集册图片已经生成。");
    } catch (error) {
      showToast("导出图片时遇到问题，可以换个浏览器再试一次。");
      throw error;
    }
  }

  function createCollectionCanvas() {
    const canvas = document.createElement("canvas");
    const width = 1600;
    const height = 2100;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    context.fillStyle = "#fbf7ea";
    context.fillRect(0, 0, width, height);

    drawPosterHeader(context, width);
    drawPosterGrid(context);
    drawPosterFooter(context, width, height);

    return canvas;
  }

  function drawPosterHeader(context, width) {
    context.fillStyle = "#3a3848";
    context.font = '700 76px "Microsoft YaHei", sans-serif';
    context.textAlign = "center";
    context.fillText("我的暑假日记收集册", width / 2, 150);

    const endDate = formatDate(addDays(parseLocalDate(state.startDate), TOTAL_DAYS - 1));
    context.fillStyle = "#746f79";
    context.font = '400 34px "Microsoft YaHei", sans-serif';
    context.fillText(`${formatDisplayDate(state.startDate)} 到 ${formatDisplayDate(endDate)}`, width / 2, 216);

    context.fillStyle = "#ad6731";
    context.font = '700 42px "Microsoft YaHei", sans-serif';
    context.fillText(`已点亮 ${getCompletedCount()} / ${TOTAL_DAYS} 天`, width / 2, 286);
  }

  function drawPosterGrid(context) {
    const startX = 115;
    const startY = 380;
    const cardWidth = 178;
    const cardHeight = 170;
    const gap = 22;
    const weekGap = 34;

    for (let week = 0; week < TOTAL_WEEKS; week += 1) {
      context.fillStyle = "#746f79";
      context.font = '700 30px "Microsoft YaHei", sans-serif';
      context.textAlign = "left";
      context.fillText(`第 ${week + 1} 周`, startX, startY + week * (cardHeight + weekGap) - 22);

      for (let dayOfWeek = 0; dayOfWeek < DAYS_PER_WEEK; dayOfWeek += 1) {
        const day = week * DAYS_PER_WEEK + dayOfWeek + 1;
        const x = startX + dayOfWeek * (cardWidth + gap);
        const y = startY + week * (cardHeight + weekGap);
        drawPosterCell(context, day, x, y, cardWidth, cardHeight);
      }
    }
  }

  function drawPosterCell(context, day, x, y, width, height) {
    const record = getRecord(day);
    const isComplete = Boolean(record && record.completed);
    const isReachable = day <= getReachedDay();
    const template = record && record.templateId ? templateById.get(record.templateId) : null;

    context.save();
    context.fillStyle = isComplete ? getPosterColor(template, "background") : isReachable ? "#f4ead8" : "#ebe5d9";
    context.strokeStyle = isComplete ? getPosterColor(template, "border") : "#d9ccb9";
    context.lineWidth = 3;
    drawRoundedRect(context, x, y, width, height, 16);
    context.fill();
    context.stroke();

    context.fillStyle = "#746f79";
    context.font = '700 24px "Microsoft YaHei", sans-serif';
    context.textAlign = "left";
    context.fillText(`Day ${day}`, x + 18, y + 38);

    if (isComplete) {
      context.fillStyle = getPosterColor(template, "text");
      context.font = '700 34px "Microsoft YaHei", sans-serif';
      context.fillText(template ? template.shortName : "已点亮", x + 18, y + 88);

      if (template && record.topicIndex !== null) {
        context.fillStyle = "#5f5965";
        context.font = '400 21px "Microsoft YaHei", sans-serif';
        drawWrappedText(context, template.topics[record.topicIndex], x + 18, y + 122, width - 36, 28, 2);
      }
    } else if (isReachable) {
      context.fillStyle = "#a49a89";
      context.font = '400 24px "Microsoft YaHei", sans-serif';
      context.fillText(" ", x + 18, y + 92);
    } else {
      context.fillStyle = "#a49a89";
      context.font = '400 22px "Microsoft YaHei", sans-serif';
      context.fillText("还没到", x + 18, y + 92);
    }
    context.restore();
  }

  function drawPosterFooter(context, width, height) {
    context.fillStyle = "#746f79";
    context.font = '400 28px "Microsoft YaHei", sans-serif';
    context.textAlign = "center";
    context.fillText("写 5 句话就可以，多写也可以。", width / 2, height - 90);
  }

  function drawRoundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
    let line = "";
    let lineCount = 0;
    for (const char of text) {
      const nextLine = line + char;
      if (context.measureText(nextLine).width > maxWidth && line !== "") {
        context.fillText(line, x, y + lineCount * lineHeight);
        line = char;
        lineCount += 1;
        if (lineCount >= maxLines) {
          return;
        }
      } else {
        line = nextLine;
      }
    }
    if (line && lineCount < maxLines) {
      context.fillText(line, x, y + lineCount * lineHeight);
    }
  }

  function getPosterColor(template, role) {
    if (!template) {
      return role === "background" ? "#e9f2df" : role === "border" ? "#9abc83" : "#527143";
    }

    const colors = {
      "daily-event": ["#f8e8c8", "#d29a55", "#9a6126"],
      emotion: ["#f8dfe1", "#d97983", "#9a3f49"],
      observation: ["#e1f2df", "#7dbf84", "#467846"],
      question: ["#dfeaf8", "#779bd4", "#3f6097"],
      reading: ["#eadff8", "#a282d2", "#674890"],
      sport: ["#dff4f0", "#74bdb4", "#3f7970"],
      "home-life": ["#f4edc8", "#c4ab55", "#7a682a"],
      thinking: ["#f6dff0", "#cc82b5", "#884c77"]
    };
    const index = role === "background" ? 0 : role === "border" ? 1 : 2;
    return colors[template.id][index];
  }

  function renderStorageError(error) {
    app.innerHTML = `
      <section class="error-box">
        <h1>本地记录读不出来</h1>
        <p>浏览器里保存的记录格式不对。可以清空本地记录后重新开始。</p>
        <code>${escapeHtml(error.message)}</code>
        <div class="hero-actions">
          <button class="button danger" type="button" data-action="clearBrokenStorage">清空本地记录</button>
        </div>
      </section>
    `;
  }
})();
