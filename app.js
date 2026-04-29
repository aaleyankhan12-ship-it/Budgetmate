import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://lgowkyajpdecmgjgtqso.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_KHZiBTVtRPqcog69GR9dDw_oxr_A86F";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const SUPPORTED_CURRENCIES = ["GBP", "USD", "EUR", "JPY"];

const appState = {
  currentUser: null,
  currentProfile: null,
  transactions: [],
  goals: [],
  currentPage: "home",
  currentFilter: "all",
  currentType: "expense",
  currentHomeRange: "monthly",
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  if (document.body.classList.contains("landing-page")) {
    await initializeLandingPage();
    return;
  }

  if (document.body.classList.contains("auth-page")) {
    await initializeAuthPage();
    return;
  }

  const hasSession = await requireAuthenticatedUser();
  if (!hasSession) {
    return;
  }

  await initializeAppPage();
});

async function initializeLandingPage() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    redirectToApp();
  }
}

async function initializeAuthPage() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    redirectToApp();
    return;
  }

  cacheAuthElements();
  bindAuthEvents();
  showAuthForm(getRequestedAuthMode());
}

function getRequestedAuthMode() {
  const hash = window.location.hash.replace("#", "").trim().toLowerCase();
  return hash === "signup" ? "signup" : "login";
}

async function initializeAppPage() {
  cacheAppElements();
  bindAppEvents();
  await loadProfile();
  await Promise.all([loadTransactions(), loadGoals()]);
  setDefaultDate();
  setDefaultGoalDate();
  syncCurrencyFields();
  updateTypeButtons();
  updateAllocationVisibility();
  updateFilterButtons();
  updateHomeFilterButtons();
  showPage(getInitialPage());
  renderApp();
}

async function requireAuthenticatedUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) {
    redirectToLanding();
    return false;
  }

  appState.currentUser = data.session.user;
  return true;
}

function cacheAuthElements() {
  els.showLoginButton = document.getElementById("show-login");
  els.showSignupButton = document.getElementById("show-signup");
  els.loginForm = document.getElementById("login-form");
  els.signupForm = document.getElementById("signup-form");
  els.loginEmail = document.getElementById("login-email");
  els.loginPassword = document.getElementById("login-password");
  els.signupUsername = document.getElementById("signup-username");
  els.signupEmail = document.getElementById("signup-email");
  els.signupPassword = document.getElementById("signup-password");
  els.loginError = document.getElementById("login-error");
  els.signupError = document.getElementById("signup-error");
}

function bindAuthEvents() {
  els.showLoginButton?.addEventListener("click", () => {
    clearAuthErrors();
    showAuthForm("login");
  });

  els.showSignupButton?.addEventListener("click", () => {
    clearAuthErrors();
    showAuthForm("signup");
  });

  els.loginForm?.addEventListener("submit", handleLogin);
  els.signupForm?.addEventListener("submit", handleSignup);
}

function showAuthForm(formName) {
  const showLogin = formName === "login";
  els.loginForm?.classList.toggle("active", showLogin);
  els.signupForm?.classList.toggle("active", !showLogin);
  els.showLoginButton?.classList.toggle("active", showLogin);
  els.showSignupButton?.classList.toggle("active", !showLogin);
}

