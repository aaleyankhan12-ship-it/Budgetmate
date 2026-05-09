import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://lgowkyajpdecmgjgtqso.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_KHZiBTVtRPqcog69GR9dDw_oxr_A86F";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const SUPPORTED_CURRENCIES = ["GBP", "USD", "EUR", "JPY"];
const PENDING_VERIFICATION_KEY = "budgetmate-pending-verification";
const OTP_MIN_LENGTH = 6;
const OTP_MAX_LENGTH = 10;

const appState = {
  currentUser: null,
  currentProfile: null,
  transactions: [],
  recurringEntries: [],
  goals: [],
  currentPage: "home",
  currentFilter: "all",
  currentType: "expense",
  currentQuickType: "expense",
  currentRecurringType: "expense",
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
    clearPendingVerification();
    redirectToApp();
    return;
  }

  cacheAuthElements();
  bindAuthEvents();
  const pendingVerification = getPendingVerification();
  if (pendingVerification?.email) {
    if (els.verifyEmailCopy) {
      els.verifyEmailCopy.textContent = `Enter the verification code we sent to ${pendingVerification.email}.`;
    }
    showAuthForm("verify");
    return;
  }

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
  await Promise.all([loadGoals(), loadRecurringEntries()]);
  setDefaultDate();
  setDefaultGoalDate();
  setDefaultRecurringDate();
  syncCurrencyFields();
  updateTypeButtons();
  updateQuickTypeButtons();
  updateRecurringTypeButtons();
  updateAllocationVisibility();
  updateFilterButtons();
  updateHomeFilterButtons();
  const generatedCount = await processRecurringEntries();
  await Promise.all([loadTransactions(), loadGoals(), loadRecurringEntries()]);
  showPage(getInitialPage());
  renderApp();

  if (generatedCount > 0) {
    setRecurringFeedback(
      `${generatedCount} scheduled ${generatedCount === 1 ? "entry was" : "entries were"} added automatically.`,
      "success"
    );
  }
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
  els.authTitle = document.querySelector(".auth-title");
  els.authCopy = document.querySelector(".auth-copy");
  els.authToggle = document.querySelector(".auth-toggle");
  els.showLoginButton = document.getElementById("show-login");
  els.showSignupButton = document.getElementById("show-signup");
  els.loginForm = document.getElementById("login-form");
  els.signupForm = document.getElementById("signup-form");
  els.verifyForm = document.getElementById("verify-form");
  els.loginEmail = document.getElementById("login-email");
  els.loginPassword = document.getElementById("login-password");
  els.signupUsername = document.getElementById("signup-username");
  els.signupEmail = document.getElementById("signup-email");
  els.signupPassword = document.getElementById("signup-password");
  els.verifyCode = document.getElementById("verify-code");
  els.verifyEmailCopy = document.getElementById("verify-email-copy");
  els.resendCodeButton = document.getElementById("resend-code");
  els.changeSignupEmailButton = document.getElementById("change-signup-email");
  els.loginError = document.getElementById("login-error");
  els.signupError = document.getElementById("signup-error");
  els.verifyError = document.getElementById("verify-error");
}

function bindAuthEvents() {
  els.showLoginButton?.addEventListener("click", () => {
    clearPendingVerification();
    clearAuthErrors();
    showAuthForm("login");
  });

  els.showSignupButton?.addEventListener("click", () => {
    clearPendingVerification();
    clearAuthErrors();
    showAuthForm("signup");
  });

  els.loginForm?.addEventListener("submit", handleLogin);
  els.signupForm?.addEventListener("submit", handleSignup);
  els.verifyForm?.addEventListener("submit", handleVerifyCode);
  els.resendCodeButton?.addEventListener("click", handleResendCode);
  els.changeSignupEmailButton?.addEventListener("click", handleChangeSignupEmail);
  els.verifyCode?.addEventListener("input", () => {
    els.verifyCode.value = els.verifyCode.value.replace(/\D/g, "").slice(0, OTP_MAX_LENGTH);
  });
}

