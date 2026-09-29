const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor("#0b1020"); tg.setBackgroundColor("#080d19"); } catch {}
}

const API_BASE = window.API_BASE || ""; // Same-origin by default.
const state = {
  userId: null,
  initData: "",
  user: null,
  section: "home",
  bingo: { cost: null, gameId: null, matrix: null, poll: null, history: [], waitingStarted: null },
  keno: { bet: 10, selected: new Set(), lastResult: null }
};

const $ = (id) => document.getElementById(id);
const qsa = (sel) => [...document.querySelectorAll(sel)];

function telegramUser() {
  const u = tg?.initDataUnsafe?.user;
  return u || null;
}

function getUserId() {
  const u = telegramUser();
  if (u?.id) return Number(u.id);
  const params = new URLSearchParams(location.search);
  const id = params.get("userId");
  return id ? Number(id) : null;
}

function headers() {
  const h = { "Content-Type": "application/json" };
  if (state.initData) h["X-Telegram-Init-Data"] = state.initData;
  return h;
}

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const opts = { ...options, headers: { ...headers(), ...(options.headers || {}) } };
  const response = await fetch(url, opts);
  let data;
  try { data = await response.json(); } catch { data = { success: false, message: "Invalid server response" }; }
  if (!response.ok || data.success === false) {
    throw new Error(data.message || data.error || `Request failed (${response.status})`);
  }
  return data;
}

function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.add("hidden"), 3000);
}

function setLoading(on) {
  $("loadingView").classList.toggle("hidden", !on);
  $("mainView").classList.toggle("hidden", on);
}

function showError(message) {
  $("loadingView").classList.add("hidden");
  $("mainView").classList.add("hidden");
  $("errorView").classList.remove("hidden");
  $("errorText").textContent = message;
}

function formatETB(n) {
  return `ETB ${Number(n || 0).toLocaleString()}`;
}

function renderUser() {
  const u = state.user;
  if (!u) return;
  const name = u.userName || "Player";
  $("balance").textContent = formatETB(u.balance);
  $("welcomeName").textContent = name;
  $("level").textContent = u.level || 1;
  $("statsText").textContent = `${u.totalGames || 0} games · ${u.wins || 0} wins`;
  $("dailyWins").textContent = u.dailyWins || 0;
  $("totalGames").textContent = u.totalGames || 0;
  $("totalWins").textContent = u.wins || 0;

  $("profileName").textContent = name;
  $("profileId").textContent = `Telegram ID: ${u.telegramId}`;
  $("profileBalance").textContent = formatETB(u.balance);
  $("profileLevel").textContent = u.level || 1;
  $("profileGames").textContent = u.totalGames || 0;
  $("profileWins").textContent = u.wins || 0;
  $("profileDailyWins").textContent = u.dailyWins || 0;
}

async function loadProfile() {
  setLoading(true);
  try {
    state.userId = getUserId();
    state.initData = tg?.initData || "";
    if (!state.userId) throw new Error("Open this page from your Telegram Mini App so Telegram can provide your user ID.");
    const data = await api(`/api/user/profile?userId=${encodeURIComponent(state.userId)}`);
    state.user = data.user;
    renderUser();
    $("errorView").classList.add("hidden");
    setLoading(false);
  } catch (e) {
    showError(e.message);
  }
}

function switchSection(name) {
  state.section = name;
  qsa(".tab").forEach(b => b.classList.toggle("active", b.dataset.section === name));
  ["home","bingo","keno","wallet","profile"].forEach(s => {
    $(`${s}Section`).classList.toggle("hidden", s !== name);
  });
  if (name === "bingo") resetBingoView();
  if (name === "keno") renderKeno();
}

function resetBingoView() {
  stopBingoPoll();
  $("bingoSetup").classList.remove("hidden");
  $("bingoWaiting").classList.add("hidden");
  $("bingoActive").classList.add("hidden");
  if (state.bingo.cost) {
    qsa(".stake-btn").forEach(b => b.classList.toggle("selected", Number(b.dataset.cost) === state.bingo.cost));
  }
  renderBingoPicker();
}

