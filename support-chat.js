"use strict";

(() => {
  const messagePrefix = "hana-team-chat:message:";
  const roleKey = "hana-team-chat:role";
  const guestKey = "hana-team-chat:guest-thread";
  const idleLimit = 3 * 60 * 1000;
  const stateLabels = { pending: "미답변", waiting: "응대 중", closed: "상담 종료" };
  const role = document.querySelector("#role-view");
  const guestPage = document.querySelector("main");
  const skip = document.querySelector(".skip");
  const guestSkip = skip.getAttribute("href");
  const dateFormat = new Intl.DateTimeFormat("ko-KR", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });

  guestPage.insertAdjacentHTML("afterend", `
    <main id="admin-chat" class="admin-chat wrap" aria-labelledby="admin-title" hidden>
      <div class="admin-heading">
        <h1 id="admin-title" tabindex="-1">채팅 문의 관리</h1>
        <p>이 브라우저에서 접수된 시연용 문의입니다.</p>
      </div>
      <div class="inbox">
        <section class="inbox-list" aria-label="문의 목록">
          <div class="inbox-filters" role="group" aria-label="상담 상태">
            <button type="button" data-filter="pending" aria-pressed="true">미답변 <span id="pending-count">0</span></button>
            <button type="button" data-filter="waiting" aria-pressed="false">응대 중 <span id="waiting-count">0</span></button>
            <button type="button" data-filter="closed" aria-pressed="false">상담 종료 <span id="closed-count">0</span></button>
          </div>
          <p id="inbox-empty" class="inbox-empty" hidden></p>
          <ul id="inbox-items"></ul>
        </section>
        <section class="admin-thread" aria-labelledby="thread-title">
          <div class="admin-thread-heading">
            <h2 id="thread-title">문의 내용</h2>
            <span id="thread-state" class="thread-state" hidden></span>
          </div>
          <div id="admin-transcript" class="transcript" role="log" aria-label="문의 대화"></div>
          <form id="admin-reply" class="chat-form" hidden>
            <label class="visually-hidden" for="reply-message">답변 내용</label>
            <textarea id="reply-message" name="message" rows="2" maxlength="500" required placeholder="답변을 입력해 주세요"></textarea>
            <button type="submit">답변 보내기</button>
          </form>
          <p id="admin-status" class="chat-status" role="status" hidden></p>
        </section>
      </div>
    </main>

    <div id="guest-chat" class="guest-chat">
      <section id="chat-window" class="chat-window" aria-labelledby="chat-title" hidden>
        <header class="chat-titlebar">
          <div>
            <h2 id="chat-title">채팅 문의</h2>
            <p>같은 브라우저에서 체험하는 시연용 채팅</p>
          </div>
          <button type="button" id="chat-close" aria-label="채팅 닫기">×</button>
        </header>
        <div class="chat-history">
          <label class="visually-hidden" for="chat-thread">내 문의 목록</label>
          <select id="chat-thread"></select>
          <button type="button" id="new-chat">새 문의</button>
        </div>
        <div id="guest-transcript" class="transcript" role="log" aria-label="채팅 내역"></div>
        <div id="chat-lifecycle" class="chat-lifecycle" hidden>
          <p id="guest-state" role="status"></p>
          <button type="button" id="end-chat">상담 종료</button>
        </div>
        <form id="guest-send" class="chat-form">
          <label class="visually-hidden" for="guest-message">문의 내용</label>
          <textarea id="guest-message" name="message" rows="2" maxlength="500" required placeholder="문의 내용을 입력해 주세요"></textarea>
          <button type="submit">보내기</button>
        </form>
        <p id="guest-status" class="chat-status" role="status" hidden></p>
      </section>
      <button type="button" id="chat-toggle" class="chat-toggle" aria-expanded="false" aria-controls="chat-window">
        <span class="chat-icon" aria-hidden="true"></span>채팅 문의
      </button>
    </div>`);

  const byId = id => document.getElementById(id);
  const guest = byId("guest-chat");
  const panel = byId("chat-window");
  const toggle = byId("chat-toggle");
  const history = byId("chat-thread");
  const admin = byId("admin-chat");
  const send = byId("guest-send");
  const reply = byId("admin-reply");
  const endChat = byId("end-chat");
  const guestStatus = byId("guest-status");
  const adminStatus = byId("admin-status");
  const inbox = byId("inbox-items");
  const filters = [...admin.querySelectorAll("[data-filter]")];

  let threads = [];
  let filter = "pending";
  let adminThread = "";
  let guestThread = "";
  let expiryTimer;

  function sessionValue(key, value) {
    try {
      if (value !== undefined) sessionStorage.setItem(key, value);
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function status(element, text) {
    element.textContent = text;
    element.hidden = !text;
  }

  function summarizeThread(id, records, now) {
    const messages = [];
    let deadline = null;
    let closedAt = null;
    let closedBy = "";

    records.sort((a, b) => a.time - b.time);
    for (const record of records) {
      if (deadline !== null && record.time >= deadline) break;
      if (record.kind === "close") {
        closedAt = record.time;
        closedBy = "guest";
        break;
      }
      messages.push(record);
      deadline = record.sender === "admin" ? record.time + idleLimit : null;
    }
    if (!messages.length) return null;

    if (closedAt === null && deadline !== null && now >= deadline) {
      closedAt = deadline;
      closedBy = "timeout";
    }
    let state = "pending";
    if (closedAt !== null) state = "closed";
    else if (deadline !== null) state = "waiting";

    return {
      id, messages, deadline, closedBy, filter: state,
      subject: messages[0].text,
      time: closedAt ?? messages.at(-1).time
    };
  }

  function loadThreads(now = Date.now()) {
    const grouped = new Map();
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(messagePrefix)) continue;
        let message;
        try { message = JSON.parse(localStorage.getItem(key)); } catch { continue; }
        if (!message || typeof message.thread !== "string" || !Number.isFinite(message.time)) continue;
        const valid = message.kind === "close"
          ? message.sender === "guest"
          : typeof message.text === "string" && ["guest", "admin"].includes(message.sender);
        if (!valid) continue;
        if (!grouped.has(message.thread)) grouped.set(message.thread, []);
        grouped.get(message.thread).push(message);
      }
    } catch {
      const warning = "이 브라우저에서 채팅 기록을 열 수 없어요.";
      status(guestStatus, warning);
      status(adminStatus, warning);
    }
    return [...grouped].map(([id, records]) => summarizeThread(id, records, now))
      .filter(Boolean).sort((a, b) => b.time - a.time);
  }

  function titleOf(thread) {
    const singleLine = thread.subject.replace(/\s+/g, " ");
    return singleLine.length > 38 ? singleLine.slice(0, 38) + "…" : singleLine;
  }

  function renderTranscript(container, thread, emptyMessage) {
    if (container.dataset.thread === (thread?.id ?? "") &&
        container.dataset.length === String(thread?.messages.length ?? 0)) return;
    container.dataset.thread = thread?.id ?? "";
    container.dataset.length = String(thread?.messages.length ?? 0);
    if (!thread) {
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent = emptyMessage;
      container.replaceChildren(empty);
      return;
    }

    const messages = thread.messages.map(message => {
      const entry = document.createElement("div");
      entry.className = "chat-message " + message.sender;
      const meta = document.createElement("span");
      meta.className = "chat-meta";
      meta.textContent = (message.sender === "guest" ? "게스트" : "관리자") + " · " + dateFormat.format(message.time);
      const text = document.createElement("p");
      text.textContent = message.text;
      entry.append(meta, text);
      return entry;
    });
    container.replaceChildren(...messages);
    container.scrollTop = container.scrollHeight;
  }

  function setGuestThread(id) {
    guestThread = id;
    sessionValue(guestKey, id);
  }

  function renderGuest() {
    const active = threads.find(thread => thread.id === guestThread);
    const options = [new Option("새 문의", ""), ...threads.map(thread => new Option(titleOf(thread), thread.id))];
    history.replaceChildren(...options);
    history.value = active?.id ?? "";
    renderTranscript(byId("guest-transcript"), active, "문의 내용을 보내면 대화가 시작돼요.");
    const closed = active?.filter === "closed";
    byId("chat-lifecycle").hidden = !active;
    send.hidden = closed;
    endChat.hidden = closed;
    let description = "관리자 답변을 기다리고 있어요.";
    if (active?.filter === "waiting") description = "추가 문의가 없으면 답변 후 3분에 종료돼요.";
    if (closed) {
      description = active.closedBy === "timeout"
        ? "3분간 추가 메시지가 없어 상담이 종료됐어요."
        : "질문자가 상담을 종료했어요.";
    }
    const state = byId("guest-state");
    if (state.textContent !== description) state.textContent = description;
  }

  function renderAdmin() {
    for (const button of filters) {
      const state = button.dataset.filter;
      button.setAttribute("aria-pressed", String(state === filter));
      byId(state + "-count").textContent = threads.filter(thread => thread.filter === state).length;
    }

    const visible = threads.filter(thread => thread.filter === filter);
    const selected = visible.find(thread => thread.id === adminThread) ?? visible[0];
    const nextThread = selected?.id ?? "";
    if (adminThread !== nextThread) byId("reply-message").value = "";
    adminThread = nextThread;
    const listItems = visible.map(thread => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "inbox-item";
      button.dataset.thread = thread.id;
      if (thread === selected) button.setAttribute("aria-current", "true");
      const name = document.createElement("strong");
      name.textContent = titleOf(thread);
      const time = document.createElement("span");
      time.textContent = dateFormat.format(thread.time);
      button.append(name, time);
      item.append(button);
      return item;
    });
    inbox.replaceChildren(...listItems);

    status(byId("inbox-empty"), visible.length ? "" : stateLabels[filter] + " 문의가 없어요.");
    byId("thread-title").textContent = selected ? titleOf(selected) : "문의 내용";
    status(byId("thread-state"), selected ? stateLabels[filter] : "");
    renderTranscript(byId("admin-transcript"), selected, "목록에서 문의를 선택해 주세요.");
    reply.hidden = !selected || filter === "closed";
  }

  function render() {
    clearTimeout(expiryTimer);
    threads = loadThreads();
    renderGuest();
    renderAdmin();
    const expiry = Math.min(...threads.filter(thread => thread.filter === "waiting").map(thread => thread.deadline));
    if (Number.isFinite(expiry)) expiryTimer = setTimeout(render, Math.max(0, expiry - Date.now()));
  }

  function addRecord(thread, sender, text, kind = "message") {
    const now = Date.now();
    const existing = loadThreads(now).find(item => item.id === thread);
    if (existing?.filter === "closed") {
      render();
      status(sender === "guest" ? guestStatus : adminStatus, "이미 종료된 상담이에요.");
      return false;
    }
    if (!existing && (sender === "admin" || kind === "close")) return false;
    const time = Math.max(now, (existing?.time ?? 0) + 1);
    const message = { thread, sender, text, time, kind };
    try {
      localStorage.setItem(messagePrefix + crypto.randomUUID(), JSON.stringify(message));
      return true;
    } catch {
      status(sender === "guest" ? guestStatus : adminStatus, "메시지를 저장하지 못했어요.");
      return false;
    }
  }

  function showPanel(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      const conversation = byId("guest-transcript");
      conversation.scrollTop = conversation.scrollHeight;
      byId(send.hidden ? "new-chat" : "guest-message").focus();
    } else if (panel.contains(document.activeElement)) {
      toggle.focus();
    }
  }

  function setRole(value) {
    const isAdmin = value === "admin";
    role.value = isAdmin ? "admin" : "guest";
    sessionValue(roleKey, role.value);
    guestPage.hidden = isAdmin;
    guest.hidden = isAdmin;
    admin.hidden = !isAdmin;
    skip.setAttribute("href", isAdmin ? "#admin-title" : guestSkip);
    if (isAdmin) showPanel(false);
    render();
  }

  role.addEventListener("change", () => setRole(role.value));
  document.querySelector(".header").addEventListener("click", event => {
    if (role.value === "admin" && event.target.closest("a")) setRole("guest");
  });
  toggle.addEventListener("click", () => showPanel(panel.hidden));
  byId("chat-close").addEventListener("click", () => showPanel(false));
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") showPanel(false);
  });

  history.addEventListener("change", () => {
    setGuestThread(history.value);
    byId("guest-message").value = "";
    status(guestStatus, "");
    renderGuest();
  });
  byId("new-chat").addEventListener("click", () => {
    setGuestThread("");
    status(guestStatus, "");
    renderGuest();
    byId("guest-message").value = "";
    byId("guest-message").focus();
  });

  endChat.addEventListener("click", () => {
    if (!guestThread || !addRecord(guestThread, "guest", "", "close")) return;
    byId("guest-message").value = "";
    status(guestStatus, "");
    render();
    byId("new-chat").focus();
  });

  send.addEventListener("submit", event => {
    event.preventDefault();
    const field = byId("guest-message");
    const text = field.value.trim();
    if (!text) return;
    const thread = guestThread || crypto.randomUUID();
    if (!addRecord(thread, "guest", text)) return;
    setGuestThread(thread);
    field.value = "";
    status(guestStatus, "");
    render();
    field.focus();
  });

  for (const button of filters) {
    button.addEventListener("click", () => {
      filter = button.dataset.filter;
      byId("reply-message").value = "";
      renderAdmin();
    });
  }

  inbox.addEventListener("click", event => {
    const button = event.target.closest("[data-thread]");
    if (!button) return;
    adminThread = button.dataset.thread;
    byId("reply-message").value = "";
    renderAdmin();
    inbox.querySelector('[aria-current="true"]')?.focus();
  });

  reply.addEventListener("submit", event => {
    event.preventDefault();
    const field = byId("reply-message");
    const text = field.value.trim();
    if (!adminThread || !text || !addRecord(adminThread, "admin", text)) return;
    field.value = "";
    filter = "waiting";
    render();
    status(adminStatus, "답변을 보냈어요. 질문자의 추가 메시지를 기다립니다.");
    filters.find(button => button.dataset.filter === filter)?.focus();
  });

  window.addEventListener("storage", event => {
    if (event.key === null || event.key.startsWith(messagePrefix)) render();
  });
  window.addEventListener("focus", render);

  const remembered = sessionValue(guestKey);
  guestThread = remembered ?? loadThreads()[0]?.id ?? "";
  setRole(sessionValue(roleKey));
})();
