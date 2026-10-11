// ═══════════════════════════════════════════════════════════
// FLOW KANBAN — MULTI-USER CLIENT APP LOGIC
// ═══════════════════════════════════════════════════════════

(function() {
  'use strict';

  // State
  const state = {
    tasks: [],
    searchQuery: '',
    priorityFilter: 'all',
    isAuthenticated: false,
    currentUser: null, // { id: string, username: string }
    authMode: 'login', // 'login' | 'signup'
    draggedTaskId: null,
  };

  // DOM Cache
  const elements = {
    appContainer: document.getElementById('app-container'),
    landingView: document.getElementById('landing-view'),

    // Landing Page Elements
    landingHeader: document.querySelector('.landing-header'),
    landingThemeToggle: document.getElementById('landing-theme-toggle'),
    landingThemeIcon: document.querySelector('.landing-theme-icon'),
    landingLoginBtn: document.getElementById('landing-login-btn'),
    landingSignupBtn: document.getElementById('landing-signup-btn'),
    heroSignupBtn: document.getElementById('hero-signup-btn'),
    heroLoginBtn: document.getElementById('hero-login-btn'),

    // Auth Modal
    authModal: document.getElementById('auth-modal'),
    authCloseBtn: document.getElementById('auth-close-btn'),
    tabLoginBtn: document.getElementById('tab-login-btn'),
    tabSignupBtn: document.getElementById('tab-signup-btn'),
    authModalTitle: document.getElementById('auth-modal-title'),
    authModalSubtitle: document.getElementById('auth-modal-subtitle'),
    authForm: document.getElementById('auth-form'),
    authUsername: document.getElementById('auth-username'),
    authPassword: document.getElementById('auth-password'),
    authConfirmGroup: document.getElementById('auth-confirm-group'),
    authConfirmPassword: document.getElementById('auth-confirm-password'),
    toggleAuthPw: document.getElementById('toggle-auth-pw'),
    authError: document.getElementById('auth-error'),
    authSubmitBtn: document.getElementById('auth-submit-btn'),
    authSubmitText: document.getElementById('auth-submit-text'),
    authTogglePrompt: document.getElementById('auth-toggle-prompt'),
    authToggleBtn: document.getElementById('auth-toggle-btn'),

    // Modals
    taskModal: document.getElementById('task-modal'),
    taskForm: document.getElementById('task-form'),
    taskId: document.getElementById('task-id'),
    taskTitle: document.getElementById('task-title'),
    taskDesc: document.getElementById('task-desc'),
    taskStatus: document.getElementById('task-status'),
    taskPriority: document.getElementById('task-priority'),
    taskDueDate: document.getElementById('task-due-date'),
    modalTaskHeading: document.getElementById('modal-task-heading'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    cancelTaskBtn: document.getElementById('cancel-task-btn'),

    settingsModal: document.getElementById('settings-modal'),
    passwordForm: document.getElementById('password-form'),
    currentPassword: document.getElementById('current-password'),
    newPassword: document.getElementById('new-password'),
    confirmPassword: document.getElementById('confirm-password'),
    passwordError: document.getElementById('password-error'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
    cancelPasswordBtn: document.getElementById('cancel-password-btn'),

    // Topbar Controls
    newTaskBtn: document.getElementById('new-task-btn'),
    accountBtn: document.getElementById('account-btn'),
    accountUsernameLabel: document.getElementById('account-username-label'),
    accountDropdown: document.getElementById('account-dropdown'),
    dropdownUsername: document.getElementById('dropdown-username'),
    copyAutologinBtn: document.getElementById('copy-autologin-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    themeIcon: document.getElementById('theme-icon'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    priorityFilter: document.getElementById('priority-filter'),

    // Columns
    cardsTodo: document.getElementById('cards-todo'),
    cardsInProgress: document.getElementById('cards-in_progress'),
    cardsDone: document.getElementById('cards-done'),

    // Column Count Badges
    countTodo: document.getElementById('count-todo'),
    countInProgress: document.getElementById('count-in_progress'),
    countDone: document.getElementById('count-done'),

    // Stat Cards Metrics
    statTotalCount: document.getElementById('stat-total-count'),
    statTodoCount: document.getElementById('stat-todo-count'),
    statProgCount: document.getElementById('stat-prog-count'),
    statDoneCount: document.getElementById('stat-done-count'),
    progressBarFill: document.getElementById('progress-bar-fill'),
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Auto-Login: Extract and store ?key= parameter if opened via auto-login link
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const urlKey = urlParams.get('key');
    if (urlKey) {
      localStorage.setItem('todo_device_key', urlKey.trim());
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (e) {}

  // --- API Client ---
  async function api(endpoint, options = {}) {
    const deviceKey = localStorage.getItem('todo_device_key') || '';
    const res = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': deviceKey,
        ...(options.headers || {})
      },
      ...options
    });

    if (res.status === 401) {
      showLanding();
      throw new Error('Unauthorized');
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  // --- Theme Management ---
  function initTheme() {
    const saved = localStorage.getItem('task_kanban_theme') || 'dark';
    setTheme(saved);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('task_kanban_theme', theme);
    const icon = theme === 'dark' ? '☀️' : '🌙';
    if (elements.themeIcon) elements.themeIcon.textContent = icon;
    if (elements.landingThemeIcon) elements.landingThemeIcon.textContent = icon;
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = current === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  }

  if (elements.themeToggleBtn) elements.themeToggleBtn.addEventListener('click', toggleTheme);
  if (elements.landingThemeToggle) elements.landingThemeToggle.addEventListener('click', toggleTheme);

  // --- Auth View & Modal Logic ---

  function showLanding() {
    state.isAuthenticated = false;
    state.currentUser = null;
    elements.appContainer.classList.add('hidden');
    elements.landingView.classList.remove('hidden');
    closeAuthModal();
  }

  function setAuthenticated(user) {
    state.isAuthenticated = true;
    state.currentUser = user;
    if (user && user.username) {
      if (elements.accountUsernameLabel) elements.accountUsernameLabel.textContent = `@${user.username}`;
      if (elements.dropdownUsername) elements.dropdownUsername.textContent = `@${user.username}`;
    }
    elements.landingView.classList.add('hidden');
    elements.appContainer.classList.remove('hidden');
    closeAuthModal();
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    elements.authError.classList.add('hidden');
    elements.authError.textContent = '';

    if (mode === 'signup') {
      elements.tabSignupBtn.classList.add('active');
      elements.tabLoginBtn.classList.remove('active');
      elements.authModalTitle.textContent = 'Create Your Free Board';
      elements.authModalSubtitle.textContent = 'Choose a username and password to start organizing tasks.';
      elements.authConfirmGroup.classList.remove('hidden');
      elements.authConfirmPassword.setAttribute('required', 'required');
      elements.authSubmitText.textContent = 'Create My Board →';
      elements.authTogglePrompt.textContent = 'Already have an account?';
      elements.authToggleBtn.textContent = 'Sign in here';
    } else {
      elements.tabLoginBtn.classList.add('active');
      elements.tabSignupBtn.classList.remove('active');
      elements.authModalTitle.textContent = 'Sign In to Workspace';
      elements.authModalSubtitle.textContent = 'Enter your credentials to access your Kanban board.';
      elements.authConfirmGroup.classList.add('hidden');
      elements.authConfirmPassword.removeAttribute('required');
      elements.authConfirmPassword.value = '';
      elements.authSubmitText.textContent = 'Log In →';
      elements.authTogglePrompt.textContent = "Don't have an account?";
      elements.authToggleBtn.textContent = 'Create one here';
    }
  }

  function openAuthModal(mode = 'login') {
    setAuthMode(mode);
    elements.authUsername.value = '';
    elements.authPassword.value = '';
    elements.authConfirmPassword.value = '';
    elements.authModal.classList.add('active');
    elements.authUsername.focus();
  }

  function closeAuthModal() {
    elements.authModal.classList.remove('active');
  }

  // Landing Page Buttons
  if (elements.landingLoginBtn) elements.landingLoginBtn.addEventListener('click', () => openAuthModal('login'));
  if (elements.landingSignupBtn) elements.landingSignupBtn.addEventListener('click', () => openAuthModal('signup'));
  if (elements.heroLoginBtn) elements.heroLoginBtn.addEventListener('click', () => openAuthModal('login'));
  if (elements.heroSignupBtn) elements.heroSignupBtn.addEventListener('click', () => openAuthModal('signup'));

  // Auth Modal Controls
  if (elements.tabLoginBtn) elements.tabLoginBtn.addEventListener('click', () => setAuthMode('login'));
  if (elements.tabSignupBtn) elements.tabSignupBtn.addEventListener('click', () => setAuthMode('signup'));
  if (elements.authToggleBtn) elements.authToggleBtn.addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'signup' : 'login'));
  if (elements.authCloseBtn) elements.authCloseBtn.addEventListener('click', closeAuthModal);

  // Password visibility toggle in Auth modal
  if (elements.toggleAuthPw) {
    elements.toggleAuthPw.addEventListener('click', () => {
      const isPw = elements.authPassword.type === 'password';
      elements.authPassword.type = isPw ? 'text' : 'password';
      elements.toggleAuthPw.textContent = isPw ? '🔒' : '👁️';
    });
  }

  // Auth Form Submit (Login or Sign Up)
  elements.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = elements.authUsername.value.trim();
    const password = elements.authPassword.value;
    const confirmPassword = elements.authConfirmPassword.value;

    elements.authError.classList.add('hidden');
    elements.authError.textContent = '';

    if (!username) {
      elements.authError.textContent = 'Please enter a username.';
      elements.authError.classList.remove('hidden');
      elements.authUsername.focus();
      return;
    }

    if (!password) {
      elements.authError.textContent = 'Please enter a password.';
      elements.authError.classList.remove('hidden');
      elements.authPassword.focus();
      return;
    }

    if (state.authMode === 'signup') {
      if (password.length < 6) {
        elements.authError.textContent = 'Password must be at least 6 characters long.';
        elements.authError.classList.remove('hidden');
        elements.authPassword.focus();
        return;
      }
      if (password !== confirmPassword) {
        elements.authError.textContent = 'Passwords do not match.';
        elements.authError.classList.remove('hidden');
        elements.authConfirmPassword.focus();
        return;
      }
    }

    const endpoint = state.authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        elements.authError.textContent = data.error || 'Authentication failed';
        elements.authError.classList.remove('hidden');
        elements.authModal.querySelector('.auth-modal-card').classList.add('shake');
        setTimeout(() => {
          elements.authModal.querySelector('.auth-modal-card').classList.remove('shake');
        }, 400);
        return;
      }

      // Store personal deviceKey for permanent auto-login
      if (data.deviceKey) {
        localStorage.setItem('todo_device_key', data.deviceKey);
      }

      setAuthenticated(data.user);
      if (typeof showToast === 'function') {
        const msg = state.authMode === 'signup'
          ? `Welcome to Flow Kanban, @${data.user.username}! Your board is ready.`
          : `Device authorized! Welcome back, @${data.user.username}!`;
        showToast(msg, 'success');
      }
      loadTasks();
    } catch (err) {
      elements.authError.textContent = err.message || 'Network error';
      elements.authError.classList.remove('hidden');
    }
  });

  // Check Auth & Auto-Login on Initial Load
  async function checkAuth() {
    const deviceKey = localStorage.getItem('todo_device_key') || '';
    try {
      const res = await fetch('/api/auth/check', {
        headers: {
          'X-Device-Key': deviceKey
        }
      });
      const data = await res.json();
      if (data.authenticated && data.user) {
        if (data.deviceKey) {
          localStorage.setItem('todo_device_key', data.deviceKey);
        }
        setAuthenticated(data.user);
        loadTasks();
      } else {
        showLanding();
      }
    } catch (err) {
      showLanding();
    }
  }

  // Account Dropdown Toggle
  elements.accountBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = elements.accountDropdown.classList.contains('hidden');
    elements.accountDropdown.classList.toggle('hidden', !isHidden);
    elements.accountBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!elements.accountMenuWrapper) return;
    if (!elements.accountMenuWrapper.contains(e.target)) {
      elements.accountDropdown.classList.add('hidden');
      elements.accountBtn.setAttribute('aria-expanded', 'false');
    }
  });

  elements.accountMenuWrapper = document.querySelector('.account-menu-wrapper');

  // Copy Auto-Login Link for Other Personal Devices
  if (elements.copyAutologinBtn) {
    elements.copyAutologinBtn.addEventListener('click', async () => {
      if (elements.accountDropdown) elements.accountDropdown.classList.add('hidden');
      let key = localStorage.getItem('todo_device_key');
      if (!key) {
        try {
          const res = await api('/api/auth/device-key');
          if (res.deviceKey) {
            key = res.deviceKey;
            localStorage.setItem('todo_device_key', key);
          }
        } catch (e) {}
      }

      if (key) {
        const link = `${window.location.origin}/?key=${encodeURIComponent(key)}`;
        try {
          await navigator.clipboard.writeText(link);
          if (typeof showToast === 'function') {
            showToast(`Auto-login link copied for @${state.currentUser?.username || 'user'}! Open once on your phone to login permanently.`, 'success', 5500);
          }
        } catch (err) {
          prompt('Copy this link to auto-login on any personal device:', link);
        }
      } else {
        if (typeof showToast === 'function') {
          showToast('Device key not found. Please log in again to generate one.', 'warning');
        }
      }
    });
  }

  // Logout
  elements.logoutBtn.addEventListener('click', () => {
    if (elements.accountDropdown) elements.accountDropdown.classList.add('hidden');
    const username = state.currentUser?.username || 'your';
    confirmAction(
      `Are you sure you want to log out of @${username}'s workspace? (This will remove auto-login from this browser)`,
      async () => {
        try {
          localStorage.removeItem('todo_device_key');
          await fetch('/api/auth/logout', { method: 'POST' });
          if (typeof showToast === 'function') {
            showToast('Logged out securely.', 'info');
          }
          showLanding();
        } catch (err) {
          showLanding();
        }
      },
      'Log Out',
      'Confirm Logout'
    );
  });

  // Change Password Modal
  elements.settingsBtn.addEventListener('click', () => {
    if (elements.accountDropdown) elements.accountDropdown.classList.add('hidden');
    elements.currentPassword.value = '';
    elements.newPassword.value = '';
    elements.confirmPassword.value = '';
    elements.passwordError.classList.add('hidden');
    elements.settingsModal.classList.add('active');
    elements.currentPassword.focus();
  });

  elements.settingsCloseBtn.addEventListener('click', () => {
    elements.settingsModal.classList.remove('active');
  });

  elements.cancelPasswordBtn.addEventListener('click', () => {
    elements.settingsModal.classList.remove('active');
  });

  elements.passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = elements.currentPassword.value;
    const newPassword = elements.newPassword.value;
    const confirmPassword = elements.confirmPassword.value;

    elements.passwordError.classList.add('hidden');

    if (newPassword.length < 6) {
      elements.passwordError.textContent = 'New password must be at least 6 characters long.';
      elements.passwordError.classList.remove('hidden');
      return;
    }

    if (newPassword !== confirmPassword) {
      elements.passwordError.textContent = 'New passwords do not match.';
      elements.passwordError.classList.remove('hidden');
      return;
    }

    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      // Clear local device key so current device re-authenticates with new password
      localStorage.removeItem('todo_device_key');
      elements.settingsModal.classList.remove('active');
      showLanding();
      openAuthModal('login');
      if (typeof showToast === 'function') {
        showToast('Password changed! All devices have been logged out. Please sign in with your new password.', 'info', 6000);
      }
    } catch (err) {
      elements.passwordError.textContent = err.message;
      elements.passwordError.classList.remove('hidden');
    }
  });

  // --- Tasks CRUD ---

  async function loadTasks() {
    try {
      const data = await api('/api/tasks');
      state.tasks = data.tasks || [];
      if (data.username && elements.accountUsernameLabel) {
        elements.accountUsernameLabel.textContent = `@${data.username}`;
        elements.dropdownUsername.textContent = `@${data.username}`;
      }
      renderBoard();
    } catch (err) {
      if (err.message !== 'Unauthorized' && typeof showToast === 'function') {
        showToast('Error loading tasks: ' + err.message, 'error');
      }
    }
  }

  // Create or Edit Task Form Submit
  elements.taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = elements.taskId.value;
    const title = elements.taskTitle.value.trim();
    const description = elements.taskDesc.value.trim();
    const status = elements.taskStatus.value;
    const priority = elements.taskPriority.value;
    const due_date = elements.taskDueDate.value;

    if (!title) {
      if (typeof showToast === 'function') showToast('Please enter a task title.', 'warning');
      elements.taskTitle.focus();
      return;
    }

    try {
      if (id) {
        // Edit existing
        const res = await api(`/api/tasks/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ title, description, status, priority, due_date })
        });
        const idx = state.tasks.findIndex(t => t.id === id);
        if (idx !== -1) state.tasks[idx] = res.task;
        if (typeof showToast === 'function') showToast('Task updated successfully!', 'success');
      } else {
        // Create new
        const res = await api('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({ title, description, status, priority, due_date })
        });
        state.tasks.unshift(res.task);
        if (typeof showToast === 'function') showToast('New task added to board!', 'success');
      }

      closeTaskModal();
      renderBoard();
    } catch (err) {
      if (typeof showToast === 'function') showToast('Failed to save task: ' + err.message, 'error');
    }
  });

  function openTaskModal(task = null, defaultStatus = 'todo') {
    if (task) {
      elements.modalTaskHeading.textContent = 'Edit Task';
      elements.taskId.value = task.id;
      elements.taskTitle.value = task.title;
      elements.taskDesc.value = task.description || '';
      elements.taskStatus.value = task.status;
      elements.taskPriority.value = task.priority;
      elements.taskDueDate.value = task.due_date || '';
    } else {
      elements.modalTaskHeading.textContent = 'Add New Task';
      elements.taskForm.reset();
      elements.taskId.value = '';
      elements.taskStatus.value = defaultStatus;
      elements.taskPriority.value = 'medium';
      elements.taskDueDate.value = '';
    }
    elements.taskModal.classList.add('active');
    elements.taskTitle.focus();
  }

  function closeTaskModal() {
    elements.taskModal.classList.remove('active');
  }

  elements.newTaskBtn.addEventListener('click', () => openTaskModal(null, 'todo'));
  elements.modalCloseBtn.addEventListener('click', closeTaskModal);
  elements.cancelTaskBtn.addEventListener('click', closeTaskModal);

  // Quick add button in column headers
  document.querySelectorAll('.column-quick-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const colStatus = e.currentTarget.getAttribute('data-status');
      openTaskModal(null, colStatus);
    });
  });

  // Delete task with custom modal popup
  function deleteTask(id) {
    const task = state.tasks.find(t => t.id === id);
    const taskTitle = task ? `"${task.title}"` : 'this task';

    confirmAction(
      `Are you sure you want to delete ${escapeHtml(taskTitle)}? This action cannot be undone.`,
      async () => {
        try {
          await api(`/api/tasks/${id}`, { method: 'DELETE' });
          state.tasks = state.tasks.filter(t => t.id !== id);
          renderBoard();
          if (typeof showToast === 'function') showToast('Task deleted successfully.', 'info');
        } catch (err) {
          if (typeof showToast === 'function') showToast('Failed to delete task: ' + err.message, 'error');
        }
      },
      'Delete Task',
      'Confirm Delete'
    );
  }

  // Status Update (Drag & Drop or Move Buttons)
  async function updateTaskStatus(id, newStatus) {
    const task = state.tasks.find(t => t.id === id);
    if (!task || task.status === newStatus) return;

    const oldStatus = task.status;
    task.status = newStatus;
    renderBoard(); // Optimistic update

    try {
      await api(`/api/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      if (typeof showToast === 'function') {
        showToast(`Moved to ${formatStatusName(newStatus)}`, 'info');
      }
    } catch (err) {
      task.status = oldStatus;
      renderBoard();
      if (typeof showToast === 'function') showToast('Error updating status: ' + err.message, 'error');
    }
  }

  function formatStatusName(status) {
    if (status === 'todo') return 'To Do';
    if (status === 'in_progress') return 'In Progress';
    if (status === 'done') return 'Completed';
    return status;
  }

  // Search & Filter
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    elements.clearSearchBtn.classList.toggle('hidden', state.searchQuery === '');
    renderBoard();
  });

  elements.clearSearchBtn.addEventListener('click', () => {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.clearSearchBtn.classList.add('hidden');
    renderBoard();
    elements.searchInput.focus();
  });

  elements.priorityFilter.addEventListener('change', (e) => {
    state.priorityFilter = e.target.value;
    renderBoard();
  });

  // --- Rendering ---
  function renderBoard() {
    const filteredTasks = state.tasks.filter(task => {
      if (state.priorityFilter !== 'all' && task.priority !== state.priorityFilter) {
        return false;
      }
      if (state.searchQuery) {
        const titleMatch = task.title.toLowerCase().includes(state.searchQuery);
        const descMatch = (task.description || '').toLowerCase().includes(state.searchQuery);
        return titleMatch || descMatch;
      }
      return true;
    });

    const tasksByCol = {
      todo: [],
      in_progress: [],
      done: []
    };

    filteredTasks.forEach(task => {
      if (tasksByCol[task.status]) {
        tasksByCol[task.status].push(task);
      } else {
        tasksByCol.todo.push(task);
      }
    });

    // Populate columns
    renderColumn(elements.cardsTodo, tasksByCol.todo, 'todo');
    renderColumn(elements.cardsInProgress, tasksByCol.in_progress, 'in_progress');
    renderColumn(elements.cardsDone, tasksByCol.done, 'done');

    // Column badges
    elements.countTodo.textContent = tasksByCol.todo.length;
    elements.countInProgress.textContent = tasksByCol.in_progress.length;
    elements.countDone.textContent = tasksByCol.done.length;

    // Stat Cards Metrics
    const totalCount = state.tasks.length;
    const todoCount = state.tasks.filter(t => t.status === 'todo').length;
    const progCount = state.tasks.filter(t => t.status === 'in_progress').length;
    const doneCount = state.tasks.filter(t => t.status === 'done').length;

    if (elements.statTotalCount) elements.statTotalCount.textContent = totalCount;
    if (elements.statTodoCount) elements.statTodoCount.textContent = todoCount;
    if (elements.statProgCount) elements.statProgCount.textContent = progCount;
    if (elements.statDoneCount) elements.statDoneCount.textContent = doneCount;

    // Progress bar
    const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
    if (elements.progressBarFill) elements.progressBarFill.style.width = `${percent}%`;
  }

  function renderColumn(container, tasks, columnStatus) {
    container.innerHTML = '';

    if (tasks.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'empty-column';
      let msg = 'No tasks in this column';
      if (state.searchQuery || state.priorityFilter !== 'all') {
        msg = 'No matching tasks';
      }
      placeholder.innerHTML = `<div style="font-size:1.5rem; margin-bottom:4px; opacity:0.6;">📭</div><div>${msg}</div>`;
      container.appendChild(placeholder);
      return;
    }

    tasks.forEach(task => {
      const card = createTaskCardElement(task);
      container.appendChild(card);
    });
  }

  function createTaskCardElement(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.setAttribute('draggable', 'true');
    card.setAttribute('data-id', task.id);

    // Priority badge helper
    let priorityBadge = '';
    if (task.priority === 'high') {
      priorityBadge = `<span class="task-badge badge-high">🔥 High</span>`;
    } else if (task.priority === 'medium') {
      priorityBadge = `<span class="task-badge badge-medium">⚡ Med</span>`;
    } else {
      priorityBadge = `<span class="task-badge badge-low">🌿 Low</span>`;
    }

    // Due date badge
    let dueBadge = '';
    if (task.due_date) {
      dueBadge = `<span class="task-due-date">📅 ${escapeHtml(task.due_date)}</span>`;
    }

    // Move status shift buttons
    let shiftButtons = '';
    if (task.status === 'todo') {
      shiftButtons = `<button class="btn-shift btn-shift-progress" data-target="in_progress" title="Move to In Progress"><span>In Progress</span> <span class="shift-arrow">→</span></button>`;
    } else if (task.status === 'in_progress') {
      shiftButtons = `
        <button class="btn-shift btn-shift-back" data-target="todo" title="Move back to To Do"><span class="shift-arrow">←</span> <span>To Do</span></button>
        <button class="btn-shift btn-shift-done" data-target="done" title="Mark as Completed"><span class="shift-check">✓</span> <span>Done</span></button>
      `;
    } else if (task.status === 'done') {
      shiftButtons = `<button class="btn-shift btn-shift-reopen" data-target="in_progress" title="Reopen task to In Progress"><span class="shift-arrow">↺</span> <span>Reopen</span></button>`;
    }

    card.innerHTML = `
      <div class="task-card-header">
        <h4 class="task-card-title">${escapeHtml(task.title)}</h4>
        <div class="task-card-actions">
          <button class="card-btn card-btn-edit" title="Edit task" aria-label="Edit task">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="card-btn card-btn-delete" title="Delete task" aria-label="Delete task">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>
      ${task.description ? `<p class="task-card-desc">${escapeHtml(task.description)}</p>` : ''}
      <div class="task-card-footer">
        <div class="task-card-meta">
          ${priorityBadge}
          ${dueBadge}
        </div>
        <div class="task-card-shift-actions">
          ${shiftButtons}
        </div>
      </div>
    `;

    // Drag Events
    card.addEventListener('dragstart', (e) => {
      state.draggedTaskId = task.id;
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', task.id);
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      state.draggedTaskId = null;
      document.querySelectorAll('.kanban-dropzone').forEach(dz => dz.classList.remove('drag-over'));
    });

    // Edit button click
    card.querySelector('.card-btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openTaskModal(task);
    });

    // Delete button click
    card.querySelector('.card-btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTask(task.id);
    });

    // Shift button clicks
    card.querySelectorAll('.btn-shift').forEach(sBtn => {
      sBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget.getAttribute('data-target');
        updateTaskStatus(task.id, target);
      });
    });

    // Double click to edit
    card.addEventListener('dblclick', () => {
      openTaskModal(task);
    });

    return card;
  }

  // Dropzone Setup
  [elements.cardsTodo, elements.cardsInProgress, elements.cardsDone].forEach(dz => {
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      dz.classList.add('drag-over');
    });

    dz.addEventListener('dragleave', (e) => {
      if (!dz.contains(e.relatedTarget)) {
        dz.classList.remove('drag-over');
      }
    });

    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain') || state.draggedTaskId;
      const targetStatus = dz.getAttribute('data-status');
      if (taskId && targetStatus) {
        updateTaskStatus(taskId, targetStatus);
      }
    });
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

    if (e.key === 'Escape') {
      if (elements.authModal.classList.contains('active')) closeAuthModal();
      if (elements.taskModal.classList.contains('active')) closeTaskModal();
      if (elements.settingsModal.classList.contains('active')) elements.settingsModal.classList.remove('active');
    }

    if (state.isAuthenticated && !isInput) {
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openTaskModal(null, 'todo');
      } else if (e.key === '/') {
        e.preventDefault();
        elements.searchInput.focus();
      }
    }
  });

  // Initialize
  initTheme();
  checkAuth();
})();