function showAuthForm(formName) {
  const showLogin = formName === "login";
  const showVerify = formName === "verify";
  els.loginForm?.classList.toggle("active", showLogin);
  els.signupForm?.classList.toggle("active", formName === "signup");
  els.verifyForm?.classList.toggle("active", showVerify);
  els.showLoginButton?.classList.toggle("active", showLogin);
  els.showSignupButton?.classList.toggle("active", formName === "signup");
  els.authToggle?.classList.toggle("hidden", showVerify);

  if (showVerify) {
    if (els.authTitle) {
      els.authTitle.textContent = "Check your code";
    }
    if (els.authCopy) {
      els.authCopy.textContent = "We sent a verification code to your email. Enter it here to finish creating your BudgetMate account.";
    }
    return;
  }

  if (els.authTitle) {
    els.authTitle.textContent = showLogin ? "Welcome back" : "Create your account";
  }
  if (els.authCopy) {
    els.authCopy.textContent = showLogin
      ? "Create an account or sign in to access your personal transactions and monthly budget insights."
      : "Set up your BudgetMate account and we will verify your email with a quick code before you enter the app.";
  }
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
  if (els.verifyError) {
    els.verifyError.textContent = "";
    els.verifyError.classList.remove("success");
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

  const { data: existingEmail, error: emailCheckError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (emailCheckError) {
    els.signupError.textContent = "We could not verify that email right now. Please try again in a moment.";
    return;
  }

  if (existingEmail) {
    els.signupError.textContent = "An account with that email already exists. Try logging in instead.";
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
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
    storePendingVerification({ email, username });
    if (els.verifyEmailCopy) {
      els.verifyEmailCopy.textContent = `Enter the verification code we sent to ${email}.`;
    }
    if (els.verifyCode) {
      els.verifyCode.value = "";
    }
    showAuthForm("verify");
    if (els.verifyError) {
      els.verifyError.textContent = "We sent your BudgetMate verification code. Enter it below to finish creating the account.";
      els.verifyError.classList.add("success");
    }
    return;
  }

  redirectToApp();
}

async function handleVerifyCode(event) {
  event.preventDefault();
  clearAuthErrors();

  const pendingVerification = getPendingVerification();
  const token = els.verifyCode?.value.trim() || "";

  if (!pendingVerification?.email) {
    els.verifyError.textContent = "Your verification session expired. Please sign up again.";
    showAuthForm("signup");
    return;
  }

  const tokenPattern = new RegExp(`^\\d{${OTP_MIN_LENGTH},${OTP_MAX_LENGTH}}$`);
  if (!tokenPattern.test(token)) {
    els.verifyError.textContent = `Please enter the code from your email. It should be ${OTP_MIN_LENGTH} to ${OTP_MAX_LENGTH} digits.`;
    return;
  }

  const { error } = await supabase.auth.verifyOtp({
    email: pendingVerification.email,
    token,
    type: "signup",
  });

  if (error) {
    els.verifyError.textContent = getFriendlyAuthMessage(error, "verify");
    return;
  }

  clearPendingVerification();
  redirectToApp();
}

async function handleResendCode() {
  clearAuthErrors();

  const pendingVerification = getPendingVerification();
  if (!pendingVerification?.email) {
    els.verifyError.textContent = "There is no verification waiting right now. Please sign up again.";
    showAuthForm("signup");
    return;
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: pendingVerification.email,
  });

  if (error) {
    els.verifyError.textContent = getFriendlyAuthMessage(error, "resend");
    return;
  }

  els.verifyError.textContent = `A fresh code was sent to ${pendingVerification.email}.`;
  els.verifyError.classList.add("success");
}

function handleChangeSignupEmail() {
  const pendingVerification = getPendingVerification();
  clearPendingVerification();
  clearAuthErrors();
  if (pendingVerification?.username && els.signupUsername) {
    els.signupUsername.value = pendingVerification.username;
  }
  if (pendingVerification?.email && els.signupEmail) {
    els.signupEmail.value = pendingVerification.email;
  }
  showAuthForm("signup");
}

function storePendingVerification(data) {
  sessionStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(data));
}