function clearAuthErrors() {
  if (els.loginError) {
    els.loginError.textContent = "";
    els.loginError.classList.remove("success");
  }
  if (els.signupError) {
    els.signupError.textContent = "";
    els.signupError.classList.remove("success");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearAuthErrors();

  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value;

  if (!email || !password) {
    els.loginError.textContent = "Please enter your email and password.";
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    els.loginError.textContent = getFriendlyAuthMessage(error, "login");
    return;
  }

  redirectToApp();
}

async function handleSignup(event) {
  event.preventDefault();
  clearAuthErrors();

  const username = els.signupUsername.value.trim();
  const email = els.signupEmail.value.trim();
  const password = els.signupPassword.value;

  if (!username || !email || !password) {
    els.signupError.textContent = "Please enter a username, email, and password.";
    return;
  }

  const { data: existingUsername, error: usernameCheckError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (usernameCheckError) {
    els.signupError.textContent = "We could not verify that username right now. Please try again in a moment.";
    return;
  }

  if (existingUsername) {
    els.signupError.textContent = "That username is already taken. Please choose another one.";
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, "")}/index.html`,
      data: {
        username,
      },
    },
  });

  if (error) {
    els.signupError.textContent = getFriendlyAuthMessage(error, "signup");
    return;
  }

  if (!data.session) {
    els.signupError.textContent = "Confirm your account from the email we sent. Once you verify it, BudgetMate will sign you in automatically.";
    els.signupError.classList.add("success");
    els.signupForm.reset();
    showAuthForm("signup");
    return;
  }

  redirectToApp();
}

function getFriendlyAuthMessage(error, mode) {
  const rawMessage = error?.message || (mode === "login" ? "Login failed. Please try again." : "Sign up failed. Please try again.");
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("email rate limit exceeded")) {
    return "Too many emails have been sent in a short time. Please wait a little and try again.";
  }

  if (normalized.includes("database error saving new user")) {
    return "We could not create that account. The username may already be taken, or Supabase may need a moment. Please try a different username.";
  }

  if (normalized.includes("user already registered")) {
    return "An account with that email already exists. Try logging in instead.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Your email or password is incorrect.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Please confirm your email first, then log in.";
  }

  return rawMessage;
}

function cacheAppElements() {
  els.pages = document.querySelectorAll(".page");
  els.navLinks = document.querySelectorAll(".nav-link");
  els.summaryIncome = document.querySelector("[data-summary='income']");
  els.summaryExpense = document.querySelector("[data-summary='expense']");
  els.summaryBalance = document.querySelectorAll("[data-summary='balance']");
  els.previewList = document.getElementById("preview-list");
  els.homeGoalsPreview = document.getElementById("home-goals-preview");
  els.form = document.getElementById("transaction-form");
  els.amountInput = document.getElementById("amount");
  els.noteInput = document.getElementById("note");
  els.categoryInput = document.getElementById("category");
  els.currencyInput = document.getElementById("currency");
  els.dateInput = document.getElementById("date");
  els.typeButtons = document.querySelectorAll("[data-type]");
  els.goalAllocationBox = document.getElementById("goal-allocation-box");
  els.allocationGoalInput = document.getElementById("allocation-goal");
  els.allocationTypeInput = document.getElementById("allocation-type");
  els.allocationValueInput = document.getElementById("allocation-value");
  els.allocationHelp = document.getElementById("allocation-help");
  els.filterButtons = document.querySelectorAll("[data-filter]");
  els.homeFilterButtons = document.querySelectorAll(".home-filter-btn");
  els.transactionsList = document.getElementById("transactions-list");
  els.transactionFeedback = document.getElementById("transaction-feedback");
  els.goalForm = document.getElementById("goal-form");
  els.goalTitleInput = document.getElementById("goal-title");
  els.goalTargetInput = document.getElementById("goal-target");
  els.goalCurrentInput = document.getElementById("goal-current");
  els.goalCurrencyInput = document.getElementById("goal-currency");
  els.goalDeadlineInput = document.getElementById("goal-deadline");
  els.goalNoteInput = document.getElementById("goal-note");
  els.goalFeedback = document.getElementById("goal-feedback");
  els.goalsList = document.getElementById("goals-list");
  els.bestMonth = document.getElementById("best-month-card");
  els.highestSpend = document.getElementById("highest-spend-card");
  els.expenseChart = document.getElementById("expenses-chart");
  els.savingsChart = document.getElementById("savings-chart");
  els.monthlyList = document.getElementById("monthly-list");
  els.logoutButton = document.getElementById("logout-btn");
  els.currentUsername = document.getElementById("current-username");
}

function bindAppEvents() {
  els.navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = link.dataset.page;
      showPage(target);
      window.location.hash = target;
    });
  });

  els.typeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      appState.currentType = button.dataset.type;
      updateTypeButtons();
      updateAllocationVisibility();
    });
  });

  els.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      appState.currentFilter = button.dataset.filter;
      updateFilterButtons();
      renderTransactions();
    });
  });

  els.homeFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      appState.currentHomeRange = button.dataset.range;
      updateHomeFilterButtons();
      renderHome();
    });
  });

  els.currencyInput?.addEventListener("change", syncCurrencyFields);
  els.goalCurrencyInput?.addEventListener("change", syncCurrencyFields);
  els.allocationGoalInput?.addEventListener("change", updateAllocationHelp);
  els.allocationTypeInput?.addEventListener("change", updateAllocationHelp);

  els.form?.addEventListener("submit", handleAddTransaction);
  els.goalForm?.addEventListener("submit", handleAddGoal);
  els.logoutButton?.addEventListener("click", handleLogout);

  window.addEventListener("hashchange", () => {
    showPage(getInitialPage());
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session?.user) {
      if (!document.body.classList.contains("auth-page")) {
        redirectToLanding();
      }
      return;
    }

    appState.currentUser = session.user;
  });
}

function syncCurrencyFields() {
  const preferredCurrency =
    els.currencyInput?.value ||
    els.goalCurrencyInput?.value ||
    appState.currentProfile?.default_currency ||
    "GBP";

  if (els.currencyInput && els.currencyInput.value !== preferredCurrency) {
    els.currencyInput.value = preferredCurrency;
  }
  if (els.goalCurrencyInput && els.goalCurrencyInput.value !== preferredCurrency) {
    els.goalCurrencyInput.value = preferredCurrency;
  }

  updateAllocationHelp();
}

function updateAllocationVisibility() {
  if (!els.goalAllocationBox) {
    return;
  }

  const shouldShow = appState.currentType === "income";
  els.goalAllocationBox.classList.toggle("hidden", !shouldShow);
  updateAllocationHelp();
}

function renderGoalAllocationOptions() {
  if (!els.allocationGoalInput) {
    return;
  }

  const previousValue = els.allocationGoalInput.value;
  const options = ['<option value="">No goal allocation</option>'];

  appState.goals.forEach((goal) => {
    options.push(`<option value="${goal.id}">${escapeHtml(goal.title)} (${goal.currency})</option>`);
  });

  els.allocationGoalInput.innerHTML = options.join("");

  if (appState.goals.some((goal) => goal.id === previousValue)) {
    els.allocationGoalInput.value = previousValue;
  } else {
    els.allocationGoalInput.value = "";
  }

  updateAllocationHelp();
}

function updateAllocationHelp() {
  if (!els.allocationHelp) {
    return;
  }

  if (appState.currentType !== "income") {
    els.allocationHelp.textContent = "Goal allocation is only available for income transactions.";
    return;
  }

  if (!appState.goals.length) {
    els.allocationHelp.textContent = "Create a goal first if you want income to automatically fund it.";
    return;
  }

  if (!els.allocationGoalInput?.value) {
    els.allocationHelp.textContent = "Choose a goal and set either a percentage or exact amount from this income.";
    return;
  }

  els.allocationHelp.textContent =
    els.allocationTypeInput?.value === "amount"
      ? "A fixed amount from this income will be added to the selected goal."
      : "A percentage of this income will be added to the selected goal.";
}

async function loadProfile() {
  const metadataUsername = appState.currentUser?.user_metadata?.username;
  const fallbackEmail = appState.currentUser?.email || "";

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, email, default_currency")
    .eq("id", appState.currentUser.id)
    .maybeSingle();

  if (error) {
    appState.currentProfile = {
      username: metadataUsername || fallbackEmail,
      email: fallbackEmail,
      default_currency: "GBP",
    };
    return;
  }

  appState.currentProfile = data || {
    username: metadataUsername || fallbackEmail,
    email: fallbackEmail,
    default_currency: "GBP",
  };
}

function setTransactionFeedback(message = "", tone = "") {
  if (!els.transactionFeedback) {
    return;
  }

  els.transactionFeedback.textContent = message;
  els.transactionFeedback.classList.remove("error", "success");
  if (tone) {
    els.transactionFeedback.classList.add(tone);
  }
}

function setGoalFeedback(message = "", tone = "") {
  if (!els.goalFeedback) {
    return;
  }

  els.goalFeedback.textContent = message;
  els.goalFeedback.classList.remove("error", "success");
  if (tone) {
    els.goalFeedback.classList.add(tone);
  }
}

function getFriendlySupabaseError(error, fallbackMessage) {
  const rawMessage = error?.message || fallbackMessage;
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes('relation "transactions" does not exist') || normalized.includes('relation "goals" does not exist')) {
    return "Supabase is connected, but one of the required tables does not exist yet. Run the latest SQL setup or migration file in your Supabase SQL Editor.";
  }

  if (normalized.includes("row-level security") || normalized.includes("policy")) {
    return "Supabase blocked this action because the database policies are not set up yet. Run the latest SQL setup or migration file in your Supabase SQL Editor.";
  }

  if (normalized.includes("invalid input syntax")) {
    return "One of the values could not be saved. Please check the amount, currency, and date fields.";
  }

  return rawMessage;
}

async function handleLogout() {
  await supabase.auth.signOut();
  redirectToLanding();
}

function redirectToAuth() {
  window.location.replace("auth.html");
}

function redirectToLanding() {
  window.location.replace("landing.html");
}

function redirectToApp() {
  window.location.replace("index.html");
}

function getInitialPage() {
  const hash = window.location.hash.replace("#", "").trim();
  if (["home", "transactions", "goals", "monthly"].includes(hash)) {
    return hash;
  }
  return "home";
}

function showPage(pageId) {
  appState.currentPage = pageId;

  els.pages.forEach((page) => {
    page.classList.toggle("active", page.id === pageId);
  });

  els.navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.page === pageId);
  });
}

function setDefaultDate() {
  if (els.dateInput && !els.dateInput.value) {
    els.dateInput.value = new Date().toISOString().split("T")[0];
  }
}

function setDefaultGoalDate() {
  if (els.goalDeadlineInput && !els.goalDeadlineInput.value) {
    const future = new Date();
    future.setMonth(future.getMonth() + 3);
    els.goalDeadlineInput.value = future.toISOString().split("T")[0];
  }
}

async function loadTransactions() {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, amount, note, category, date, currency, allocation_goal_id, allocation_amount, allocation_type")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    appState.transactions = [];
    setTransactionFeedback(
      getFriendlySupabaseError(error, "Could not load transactions from Supabase."),
      "error"
    );
    return;
  }

  appState.transactions = Array.isArray(data) ? data : [];
  setTransactionFeedback("");
}

async function loadGoals() {
  const { data, error } = await supabase
    .from("goals")
    .select("id, title, target_amount, current_amount, deadline, note, currency, created_at")
    .order("deadline", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    appState.goals = [];
    setGoalFeedback(
      getFriendlySupabaseError(error, "Could not load goals from Supabase."),
      "error"
    );
    return;
  }

  appState.goals = Array.isArray(data) ? data : [];
  setGoalFeedback("");
}

async function handleAddTransaction(event) {
  event.preventDefault();
  setTransactionFeedback("");

  const amount = Number(els.amountInput.value);
  const note = els.noteInput.value.trim();
  const category = els.categoryInput.value;
  const currency = normalizeCurrency(els.currencyInput.value);
  const date = els.dateInput.value || new Date().toISOString().split("T")[0];
  const allocationGoalId = els.allocationGoalInput?.value || "";
  const allocationType = els.allocationTypeInput?.value || "percentage";
  const allocationValue = Number(els.allocationValueInput?.value || 0);

  if (!amount || amount <= 0 || !note || !category || !currency || !date) {
    setTransactionFeedback("Please complete all transaction fields before saving.", "error");
    return;
  }

  let allocationAmount = 0;
  let selectedGoal = null;

  if (appState.currentType === "income" && allocationGoalId) {
    selectedGoal = appState.goals.find((goal) => goal.id === allocationGoalId) || null;

    if (!selectedGoal) {
      setTransactionFeedback("Please choose a valid goal for this allocation.", "error");
      return;
    }

    if (normalizeCurrency(selectedGoal.currency) !== currency) {
      setTransactionFeedback("The income currency must match the selected goal currency.", "error");
      return;
    }

    if (!allocationValue || allocationValue <= 0) {
      setTransactionFeedback("Enter a percentage or fixed amount to allocate to the selected goal.", "error");
      return;
    }

    if (allocationType === "percentage") {
      if (allocationValue > 100) {
        setTransactionFeedback("Percentage allocation cannot be more than 100%.", "error");
        return;
      }
      allocationAmount = (amount * allocationValue) / 100;
    } else {
      if (allocationValue > amount) {
        setTransactionFeedback("Fixed allocation cannot be more than the income amount.", "error");
        return;
      }
      allocationAmount = allocationValue;
    }
  }

  const payload = {
    user_id: appState.currentUser.id,
    type: appState.currentType,
    amount,
    note,
    category,
    currency,
    date,
    allocation_goal_id: allocationGoalId || null,
    allocation_type: allocationGoalId ? allocationType : null,
    allocation_amount: allocationGoalId ? allocationAmount : 0,
  };

  const { error } = await supabase.from("transactions").insert(payload);
  if (error) {
    setTransactionFeedback(
      getFriendlySupabaseError(error, "Could not save this transaction to Supabase."),
      "error"
    );
    return;
  }

  if (selectedGoal && allocationAmount > 0) {
    const { error: goalUpdateError } = await supabase
      .from("goals")
      .update({
        current_amount: Number(selectedGoal.current_amount) + allocationAmount,
      })
      .eq("id", selectedGoal.id);

    if (goalUpdateError) {
      setTransactionFeedback(
        getFriendlySupabaseError(goalUpdateError, "Transaction saved, but the goal allocation could not be applied."),
        "error"
      );
      await Promise.all([loadTransactions(), loadGoals()]);
      renderApp();
      return;
    }
  }

  await Promise.all([loadTransactions(), loadGoals()]);
  renderApp();
  els.form.reset();
  appState.currentType = "expense";
  updateTypeButtons();
  updateAllocationVisibility();
  els.currencyInput.value = currency;
  setDefaultDate();
  setTransactionFeedback(
    selectedGoal && allocationAmount > 0
      ? `Transaction added and ${formatSingleCurrency(allocationAmount, currency)} sent to ${selectedGoal.title}.`
      : "Transaction added successfully.",
    "success"
  );
}

async function handleAddGoal(event) {
  event.preventDefault();
  setGoalFeedback("");

  const title = els.goalTitleInput.value.trim();
  const targetAmount = Number(els.goalTargetInput.value);
  const currentAmount = Number(els.goalCurrentInput.value || 0);
  const currency = normalizeCurrency(els.goalCurrencyInput.value);
  const deadline = els.goalDeadlineInput.value;
  const note = els.goalNoteInput.value.trim();

  if (!title || !targetAmount || targetAmount <= 0 || currentAmount < 0 || !currency || !deadline) {
    setGoalFeedback("Please complete all goal fields before saving.", "error");
    return;
  }

  const { error } = await supabase.from("goals").insert({
    user_id: appState.currentUser.id,
    title,
    target_amount: targetAmount,
    current_amount: currentAmount,
    currency,
    deadline,
    note,
  });

  if (error) {
    setGoalFeedback(
      getFriendlySupabaseError(error, "Could not save this goal to Supabase."),
      "error"
    );
    return;
  }

  await loadGoals();
  renderGoals();
  els.goalForm.reset();
  els.goalCurrencyInput.value = currency;
  setDefaultGoalDate();
  setGoalFeedback("Goal added successfully.", "success");
}

async function handleDeleteTransaction(id) {
  const transaction = appState.transactions.find((item) => item.id === id);
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) {
    setTransactionFeedback(
      getFriendlySupabaseError(error, "Could not delete this transaction from Supabase."),
      "error"
    );
    return;
  }

  if (transaction?.allocation_goal_id && Number(transaction.allocation_amount) > 0) {
    const goal = appState.goals.find((item) => item.id === transaction.allocation_goal_id);
    if (goal) {
      const { error: goalRollbackError } = await supabase
        .from("goals")
        .update({
          current_amount: Math.max(Number(goal.current_amount) - Number(transaction.allocation_amount), 0),
        })
        .eq("id", goal.id);

      if (goalRollbackError) {
        setTransactionFeedback(
          getFriendlySupabaseError(goalRollbackError, "Transaction deleted, but the goal allocation could not be reversed."),
          "error"
        );
      }
    }
  }

  await Promise.all([loadTransactions(), loadGoals()]);
  renderApp();
  setTransactionFeedback("Transaction deleted.", "success");
}

async function handleDeleteGoal(id) {
  await supabase
    .from("transactions")
    .update({
      allocation_goal_id: null,
      allocation_type: null,
      allocation_amount: 0,
    })
    .eq("allocation_goal_id", id);

  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) {
    setGoalFeedback(
      getFriendlySupabaseError(error, "Could not delete this goal from Supabase."),
      "error"
    );
    return;
  }

  await Promise.all([loadGoals(), loadTransactions()]);
  renderApp();
  setGoalFeedback("Goal deleted.", "success");
}

function renderApp() {
  if (els.currentUsername) {
    els.currentUsername.textContent = appState.currentProfile?.username || appState.currentUser?.email || "";
  }

  renderGoalAllocationOptions();
  renderHome();
  renderTransactions();
  renderGoals();
  renderMonthly();
}

function renderHome() {
  const homeTransactions = getHomeRangeTransactions();
  const summary = getSummary(homeTransactions);
  renderHomeGoalsPreview();

  renderMoneyDisplay(els.summaryIncome, summary.incomeTotals);
  renderMoneyDisplay(els.summaryExpense, summary.expenseTotals);

  els.summaryBalance.forEach((balanceEl) => {
    renderMoneyDisplay(balanceEl, summary.balanceTotals);
    balanceEl.classList.remove("positive", "negative");

    const balanceEntries = Object.entries(summary.balanceTotals);
    if (balanceEntries.length === 1) {
      const value = balanceEntries[0][1];
      balanceEl.classList.toggle("positive", value >= 0);
      balanceEl.classList.toggle("negative", value < 0);
    }
  });

  const recent = [...homeTransactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3);

  if (!recent.length) {
    els.previewList.innerHTML = emptyStateMarkup(
      "No transactions in this range",
      "Try another home filter or add a new transaction to populate this preview."
    );
    return;
  }

  els.previewList.innerHTML = recent.map((transaction) => transactionMarkup(transaction, false)).join("");
}

function renderHomeGoalsPreview() {
  if (!els.homeGoalsPreview) {
    return;
  }

  if (!appState.goals.length) {
    els.homeGoalsPreview.innerHTML = `
      <div class="goal-strip-card">
        <span class="goal-strip-label">Goals</span>
        <span class="goal-strip-copy">Add your first savings goal to track progress here.</span>
      </div>
    `;
    return;
  }

  const goal = [...appState.goals].sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];
  const progress = Math.min((Number(goal.current_amount) / Number(goal.target_amount)) * 100, 100);
  const remaining = Math.max(Number(goal.target_amount) - Number(goal.current_amount), 0);

  els.homeGoalsPreview.innerHTML = `
    <div class="goal-strip-card">
      <div class="goal-strip-main">
        <span class="goal-strip-label">Goal track</span>
        <strong class="goal-strip-title">${escapeHtml(goal.title)}</strong>
        <span class="goal-strip-meta">Deadline ${formatDate(goal.deadline)}</span>
      </div>
      <div class="goal-strip-progress">
        <div class="goal-progress-bar">
          <div class="goal-progress-fill" style="width:${progress}%"></div>
        </div>
      </div>
      <div class="goal-strip-stats">
        <span>${progress.toFixed(progress % 1 === 0 ? 0 : 1)}%</span>
        <span>${formatSingleCurrency(remaining, goal.currency)} left</span>
      </div>
    </div>
  `;
}

function getHomeRangeTransactions() {
  const range = appState.currentHomeRange;
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (range === "alltime") {
    return appState.transactions;
  }

  if (range === "weekly") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return appState.transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.date);
      return transactionDate >= start && transactionDate <= today;
    });
  }

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  return appState.transactions.filter((transaction) => {
    const transactionDate = new Date(transaction.date);
    return transactionDate >= monthStart && transactionDate <= today;
  });
}

function renderTransactions() {
  const filtered = getFilteredTransactions();

  if (!filtered.length) {
    els.transactionsList.innerHTML = emptyStateMarkup(
      "Nothing to show yet",
      appState.transactions.length
        ? "Try a different filter to see more transactions."
        : "Your cloud-synced transactions will appear here once you add the first one."
    );
    return;
  }

  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
  els.transactionsList.innerHTML = sorted.map((transaction) => transactionMarkup(transaction, true)).join("");

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleDeleteTransaction(button.dataset.deleteId);
    });
  });
}

function getFilteredTransactions() {
  const filter = appState.currentFilter;

  if (filter === "all") {
    return appState.transactions;
  }
  if (filter === "income") {
    return appState.transactions.filter((transaction) => transaction.type === "income");
  }
  if (filter === "expense") {
    return appState.transactions.filter((transaction) => transaction.type === "expense");
  }

  return appState.transactions.filter((transaction) => transaction.category === filter);
}

function renderGoals() {
  if (!appState.goals.length) {
    els.goalsList.innerHTML = emptyStateMarkup(
      "No goals yet",
      "Create a goal like buying a MacBook, building an emergency fund, or saving for a trip."
    );
    return;
  }

  els.goalsList.innerHTML = appState.goals
    .map((goal) => {
      const progress = Math.min((Number(goal.current_amount) / Number(goal.target_amount)) * 100, 100);
      const remaining = Math.max(Number(goal.target_amount) - Number(goal.current_amount), 0);
      const isComplete = Number(goal.current_amount) >= Number(goal.target_amount);

      return `
        <article class="goal-card">
          <div class="goal-head">
            <div>
              <h3 class="goal-title">${escapeHtml(goal.title)}</h3>
              <p class="goal-deadline">Deadline: ${formatDate(goal.deadline)}</p>
            </div>
            <button class="delete-btn" type="button" data-delete-goal-id="${goal.id}">Delete</button>
          </div>

          <div class="goal-metrics">
            <div class="goal-metric">
              <span class="summary-label">Saved</span>
              <strong>${formatSingleCurrency(Number(goal.current_amount), goal.currency)}</strong>
            </div>
            <div class="goal-metric">
              <span class="summary-label">Target</span>
              <strong>${formatSingleCurrency(Number(goal.target_amount), goal.currency)}</strong>
            </div>
            <div class="goal-metric">
              <span class="summary-label">Remaining</span>
              <strong>${formatSingleCurrency(remaining, goal.currency)}</strong>
            </div>
          </div>

          <div class="goal-progress">
            <div class="goal-progress-bar">
              <div class="goal-progress-fill" style="width:${progress}%"></div>
            </div>
            <div class="goal-progress-copy">
              <span>${progress.toFixed(progress % 1 === 0 ? 0 : 1)}% complete</span>
              <span class="${isComplete ? "goal-complete" : ""}">${isComplete ? "Goal reached" : "In progress"}</span>
            </div>
          </div>

          ${renderGoalFundingSummary(goal.id)}
          ${goal.note ? `<p class="goal-note">${escapeHtml(goal.note)}</p>` : ""}
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-delete-goal-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleDeleteGoal(button.dataset.deleteGoalId);
    });
  });
}

