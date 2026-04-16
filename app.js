const STORAGE_KEY = "spendwise-transactions";

const appState = {
  transactions: [],
  currentPage: "home",
  currentFilter: "all",
  currentType: "expense",
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  loadTransactions();
  setDefaultDate();
  updateTypeButtons();
  updateFilterButtons();
  showPage(getInitialPage());
  renderApp();
});

function cacheElements() {
  els.pages = document.querySelectorAll(".page");
  els.navLinks = document.querySelectorAll(".nav-link");
  els.summaryIncome = document.querySelector("[data-summary='income']");
  els.summaryExpense = document.querySelector("[data-summary='expense']");
  els.summaryBalance = document.querySelectorAll("[data-summary='balance']");
  els.previewList = document.getElementById("preview-list");
  els.form = document.getElementById("transaction-form");
  els.amountInput = document.getElementById("amount");
  els.noteInput = document.getElementById("note");
  els.categoryInput = document.getElementById("category");
  els.dateInput = document.getElementById("date");
  els.typeButtons = document.querySelectorAll("[data-type]");
  els.filterButtons = document.querySelectorAll("[data-filter]");
  els.transactionsList = document.getElementById("transactions-list");
  els.bestMonth = document.getElementById("best-month-card");
  els.highestSpend = document.getElementById("highest-spend-card");
  els.expenseChart = document.getElementById("expenses-chart");
  els.savingsChart = document.getElementById("savings-chart");
  els.monthlyList = document.getElementById("monthly-list");
}

function bindEvents() {
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
    });
  });

  els.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      appState.currentFilter = button.dataset.filter;
      updateFilterButtons();
      renderTransactions();
    });
  });

  if (els.form) {
    els.form.addEventListener("submit", handleAddTransaction);
  }

  window.addEventListener("hashchange", () => {
    showPage(getInitialPage());
  });
}

function getInitialPage() {
  const hash = window.location.hash.replace("#", "").trim();
  if (["home", "transactions", "monthly"].includes(hash)) {
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

function loadTransactions() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    appState.transactions = Array.isArray(stored) ? stored : [];
  } catch (error) {
    appState.transactions = [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.transactions));
}

function handleAddTransaction(event) {
  event.preventDefault();

  const amount = Number(els.amountInput.value);
  const note = els.noteInput.value.trim();
  const category = els.categoryInput.value;
  const date = els.dateInput.value || new Date().toISOString().split("T")[0];

  if (!amount || amount <= 0 || !note || !category || !date) {
    return;
  }

  const transaction = {
    id: crypto.randomUUID(),
    type: appState.currentType,
    amount,
    note,
    category,
    date,
  };

  appState.transactions = [transaction, ...appState.transactions];
  saveTransactions();
  renderApp();
  els.form.reset();
  appState.currentType = "expense";
  updateTypeButtons();
  setDefaultDate();
}

function handleDeleteTransaction(id) {
  appState.transactions = appState.transactions.filter((transaction) => transaction.id !== id);
  saveTransactions();
  renderApp();
}

function renderApp() {
  renderHome();
  renderTransactions();
  renderMonthly();
}

function renderHome() {
  const summary = getSummary(appState.transactions);
  els.summaryIncome.textContent = formatCurrency(summary.income);
  els.summaryExpense.textContent = formatCurrency(summary.expenses);
  els.summaryBalance.forEach((balanceEl) => {
    balanceEl.textContent = formatCurrency(summary.balance);
    balanceEl.classList.toggle("positive", summary.balance >= 0);
    balanceEl.classList.toggle("negative", summary.balance < 0);
  });

  const recent = [...appState.transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3);

  if (!recent.length) {
    els.previewList.innerHTML = emptyStateMarkup(
      "No transactions yet",
      "Add your first income or expense to see a quick preview here."
    );
    return;
  }

  els.previewList.innerHTML = recent.map((transaction) => transactionMarkup(transaction, false)).join("");
}