function getPendingVerification() {
  try {
    const rawValue = sessionStorage.getItem(PENDING_VERIFICATION_KEY);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

function clearPendingVerification() {
  sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
}

function getFriendlyAuthMessage(error, mode) {
  const rawMessage = error?.message || (mode === "login" ? "Login failed. Please try again." : "Sign up failed. Please try again.");
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("email rate limit exceeded")) {
    return "Too many emails have been sent in a short time. Please wait a little and try again.";
  }

  if (normalized.includes("for security purposes") || normalized.includes("after") || normalized.includes("seconds")) {
    return "Please wait about a minute before requesting another code.";
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
    return "Please verify your email with the code we sent before logging in.";
  }

  if (normalized.includes("token has expired") || normalized.includes("otp expired")) {
    return "That code has expired. Request a new one and try again.";
  }

  if (normalized.includes("token") || normalized.includes("otp")) {
    return "That code does not look right. Check the latest code in your email and try again.";
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
  els.upcomingList = document.getElementById("upcoming-list");
  els.homeGoalsPreview = document.getElementById("home-goals-preview");
  els.quickAddForm = document.getElementById("quick-add-form");
  els.quickAmountInput = document.getElementById("quick-amount");
  els.quickNoteInput = document.getElementById("quick-note");
  els.quickCategoryInput = document.getElementById("quick-category");
  els.quickTypeButtons = document.querySelectorAll("[data-quick-type]");
  els.quickAddFeedback = document.getElementById("quick-add-feedback");
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
  els.recurringForm = document.getElementById("recurring-form");
  els.recurringNoteInput = document.getElementById("recurring-note");
  els.recurringAmountInput = document.getElementById("recurring-amount");
  els.recurringCategoryInput = document.getElementById("recurring-category");
  els.recurringCurrencyInput = document.getElementById("recurring-currency");
  els.recurringDateInput = document.getElementById("recurring-date");
  els.recurringEndDateInput = document.getElementById("recurring-end-date");
  els.recurringFrequencyInput = document.getElementById("recurring-frequency");
  els.recurringTypeButtons = document.querySelectorAll("[data-recurring-type]");
  els.recurringFeedback = document.getElementById("recurring-feedback");
  els.recurringList = document.getElementById("recurring-list");
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

  els.quickTypeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      appState.currentQuickType = button.dataset.quickType;
      updateQuickTypeButtons();
    });
  });

  els.recurringTypeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      appState.currentRecurringType = button.dataset.recurringType;
      updateRecurringTypeButtons();
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
  els.recurringCurrencyInput?.addEventListener("change", syncCurrencyFields);
  els.allocationGoalInput?.addEventListener("change", updateAllocationHelp);
  els.allocationTypeInput?.addEventListener("change", updateAllocationHelp);

  els.form?.addEventListener("submit", handleAddTransaction);
  els.quickAddForm?.addEventListener("submit", handleQuickAddTransaction);
  els.goalForm?.addEventListener("submit", handleAddGoal);
  els.recurringForm?.addEventListener("submit", handleAddRecurringEntry);
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
    els.recurringCurrencyInput?.value ||
    appState.currentProfile?.default_currency ||
    "GBP";

  if (els.currencyInput && els.currencyInput.value !== preferredCurrency) {
    els.currencyInput.value = preferredCurrency;
  }
  if (els.goalCurrencyInput && els.goalCurrencyInput.value !== preferredCurrency) {
    els.goalCurrencyInput.value = preferredCurrency;
  }
  if (els.recurringCurrencyInput && els.recurringCurrencyInput.value !== preferredCurrency) {
    els.recurringCurrencyInput.value = preferredCurrency;
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

function setRecurringFeedback(message = "", tone = "") {
  if (!els.recurringFeedback) {
    return;
  }

  els.recurringFeedback.textContent = message;
  els.recurringFeedback.classList.remove("error", "success");
  if (tone) {
    els.recurringFeedback.classList.add(tone);
  }
}

function setQuickAddFeedback(message = "", tone = "") {
  if (!els.quickAddFeedback) {
    return;
  }

  els.quickAddFeedback.textContent = message;
  els.quickAddFeedback.classList.remove("error", "success");
  if (tone) {
    els.quickAddFeedback.classList.add(tone);
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
  if (["home", "transactions", "calendar", "goals", "monthly"].includes(hash)) {
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

function setDefaultRecurringDate() {
  if (els.recurringDateInput && !els.recurringDateInput.value) {
    els.recurringDateInput.value = new Date().toISOString().split("T")[0];
  }
}

async function loadTransactions() {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, amount, note, category, date, currency, recurring_source_id, allocation_goal_id, allocation_amount, allocation_type")
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

async function loadRecurringEntries() {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select("id, type, amount, note, category, currency, frequency, next_run_date, end_date, created_at")
    .order("next_run_date", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    appState.recurringEntries = [];
    setRecurringFeedback(
      getFriendlySupabaseError(error, "Could not load scheduled entries from Supabase."),
      "error"
    );
    return;
  }

  appState.recurringEntries = Array.isArray(data) ? data : [];
  setRecurringFeedback("");
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

async function handleQuickAddTransaction(event) {
  event.preventDefault();
  setQuickAddFeedback("");

  const amount = Number(els.quickAmountInput?.value);
  const note = els.quickNoteInput?.value.trim();
  const category = els.quickCategoryInput?.value;
  const currency = normalizeCurrency(appState.currentProfile?.default_currency || "GBP");
  const date = new Date().toISOString().split("T")[0];

  if (!amount || amount <= 0 || !note || !category) {
    setQuickAddFeedback("Please complete amount, note, and category before adding.", "error");
    return;
  }

  const { error } = await supabase.from("transactions").insert({
    user_id: appState.currentUser.id,
    type: appState.currentQuickType,
    amount,
    note,
    category,
    currency,
    date,
    allocation_goal_id: null,
    allocation_type: null,
    allocation_amount: 0,
  });

  if (error) {
    setQuickAddFeedback(
      getFriendlySupabaseError(error, "Could not save this quick transaction to Supabase."),
      "error"
    );
    return;
  }

  await Promise.all([loadTransactions(), loadGoals()]);
  renderApp();
  els.quickAddForm.reset();
  appState.currentQuickType = "expense";
  updateQuickTypeButtons();
  setQuickAddFeedback("Transaction added from Quick add.", "success");
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

async function handleAddRecurringEntry(event) {
  event.preventDefault();
  setRecurringFeedback("");

  const note = els.recurringNoteInput.value.trim();
  const amount = Number(els.recurringAmountInput.value);
  const category = els.recurringCategoryInput.value;
  const currency = normalizeCurrency(els.recurringCurrencyInput.value);
  const frequency = els.recurringFrequencyInput.value;
  const nextRunDate = els.recurringDateInput.value;
  const endDate = els.recurringEndDateInput.value || null;

  if (!note || !amount || amount <= 0 || !category || !currency || !frequency || !nextRunDate) {
    setRecurringFeedback("Please complete all recurring entry fields before saving.", "error");
    return;
  }

  if (endDate && endDate < nextRunDate) {
    setRecurringFeedback("The end date must be on or after the first due date.", "error");
    return;
  }

  const { error } = await supabase.from("recurring_transactions").insert({
    user_id: appState.currentUser.id,
    type: appState.currentRecurringType,
    amount,
    note,
    category,
    currency,
    frequency,
    next_run_date: nextRunDate,
    end_date: endDate,
  });

  if (error) {
    setRecurringFeedback(
      getFriendlySupabaseError(error, "Could not save this recurring entry to Supabase."),
      "error"
    );
    return;
  }

  await loadRecurringEntries();
  const generatedCount = await processRecurringEntries();
  await Promise.all([loadTransactions(), loadRecurringEntries()]);
  renderApp();
  els.recurringForm.reset();
  appState.currentRecurringType = "expense";
  updateRecurringTypeButtons();
  els.recurringCurrencyInput.value = currency;
  setDefaultRecurringDate();
  setRecurringFeedback(
    generatedCount > 0
      ? `Recurring entry saved. ${generatedCount} due ${generatedCount === 1 ? "transaction was" : "transactions were"} added right away.`
      : "Recurring entry saved successfully.",
    "success"
  );
}

async function handleDeleteRecurringEntry(id) {
  const { error } = await supabase.from("recurring_transactions").delete().eq("id", id);
  if (error) {
    setRecurringFeedback(
      getFriendlySupabaseError(error, "Could not delete this recurring entry from Supabase."),
      "error"
    );
    return;
  }

  await loadRecurringEntries();
  renderRecurringEntries();
  setRecurringFeedback("Recurring entry deleted.", "success");
}

async function processRecurringEntries() {
  if (!appState.currentUser?.id || !appState.recurringEntries.length) {
    return 0;
  }

  const today = startOfDay(new Date());
  let generatedCount = 0;

  for (const entry of appState.recurringEntries) {
    let nextRunDate = parseDateInput(entry.next_run_date);
    const endDate = entry.end_date ? parseDateInput(entry.end_date) : null;
    const payloads = [];
    let safetyCounter = 0;

    while (nextRunDate && nextRunDate <= today && (!endDate || nextRunDate <= endDate) && safetyCounter < 366) {
      payloads.push({
        user_id: appState.currentUser.id,
        type: entry.type,
        amount: Number(entry.amount),
        note: entry.note,
        category: entry.category,
        currency: normalizeCurrency(entry.currency),
        date: formatDateInput(nextRunDate),
        allocation_goal_id: null,
        allocation_type: null,
        allocation_amount: 0,
        recurring_source_id: entry.id,
      });

      nextRunDate = addRecurringInterval(nextRunDate, entry.frequency);
      safetyCounter += 1;
    }

    if (!payloads.length) {
      continue;
    }

    const { error: upsertError } = await supabase
      .from("transactions")
      .upsert(payloads, {
        onConflict: "user_id,recurring_source_id,date",
        ignoreDuplicates: true,
      });

    if (upsertError) {
      setRecurringFeedback(
        getFriendlySupabaseError(upsertError, "A scheduled entry could not be turned into a transaction."),
        "error"
      );
      continue;
    }

    generatedCount += payloads.length;

    const { error: updateError } = await supabase
      .from("recurring_transactions")
      .update({
        next_run_date: formatDateInput(nextRunDate),
      })
      .eq("id", entry.id);

    if (updateError) {
      setRecurringFeedback(
        getFriendlySupabaseError(updateError, "A scheduled entry ran, but its next due date could not be updated."),
        "error"
      );
    }
  }

  return generatedCount;
}

function renderApp() {
  if (els.currentUsername) {
    els.currentUsername.textContent = appState.currentProfile?.username || appState.currentUser?.email || "";
  }

  renderGoalAllocationOptions();
  renderHome();
  renderTransactions();
  renderRecurringEntries();
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

  renderHeroStatus(homeTransactions, summary);

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
  renderPieChart(homeTransactions);
  renderBudgetProgress(summary);
  renderSparkline(homeTransactions);
  renderUpcomingPayments();
}
function renderPieChart(transactions) {
  const canvas = document.getElementById("hero-pie-chart");
  const legend = document.getElementById("pie-legend");
  if (!canvas || !legend) return;

  const ctx = canvas.getContext("2d");
  
  const categories = {};
  transactions.forEach(t => {
    const cat = t.category || (t.type === 'income' ? 'salary' : 'shopping');
    categories[cat] = (categories[cat] || 0) + Math.abs(t.amount);
  });

  const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
  if (total === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    legend.innerHTML = '<div class="upcoming-empty">No data to display</div>';
    return;
  }

  // Handle high DPI displays for crisp rendering
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0) {
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  } else {
    // Fallback if not yet visible
    canvas.width = 140 * dpr;
    canvas.height = 140 * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = '140px';
    canvas.style.height = '140px';
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let startAngle = -0.5 * Math.PI;
  const colors = {
    food: "#f97316",
    bills: "#0f766e",
    transport: "#2563eb",
    shopping: "#db2777",
    salary: "#16a34a"
  };

  const labels = {
    food: "Food",
    bills: "Bills",
    transport: "Transport",
    shopping: "Shopping",
    salary: "Salary"
  };

  legend.innerHTML = "";
  
  const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const centerX = 140 / 2;
  const centerY = 140 / 2;
  const radius = 140 / 2;

  sortedCategories.forEach(([cat, val]) => {
    const sliceAngle = (val / total) * 2 * Math.PI;
    const color = colors[cat] || "#64748b";
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    
    startAngle += sliceAngle;
    
    const percent = Math.round((val / total) * 100);
    legend.innerHTML += `
      <div class="pie-legend-row">
        <div class="pie-legend-left">
          <span class="pie-legend-dot" style="background: ${color}"></span>
          ${labels[cat] || cat}
        </div>
        <div>${percent}%</div>
      </div>
    `;
  });
}

function renderBudgetProgress(summary) {
  const fillEl = document.getElementById("budget-progress-fill");
  const textEl = document.getElementById("budget-text");
  if (!fillEl || !textEl) return;

  const currency = appState.currentProfile?.default_currency || "GBP";
  const income = summary.incomeTotals[currency] || 0;
  const expense = summary.expenseTotals[currency] || 0;

  const budgetLimit = income > 0 ? income : 1000;
  
  let percentage = (expense / budgetLimit) * 100;
  const visualPercentage = Math.min(percentage, 100);
  
  fillEl.style.width = `${visualPercentage}%`;
  
  fillEl.classList.remove("warning", "danger");
  if (percentage >= 100) {
    fillEl.classList.add("danger");
  } else if (percentage >= 75) {
    fillEl.classList.add("warning");
  }
  
  textEl.textContent = `${formatSingleCurrency(expense, currency)} / ${formatSingleCurrency(budgetLimit, currency)} spent`;
}

function renderUpcomingPayments() {
  if (!els.upcomingList) return;

  const upcoming = appState.recurringEntries
    .filter(entry => {
      const nextRunDate = parseDateInput(entry.next_run_date);
      const endDate = entry.end_date ? parseDateInput(entry.end_date) : null;
      if (endDate && nextRunDate > endDate) return false;
      return true;
    })
    .sort((a, b) => new Date(a.next_run_date) - new Date(b.next_run_date))
    .slice(0, 4);

  if (!upcoming.length) {
    els.upcomingList.innerHTML = `<div class="upcoming-empty">No upcoming payments scheduled.</div>`;
    return;
  }

  els.upcomingList.innerHTML = upcoming.map(entry => {
    const isIncome = entry.type === "income";
    return `
      <div class="upcoming-item">
        <div class="upcoming-info">
          <span class="upcoming-note">${escapeHtml(entry.note)}</span>
          <span class="upcoming-date">${formatDate(entry.next_run_date)}</span>
        </div>
        <span class="upcoming-amount ${isIncome ? 'income' : 'expense'}">
          ${isIncome ? '+' : '-'}${formatSingleCurrency(entry.amount, entry.currency)}
        </span>
      </div>
    `;
  }).join("");
}

function renderSparkline(transactions) {
  const canvas = document.getElementById("budget-sparkline");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const expenses = transactions.filter(t => t.type === "expense");
  
  if (expenses.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const daily = {};
  expenses.forEach(t => {
    const date = t.date;
    daily[date] = (daily[date] || 0) + Math.abs(t.amount);
  });

  const sortedDates = Object.keys(daily).sort();
  const values = sortedDates.map(d => daily[d]);
  
  if (values.length < 2) {
    values.unshift(0); 
  }

  const maxVal = Math.max(...values, 1);

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  
  const width = rect.width > 0 ? rect.width : 400;
  const height = rect.height > 0 ? rect.height : 60;

  if (rect.width > 0) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  }

  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();
  const stepX = width / (values.length - 1);
  
  values.forEach((val, i) => {
    const x = i * stepX;
    const y = height - ((val / maxVal) * height * 0.8) - (height * 0.1);
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.strokeStyle = "#16a34a"; // Green
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(22, 163, 74, 0.2)");
  gradient.addColorStop(1, "rgba(22, 163, 74, 0)");
  ctx.fillStyle = gradient;
  ctx.fill();
}

function renderHeroStatus(transactions, summary) {
  const heroStatus = document.getElementById("hero-status");
  if (!heroStatus) return;

  const balanceEntries = Object.entries(summary.balanceTotals);
  const singleBalance = balanceEntries.length === 1 ? balanceEntries[0][1] : null;
  const singleCurrency = balanceEntries.length === 1 ? balanceEntries[0][0] : null;

  let messageHtml = "";
  if (!transactions.length) {
    messageHtml = `<p class="hero-status-msg muted">Add your first transaction to get started.</p>`;
  } else if (singleBalance !== null) {
    if (singleBalance > 0) {
      messageHtml = `<p class="hero-status-msg positive">You're ${formatSingleCurrency(singleBalance, singleCurrency)} up this period. Keep it going.</p>`;
    } else if (singleBalance < 0) {
      messageHtml = `<p class="hero-status-msg negative">You're ${formatSingleCurrency(Math.abs(singleBalance), singleCurrency)} down this period. Time to cut back.</p>`;
    } else {
      messageHtml = `<p class="hero-status-msg muted">You're breaking even this period.</p>`;
    }
  }

  const categoryTotals = {};
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const cat = t.category || "other";
      const cur = normalizeCurrency(t.currency);
      if (!categoryTotals[cat]) categoryTotals[cat] = {};
      categoryTotals[cat][cur] = (categoryTotals[cat][cur] || 0) + Number(t.amount);
    });

  const pillsHtml = Object.entries(categoryTotals)
    .map(([cat, totals]) => {
      const display = Object.entries(totals)
        .map(([cur, amt]) => formatSingleCurrency(amt, cur))
        .join(" + ");
      return `<span class="badge ${cat}">${cat} ${display}</span>`;
    })
    .join("");

  heroStatus.innerHTML = `
    ${messageHtml}
    ${pillsHtml ? `<div class="hero-status-pills">${pillsHtml}</div>` : ""}
  `;
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

function renderRecurringEntries() {
  if (!els.recurringList) {
    return;
  }

  if (!appState.recurringEntries.length) {
    els.recurringList.innerHTML = emptyStateMarkup(
      "No scheduled items yet",
      "Create a recurring salary, rent, bill, or subscription so BudgetMate can add it automatically on the due date."
    );
    return;
  }

  els.recurringList.innerHTML = appState.recurringEntries
    .map((entry) => {
      const nextRunDate = parseDateInput(entry.next_run_date);
      const endDate = entry.end_date ? parseDateInput(entry.end_date) : null;
      const isCompleted = endDate && nextRunDate > endDate;

      return `
        <article class="recurring-card">
          <div class="recurring-head">
            <div>
              <div class="recurring-badges">
                <span class="badge ${entry.category || "other"}">${escapeHtml(entry.category || "other")}</span>
                <span class="recurring-frequency">${escapeHtml(recurringFrequencyLabel(entry.frequency))}</span>
              </div>
              <h3 class="goal-title">${escapeHtml(entry.note)}</h3>
              <p class="goal-deadline">
                ${capitalize(entry.type)} • Next due ${formatDate(entry.next_run_date)}
                ${entry.end_date ? ` • Ends ${formatDate(entry.end_date)}` : " • No end date"}
              </p>
            </div>
            <button class="delete-btn" type="button" data-delete-recurring-id="${entry.id}">Delete</button>
          </div>

          <div class="recurring-metrics">
            <div class="goal-metric">
              <span class="summary-label">Amount</span>
              <strong>${formatSingleCurrency(Number(entry.amount), normalizeCurrency(entry.currency))}</strong>
            </div>
            <div class="goal-metric">
              <span class="summary-label">Repeats</span>
              <strong>${escapeHtml(recurringFrequencyLabel(entry.frequency))}</strong>
            </div>
            <div class="goal-metric">
              <span class="summary-label">Status</span>
              <strong class="${isCompleted ? "recurring-complete" : ""}">${isCompleted ? "Completed" : "Active"}</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-delete-recurring-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleDeleteRecurringEntry(button.dataset.deleteRecurringId);
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

function updateQuickTypeButtons() {
  els.quickTypeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.quickType === appState.currentQuickType);
  });
}

function updateRecurringTypeButtons() {
  els.recurringTypeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.recurringType === appState.currentRecurringType);
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
  const scheduledNote = transaction.recurring_source_id ? " • Scheduled" : "";

  return `
    <article class="transaction-item">
      <div class="transaction-main">
        <span class="badge ${safeCategory}">${safeCategory}</span>
        <div class="transaction-copy">
          <p class="transaction-note">${escapeHtml(transaction.note)}</p>
          <p class="transaction-meta">${formatDate(transaction.date)} • ${capitalize(transaction.type)} • ${currency}${scheduledNote}${allocationNote}</p>
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

function recurringFrequencyLabel(frequency) {
  switch (frequency) {
    case "weekly":
      return "Every week";
    case "yearly":
      return "Every year";
    default:
      return "Every month";
  }
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addRecurringInterval(date, frequency) {
  const next = new Date(date);

  if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (frequency === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
    return next;
  }

  next.setMonth(next.getMonth() + 1);
  return next;
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