function renderBingoPicker() {
  const wrap = $("bingoNumberPicker");
  wrap.innerHTML = "";
  for (let n = 1; n <= 75; n++) {
    const b = document.createElement("button");
    b.textContent = bingoLabel(n);
    b.disabled = !state.bingo.cost;
    b.title = state.bingo.cost ? `Join with ${bingoLabel(n)}` : "Select a stake first";
    b.addEventListener("click", () => pickBingo(n));
    wrap.appendChild(b);
  }
}

function bingoLabel(n) {
  if (n <= 15) return `B${n}`;
  if (n <= 30) return `I${n}`;
  if (n <= 45) return `N${n}`;
  if (n <= 60) return `G${n}`;
  return `O${n}`;
}

async function pickBingo(number) {
  if (!state.bingo.cost) return showToast("Choose a Bingo stake first.");
  if (!state.user) return;
  if (state.user.balance < state.bingo.cost) return showToast("Insufficient balance.");

  try {
    const data = await api("/api/bingo/pick", {
      method: "POST",
      body: JSON.stringify({ userId: state.userId, cost: state.bingo.cost, number })
    });
    state.user.balance = Number(data.newBalance ?? state.user.balance);
    state.bingo.gameId = data.gameId;
    state.bingo.matrix = data.matrix;
    renderUser();
    $("bingoSetup").classList.add("hidden");
    $("bingoWaiting").classList.remove("hidden");
    state.bingo.waitingStarted = Date.now();
    $("bingoWaitingText").textContent = `Your number ${bingoLabel(number)} is reserved. Waiting for another player…`;
    startBingoPoll();
  } catch (e) {
    showToast(e.message);
  }
}

function startBingoPoll() {
  stopBingoPoll();
  pollBingo();
  state.bingo.poll = setInterval(pollBingo, 2000);
}

function stopBingoPoll() {
  if (state.bingo.poll) clearInterval(state.bingo.poll);
  state.bingo.poll = null;
}

async function pollBingo() {
  if (!state.bingo.gameId || !state.userId) return;
  try {
    const data = await api(`/api/bingo/status?userId=${state.userId}&gameId=${encodeURIComponent(state.bingo.gameId)}`);
    if (data.status === "waiting") {
      $("bingoWaiting").classList.remove("hidden");
      $("bingoActive").classList.add("hidden");
      const count = Number(data.playersCount || 1);
      $("bingoWaitingText").textContent = `${count} player${count === 1 ? "" : "s"} in room · Pool ${formatETB(data.pool)}`;
      $("bingoProgress").style.width = `${Math.min(count / 2, 1) * 100}%`;
    } else if (data.status === "active") {
      stopBingoPoll();
      state.bingo.matrix = data.matrix || state.bingo.matrix;
      state.bingo.history = data.history || [];
      $("bingoSetup").classList.add("hidden");
      $("bingoWaiting").classList.add("hidden");
      $("bingoActive").classList.remove("hidden");
      $("currentBall").textContent = data.currentBall || "--";
      renderBingoMatrix();
      renderHistory();
      showToast("Bingo game started!");
    } else if (data.status === "none") {
      stopBingoPoll();
      if (state.bingo.gameId) showToast("Bingo room is no longer active.");
    }
  } catch (e) {
    // Keep polling; transient errors are common on mobile connections.
  }
}