function renderTransactions() {
  const filtered = getFilteredTransactions();

  if (!filtered.length) {
    els.transactionsList.innerHTML = emptyStateMarkup(
      "Nothing to show yet",
      appState.transactions.length
        ? "Try a different filter to see more transactions."
        : "Your spending history will appear here once you add the first transaction."
    );
    return;
  }

  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
  els.transactionsList.innerHTML = sorted.map((transaction) => transactionMarkup(transaction, true)).join("");

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => {
      handleDeleteTransaction(button.dataset.deleteId);
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

function renderMonthly() {
  const monthlyGroups = groupTransactionsByMonth(appState.transactions);
  const months = Object.values(monthlyGroups);

  if (!months.length) {
    els.bestMonth.innerHTML = monthHighlightMarkup("Best savings month", "No data yet", "Add transactions to unlock monthly insights.");
    els.highestSpend.innerHTML = monthHighlightMarkup("Highest spend month", "No data yet", "Your largest spending month will appear here.");
    els.expenseChart.innerHTML = emptyStateMarkup("No expense chart yet", "Monthly expense bars appear as soon as you start tracking.");
    els.savingsChart.innerHTML = emptyStateMarkup("No savings chart yet", "Savings bars appear automatically when there is monthly data.");
    els.monthlyList.innerHTML = emptyStateMarkup("No monthly breakdown yet", "Add a few transactions and Spendwise will group everything by month.");
    return;
  }

  const bestSavingsMonth = months.reduce((best, current) => (current.savings > best.savings ? current : best), months[0]);
  const highestSpendMonth = months.reduce((top, current) => (current.expenses > top.expenses ? current : top), months[0]);

  els.bestMonth.innerHTML = monthHighlightMarkup(
    "Best savings month",
    bestSavingsMonth.label,
    `Saved ${formatCurrency(bestSavingsMonth.savings)}`
  );
  els.highestSpend.innerHTML = monthHighlightMarkup(
    "Highest spend month",
    highestSpendMonth.label,
    `Spent ${formatCurrency(highestSpendMonth.expenses)}`
  );

  els.expenseChart.innerHTML = chartMarkup(months, "expenses", "expense-bar");
  els.savingsChart.innerHTML = chartMarkup(months, "savings", "savings-bar");
  els.monthlyList.innerHTML = months
    .map(
      (month) => `
        <article class="month-summary">
          <h3 class="month-list-title">${month.label}</h3>
          <div class="month-summary-row"><span>Income</span><strong>${formatCurrency(month.income)}</strong></div>
          <div class="month-summary-row"><span>Expenses</span><strong>${formatCurrency(month.expenses)}</strong></div>
          <div class="month-summary-row"><span>Savings</span><strong>${formatCurrency(month.savings)}</strong></div>
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

function getSummary(transactions) {
  const income = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const expenses = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    income,
    expenses,
    balance: income - expenses,
  };
}

function groupTransactionsByMonth(transactions) {
  const grouped = {};

  [...transactions]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((transaction) => {
      const date = new Date(transaction.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!grouped[key]) {
        grouped[key] = {
          key,
          label: date.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
          income: 0,
          expenses: 0,
          savings: 0,
        };
      }

      if (transaction.type === "income") {
        grouped[key].income += transaction.amount;
      } else {
        grouped[key].expenses += transaction.amount;
      }

      grouped[key].savings = grouped[key].income - grouped[key].expenses;
    });

  return Object.fromEntries(
    Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  );
}

function transactionMarkup(transaction, showDeleteButton) {
  const signedAmount = `${transaction.type === "income" ? "+" : "-"}${formatCurrency(transaction.amount)}`;
  const safeCategory = transaction.category || "other";
  return `
    <article class="transaction-item">
      <div class="transaction-main">
        <span class="badge ${safeCategory}">${safeCategory}</span>
        <div class="transaction-copy">
          <p class="transaction-note">${escapeHtml(transaction.note)}</p>
          <p class="transaction-meta">${formatDate(transaction.date)} • ${capitalize(transaction.type)}</p>
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

function monthHighlightMarkup(label, title, copy) {
  return `
    <div class="month-card-label">${label}</div>
    <div class="month-card-value">${title}</div>
    <p class="section-copy">${copy}</p>
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
              <div class="bar-value">${formatCurrency(value)}</div>
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

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(amount);
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