function renderMonthly() {
  const monthlyGroups = groupTransactionsByMonth(appState.transactions);
  const months = Object.values(monthlyGroups);

  if (!months.length) {
    els.bestMonth.innerHTML = monthHighlightMarkup("Best savings month", "No data yet", "Add transactions to unlock monthly insights.");
    els.highestSpend.innerHTML = monthHighlightMarkup("Highest spend month", "No data yet", "Your largest spending month will appear here.");
    els.expenseChart.innerHTML = emptyStateMarkup("No expense chart yet", "Monthly expense bars appear as soon as you start tracking.");
    els.savingsChart.innerHTML = emptyStateMarkup("No savings chart yet", "Savings bars appear automatically when there is monthly data.");
    els.monthlyList.innerHTML = emptyStateMarkup("No monthly breakdown yet", "Add a few transactions and BudgetMate will group everything by month.");
    return;
  }

  const bestSavingsMonth = months.reduce((best, current) => (current.savingsBase > best.savingsBase ? current : best), months[0]);
  const highestSpendMonth = months.reduce((top, current) => (current.expensesBase > top.expensesBase ? current : top), months[0]);

  els.bestMonth.innerHTML = monthHighlightMarkup(
    "Best savings month",
    bestSavingsMonth.label,
    moneyBreakdownMarkup(bestSavingsMonth.savingsTotals)
  );
  els.highestSpend.innerHTML = monthHighlightMarkup(
    "Highest spend month",
    highestSpendMonth.label,
    moneyBreakdownMarkup(highestSpendMonth.expensesTotals)
  );

  els.expenseChart.innerHTML = chartMarkup(months, "expensesBase", "expense-bar");
  els.savingsChart.innerHTML = chartMarkup(months, "savingsBase", "savings-bar");
  els.monthlyList.innerHTML = months
    .map(
      (month) => `
        <article class="month-summary">
          <h3 class="month-list-title">${month.label}</h3>
          <div class="month-summary-row"><span>Income</span><strong>${moneyBreakdownMarkup(month.incomeTotals)}</strong></div>
          <div class="month-summary-row"><span>Expenses</span><strong>${moneyBreakdownMarkup(month.expensesTotals)}</strong></div>
          <div class="month-summary-row"><span>Savings</span><strong>${moneyBreakdownMarkup(month.savingsTotals)}</strong></div>
        </article>
      `
    )
    .join("");
}