function renderBingoMatrix() {
  const wrap = $("bingoMatrix");
  wrap.innerHTML = "";
  if (!state.bingo.matrix) return;
  const history = new Set(state.bingo.history || []);
  state.bingo.matrix.forEach((row, r) => row.forEach((cell, c) => {
    const b = document.createElement("button");
    b.textContent = cell.isFree ? "⭐" : cell.display;
    b.className = cell.isFree ? "free" : "";
    if (!cell.isFree && history.has(Number(cell.rawNum))) b.classList.add("called");
    b.addEventListener("click", () => {
      if (cell.isFree) return;
      if (!history.has(Number(cell.rawNum))) return showToast(`${cell.display} has not been called yet.`);
      b.classList.toggle("called");
      // Marking is local only because the supplied backend has no Mini App mark/claim route.
    });
    wrap.appendChild(b);
  }));
}

function renderHistory() {
  $("drawHistory").innerHTML = "";
  (state.bingo.history || []).forEach(n => {
    const s = document.createElement("span");
    s.textContent = bingoLabel(Number(n));
    $("drawHistory").appendChild(s);
  });
}

function renderKeno() {
  qsa(".bet-btn").forEach(b => b.classList.toggle("active", Number(b.dataset.bet) === state.keno.bet));
  const wrap = $("kenoNumbers");
  wrap.innerHTML = "";
  for (let n = 1; n <= 80; n++) {
    const b = document.createElement("button");
    b.textContent = n;
    if (state.keno.selected.has(n)) b.classList.add("selected");
    b.addEventListener("click", () => toggleKenoNumber(n));
    wrap.appendChild(b);
  }
  const count = state.keno.selected.size;
  $("selectedCount").textContent = count;
  const multipliers = {1:.5,2:1.2,3:1.6,4:2.2,5:2.8,6:3.5,7:4.5,8:6,9:10,10:20};
  const m = multipliers[count] || 0;
  $("potentialWin").textContent = formatETB(Math.round(state.keno.bet + state.keno.bet * m));
}

function toggleKenoNumber(n) {
  if (state.keno.selected.has(n)) state.keno.selected.delete(n);
  else {
    if (state.keno.selected.size >= 10) return showToast("You can select at most 10 numbers.");
    state.keno.selected.add(n);
  }
  renderKeno();
}

async function playKeno() {
  const selectedNumbers = [...state.keno.selected].sort((a,b) => a-b);
  if (!selectedNumbers.length) return showToast("Select at least one number.");
  if (state.user.balance < state.keno.bet) return showToast("Insufficient balance.");

  $("playKenoBtn").disabled = true;
  $("playKenoBtn").textContent = "Drawing…";
  try {
    const data = await api("/api/keno/play", {
      method: "POST",
      body: JSON.stringify({ userId: state.userId, betAmount: state.keno.bet, selectedNumbers })
    });
    state.user.balance = Number(data.newBalance);
    renderUser();
    await animateKenoResult(data, selectedNumbers);
    state.keno.selected.clear();
    renderKeno();
  } catch (e) {
    showToast(e.message);
  } finally {
    $("playKenoBtn").disabled = false;
    $("playKenoBtn").textContent = "🎲 Draw Keno";
  }
}

async function animateKenoResult(data, selected) {
  const result = $("kenoResult");
  result.classList.remove("hidden");
  $("kenoResultTitle").textContent = data.winAmount > 0 ? "🎉 You won!" : "❌ No winning combination";
  $("kenoResultText").textContent =
    `Selected: ${selected.join(", ")} · Matches: ${data.matchesCount} · ` +
    `${data.winAmount > 0 ? `Prize: ${formatETB(data.winAmount)}` : "Prize: ETB 0"} · ` +
    `Balance: ${formatETB(data.newBalance)}`;

  const balls = $("kenoDrawBalls");
  balls.innerHTML = "";
  for (const n of data.drawnNumbers || []) {
    const s = document.createElement("span");
    s.textContent = n;
    balls.appendChild(s);
    await new Promise(r => setTimeout(r, 1000));
  }
}

function openModal(title, html) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("modal").classList.remove("hidden");
}

function closeModal() { $("modal").classList.add("hidden"); }

