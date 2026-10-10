// ═══════════════════════════════════════════════════════════
// SSMS FLOW KANBAN — CLIENT APP LOGIC
// ═══════════════════════════════════════════════════════════

(function() {
  'use strict';

  // State
  const state = {
    tasks: [],
    searchQuery: '',
    priorityFilter: 'all',
    isAuthenticated: false,
    draggedTaskId: null,
  };

  // DOM Cache
  const elements = {
    appContainer: document.getElementById('app-container'),
    loginOverlay: document.getElementById('login-overlay'),
    loginForm: document.getElementById('login-form'),
    loginPassword: document.getElementById('login-password'),
    loginError: document.getElementById('login-error'),
    toggleLoginPw: document.getElementById('toggle-login-pw'),

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
    accountDropdown: document.getElementById('account-dropdown'),
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

  // --- API Client ---
  async function api(endpoint, options = {}) {
    const res = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    if (res.status === 401) {
      showLogin();
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
    if (elements.themeIcon) {
      elements.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
    });
  }

  // --- Auth Flow ---
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/check');
      const data = await res.json();
      if (data.authenticated) {
        setAuthenticated(true);
        loadTasks();
      } else {
        showLogin();
      }
    } catch (err) {
      showLogin();
    }
  }

  function showLogin() {
    state.isAuthenticated = false;
    elements.appContainer.classList.add('hidden');
    elements.loginOverlay.classList.remove('hidden');
    elements.loginPassword.value = '';
    elements.loginPassword.focus();
  }

  function setAuthenticated(isAuth) {
    state.isAuthenticated = isAuth;
    if (isAuth) {
      elements.loginOverlay.classList.add('hidden');
      elements.appContainer.classList.remove('hidden');
    } else {
      showLogin();
    }
  }

  // Login Submit
  elements.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = elements.loginPassword.value;
    elements.loginError.classList.add('hidden');
    elements.loginError.textContent = '';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();
      if (!res.ok) {
        elements.loginError.textContent = data.error || 'Login failed';
        elements.loginError.classList.remove('hidden');
        elements.loginOverlay.querySelector('.login-card').classList.add('shake');
        setTimeout(() => {
          elements.loginOverlay.querySelector('.login-card').classList.remove('shake');
        }, 400);
        return;
      }

      setAuthenticated(true);
      if (typeof showToast === 'function') {
        showToast('Welcome back! Tasks loaded.', 'success');
      }
      loadTasks();
    } catch (err) {
      elements.loginError.textContent = err.message || 'Network error';
      elements.loginError.classList.remove('hidden');
    }
  });

  // Password visibility toggle
  elements.toggleLoginPw.addEventListener('click', () => {
    const isPw = elements.loginPassword.type === 'password';
    elements.loginPassword.type = isPw ? 'text' : 'password';
    elements.toggleLoginPw.textContent = isPw ? '🔒' : '👁️';
  });

  // Logout
  elements.logoutBtn.addEventListener('click', () => {
    if (elements.accountDropdown) elements.accountDropdown.classList.add('hidden');
    confirmAction(
      'Are you sure you want to log out of your workspace?',
      async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
          if (typeof showToast === 'function') {
            showToast('Logged out securely.', 'info');
          }
          showLogin();
        } catch (err) {
          showLogin();
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

      elements.settingsModal.classList.remove('active');
      if (typeof showToast === 'function') {
        showToast('Password changed successfully!', 'success');
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

  // Account Dropdown Toggle
  if (elements.accountBtn && elements.accountDropdown) {
    elements.accountBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.accountDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!elements.accountDropdown.contains(e.target) && e.target !== elements.accountBtn) {
        elements.accountDropdown.classList.add('hidden');
      }
    });
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

    // Priority badge (using SSMS badge classes from test-design.html)
    let priorityBadge = '';
    if (task.priority === 'high') {
      priorityBadge = `<span class="badge badge-expired">● High</span>`;
    } else if (task.priority === 'low') {
      priorityBadge = `<span class="badge badge-active">● Low</span>`;
    } else {
      priorityBadge = `<span class="badge badge-expiring">● Medium</span>`;
    }

    // Due date
    let dueDateHtml = '';
    if (task.due_date) {
      const today = new Date().toISOString().split('T')[0];
      const isOverdue = task.due_date < today && task.status !== 'done';
      dueDateHtml = `
        <span class="due-pill ${isOverdue ? 'overdue' : ''}">
          📅 ${isOverdue ? 'Overdue: ' : ''}${escapeHtml(task.due_date)}
        </span>
      `;
    }

    // Move buttons
    let shiftButtonsHtml = '<div class="move-btns">';
    if (task.status === 'in_progress') {
      shiftButtonsHtml += `<button class="btn btn-outline btn-sm btn-shift" data-target="todo" title="Move to To Do">← To Do</button>`;
      shiftButtonsHtml += `<button class="btn btn-outline btn-sm btn-shift" data-target="done" title="Move to Done">Done →</button>`;
    } else if (task.status === 'todo') {
      shiftButtonsHtml += `<button class="btn btn-outline btn-sm btn-shift" data-target="in_progress" title="Move to In Progress">In Prog →</button>`;
    } else if (task.status === 'done') {
      shiftButtonsHtml += `<button class="btn btn-outline btn-sm btn-shift" data-target="in_progress" title="Move back to In Progress">← In Prog</button>`;
    }
    shiftButtonsHtml += '</div>';

    card.innerHTML = `
      <div class="task-card-header">
        ${priorityBadge}
        <div class="card-action-btns">
          <button class="btn btn-ghost btn-sm card-btn-edit" title="Edit Task">✏️</button>
          <button class="btn btn-ghost btn-sm card-btn-delete" title="Delete Task" style="color:var(--danger);">🗑️</button>
        </div>
      </div>
      <div class="task-card-title">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task-card-desc">${escapeHtml(task.description)}</div>` : ''}
      <div class="task-card-footer">
        ${dueDateHtml || '<span></span>'}
        ${shiftButtonsHtml}
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