function updateTypeButtons() {
  els.typeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.type === appState.currentType);
  });
}

function updateFilterButtons() {
  els.filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === appState.currentFilter);
  });
}

function updateHomeFilterButtons() {
  els.homeFilterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.range === appState.currentHomeRange);
  });
}

function getSummary(transactions) {
  const incomeTotals = {};
  const expenseTotals = {};

  transactions.forEach((transaction) => {
    const currency = normalizeCurrency(transaction.currency);
    if (transaction.type === "income") {
      incomeTotals[currency] = (incomeTotals[currency] || 0) + Number(transaction.amount);
    } else {
      expenseTotals[currency] = (expenseTotals[currency] || 0) + Number(transaction.amount);
    }
  });

  return {
    incomeTotals,
    expenseTotals,
    balanceTotals: subtractCurrencyTotals(incomeTotals, expenseTotals),
  };
}

function groupTransactionsByMonth(transactions) {
  const grouped = {};

  [...transactions]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((transaction) => {
      const date = new Date(transaction.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const currency = normalizeCurrency(transaction.currency);

      if (!grouped[key]) {
        grouped[key] = {
          key,
          label: date.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
          incomeTotals: {},
          expensesTotals: {},
          savingsTotals: {},
          expensesBase: 0,
          savingsBase: 0,
        };
      }

      if (transaction.type === "income") {
        grouped[key].incomeTotals[currency] = (grouped[key].incomeTotals[currency] || 0) + Number(transaction.amount);
      } else {
        grouped[key].expensesTotals[currency] = (grouped[key].expensesTotals[currency] || 0) + Number(transaction.amount);
        grouped[key].expensesBase += Number(transaction.amount);
      }

      grouped[key].savingsTotals = subtractCurrencyTotals(grouped[key].incomeTotals, grouped[key].expensesTotals);
      grouped[key].savingsBase = Object.values(grouped[key].savingsTotals).reduce((sum, value) => sum + value, 0);
    });

  return Object.fromEntries(Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)));
}