function openDeposit() {
  openModal("➕ Deposit", `
    <div class="form-group">
      <label>Amount (ETB)</label>
      <input id="depositAmount" type="number" min="1" step="1" placeholder="100" />
    </div>
    <div class="form-group">
      <label>Transaction details</label>
      <textarea id="depositDetails" placeholder="Transaction/reference number or payment details"></textarea>
    </div>
    <button id="submitDeposit" class="primary">Send Deposit Request</button>
  `);
  $("submitDeposit").onclick = submitDeposit;
}

async function submitDeposit() {
  const amount = Number($("depositAmount").value);
  const transactionDetails = $("depositDetails").value.trim();
  if (!amount || amount <= 0) return showToast("Enter a valid amount.");
  try {
    const data = await api("/api/deposit", {
      method: "POST",
      body: JSON.stringify({ userId: state.userId, amount, transactionDetails })
    });
    closeModal();
    showToast(data.message || "Deposit request sent.");
  } catch (e) { showToast(e.message); }
}

function openWithdraw() {
  openModal("➖ Withdraw", `
    <div class="form-group">
      <label>Amount (ETB)</label>
      <input id="withdrawAmount" type="number" min="1" step="1" placeholder="100" />
    </div>
    <div class="form-group">
      <label>Phone / payment number</label>
      <input id="withdrawPhone" type="tel" placeholder="09xxxxxxxx" />
    </div>
    <button id="submitWithdraw" class="primary">Send Withdrawal Request</button>
  `);
  $("submitWithdraw").onclick = submitWithdraw;
}

async function submitWithdraw() {
  const amount = Number($("withdrawAmount").value);
  const phone = $("withdrawPhone").value.trim();
  if (!amount || amount <= 0) return showToast("Enter a valid amount.");
  if (amount > Number(state.user.balance)) return showToast("Insufficient balance.");
  try {
    const data = await api("/api/withdraw", {
      method: "POST",
      body: JSON.stringify({ userId: state.userId, amount, phone })
    });
    state.user.balance = Number(data.balance);
    renderUser();
    closeModal();
    showToast(data.message || "Withdrawal request sent.");
  } catch (e) { showToast(e.message); }
}

function openTelegramBot() {
  const username = tg?.initDataUnsafe?.receiver?.username || "";
  if (tg?.close) tg.close();
  if (username) {
    location.href = `https://t.me/${manchsterunitedlove}`;
  } else {
    showToast("Open the bot chat from Telegram to claim BINGO.");
  }
}

qsa(".tab").forEach(b => b.addEventListener("click", () => switchSection(b.dataset.section)));
qsa("[data-go]").forEach(b => b.addEventListener("click", () => switchSection(b.dataset.go)));
qsa("[data-action='deposit']").forEach(b => b.addEventListener("click", openDeposit));
qsa("[data-action='withdraw']").forEach(b => b.addEventListener("click", openWithdraw));

qsa(".stake-btn").forEach(b => b.addEventListener("click", () => {
  state.bingo.cost = Number(b.dataset.cost);
  qsa(".stake-btn").forEach(x => x.classList.toggle("selected", x === b));
  renderBingoPicker();
}));

qsa(".bet-btn").forEach(b => b.addEventListener("click", () => {
  state.keno.bet = Number(b.dataset.bet);
  renderKeno();
}));

$("clearKenoBtn").addEventListener("click", () => {
  state.keno.selected.clear();
  renderKeno();
});
$("playKenoBtn").addEventListener("click", playKeno);
$("refreshBtn").addEventListener("click", loadProfile);
$("retryBtn").addEventListener("click", loadProfile);
$("closeModal").addEventListener("click", closeModal);
$("modal").addEventListener("click", e => { if (e.target.classList.contains("modal-backdrop")) closeModal(); });
$("cancelBingoBtn").addEventListener("click", resetBingoView);
$("openBotBtn").addEventListener("click", openTelegramBot);

renderBingoPicker();
renderKeno();
loadProfile();