function subtractCurrencyTotals(sourceTotals, subtractTotals) {
  const result = {};
  const currencies = new Set([...Object.keys(sourceTotals), ...Object.keys(subtractTotals)]);

  currencies.forEach((currency) => {
    result[currency] = (sourceTotals[currency] || 0) - (subtractTotals[currency] || 0);
  });

  return result;
}

function renderMoneyDisplay(element, totals) {
  if (!element) {
    return;
  }
  element.innerHTML = moneyBreakdownMarkup(totals);
}

function moneyBreakdownMarkup(totals) {
  const entries = Object.entries(totals).filter(([, amount]) => amount !== 0);
  if (!entries.length) {
    return formatSingleCurrency(0, "GBP");
  }

  if (entries.length === 1) {
    const [currency, amount] = entries[0];
    return formatSingleCurrency(amount, currency);
  }

  return `<span class="money-stack">${entries
    .map(([currency, amount]) => `<span>${formatSingleCurrency(amount, currency)}</span>`)
    .join("")}</span>`;
}

function transactionMarkup(transaction, showDeleteButton) {
  const currency = normalizeCurrency(transaction.currency);
  const signedAmount = `${transaction.type === "income" ? "+" : "-"}${formatSingleCurrency(Number(transaction.amount), currency)}`;
  const safeCategory = transaction.category || "other";
  const allocationNote = renderAllocationMeta(transaction);

  return `
    <article class="transaction-item">
      <div class="transaction-main">
        <span class="badge ${safeCategory}">${safeCategory}</span>
        <div class="transaction-copy">
          <p class="transaction-note">${escapeHtml(transaction.note)}</p>
          <p class="transaction-meta">${formatDate(transaction.date)} • ${capitalize(transaction.type)} • ${currency}${allocationNote}</p>
        </div>
      </div>
      <div class="transaction-actions">
        <span class="amount ${transaction.type}">${signedAmount}</span>
        ${showDeleteButton ? `<button class="delete-btn" type="button" data-delete-id="${transaction.id}">Delete</button>` : ""}
      </div>
    </article>
  `;
}

function emptyStateMarkup(title, copy) {
  return `
    <div class="empty-state">
      <h3>${title}</h3>
      <p class="section-copy">${copy}</p>
    </div>
  `;
}

function renderAllocationMeta(transaction) {
  if (!transaction.allocation_goal_id || !transaction.allocation_amount) {
    return "";
  }

  const goal = appState.goals.find((item) => item.id === transaction.allocation_goal_id);
  const goalTitle = goal ? goal.title : "goal";
  return ` • Sent ${formatSingleCurrency(Number(transaction.allocation_amount), normalizeCurrency(transaction.currency))} to ${escapeHtml(goalTitle)}`;
}

function renderGoalFundingSummary(goalId) {
  const relatedIncomeTransactions = appState.transactions.filter(
    (transaction) =>
      transaction.type === "income" &&
      transaction.allocation_goal_id === goalId &&
      Number(transaction.allocation_amount) > 0
  );

  if (!relatedIncomeTransactions.length) {
    return "";
  }

  const count = relatedIncomeTransactions.length;
  const latest = relatedIncomeTransactions[0];
  return `
    <p class="goal-funding-note">
      Auto-funded by ${count} income ${count === 1 ? "transaction" : "transactions"}.
      Latest: ${formatSingleCurrency(Number(latest.allocation_amount), normalizeCurrency(latest.currency))}.
    </p>
  `;
}

function monthHighlightMarkup(label, title, moneyHtml) {
  return `
    <div class="month-card-label">${label}</div>
    <div class="month-card-value">${title}</div>
    <div class="month-money">${moneyHtml}</div>
  `;
}

function chartMarkup(months, valueKey, barClass) {
  const maxValue = Math.max(...months.map((month) => Math.max(month[valueKey], 0)), 1);

  return `
    <div class="chart">
      ${months
        .map((month) => {
          const value = Math.max(month[valueKey], 0);
          const height = Math.max((value / maxValue) * 100, value ? 12 : 6);
          return `
            <div class="bar-group">
              <div class="bar-value">${moneyBreakdownMarkup(valueKey === "expensesBase" ? month.expensesTotals : month.savingsTotals)}</div>
              <div class="bar-track">
                <div class="bar ${barClass}" style="height:${height}%"></div>
              </div>
              <div class="bar-label">${month.label}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function normalizeCurrency(value) {
  return SUPPORTED_CURRENCIES.includes(value) ? value : "GBP";
}

function formatSingleCurrency(amount, currency) {
  return new Intl.NumberFormat(getLocaleForCurrency(currency), {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(amount);
}

function getLocaleForCurrency(currency) {
  switch (currency) {
    case "USD":
      return "en-US";
    case "EUR":
      return "en-IE";
    case "JPY":
      return "ja-JP";
    default:
      return "en-GB";
  }
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
