const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const USERS_DIR = path.join(DATA_DIR, 'users');
const LEGACY_CSV_FILE = path.join(DATA_DIR, 'tasks.csv');
const LEGACY_CONFIG_FILE = path.join(DATA_DIR, 'auth-config.json');

// Ensure base data directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(USERS_DIR)) {
  fs.mkdirSync(USERS_DIR, { recursive: true });
}

// Global active sessions map: token -> { userId: string, username: string, expiresAt: number, ip: string }
const activeSessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 365 * 10; // 10 years persistent for trusted personal devices

// Brute-force protection: IP_or_User -> { attempts: number, lockUntil: number }
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 1000 * 60 * 10; // 10 minutes lockout

// Helper to hash password with scrypt
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

// Helper to verify password
function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

// Helper to verify device key safely
function verifyDeviceKey(providedKey, storedKey) {
  if (!providedKey || typeof providedKey !== 'string' || !storedKey) return false;
  const keyBuf = Buffer.from(providedKey.trim());
  const storedBuf = Buffer.from(storedKey);
  if (keyBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, storedBuf);
}

// --- User Management & Migration ---

function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      if (data && Array.isArray(data.users)) {
        return data;
      }
    } catch (e) {
      console.error('[Users] Error reading users.json:', e);
    }
  }
  return { users: [] };
}

function saveUsers(data) {
  const tmpFile = `${USERS_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, USERS_FILE);
}

function findUserByUsername(username) {
  if (!username || typeof username !== 'string') return null;
  const data = loadUsers();
  return data.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase()) || null;
}

function findUserById(userId) {
  if (!userId) return null;
  const data = loadUsers();
  return data.users.find(u => u.id === userId) || null;
}

function findUserByDeviceKey(key) {
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim();
  const data = loadUsers();
  for (const user of data.users) {
    if (user.deviceKey && verifyDeviceKey(trimmed, user.deviceKey)) {
      return user;
    }
  }
  return null;
}

// Migrate single-user legacy setup to multi-user architecture seamlessly
function migrateSingleUser() {
  const usersData = loadUsers();
  if (usersData.users.length > 0) {
    // Already migrated
    return;
  }

  console.log('[Migration] Migrating legacy single-user data to multi-user format...');

  let legacyPasswordHash = null;
  let legacyDeviceKey = null;

  if (fs.existsSync(LEGACY_CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, 'utf-8'));
      legacyPasswordHash = cfg.passwordHash;
      legacyDeviceKey = cfg.deviceKey;
    } catch (e) {
      console.error('[Migration] Could not parse legacy auth-config.json:', e);
    }
  }

  const envPassword = process.env.ADMIN_PASSWORD;
  const passwordHash = legacyPasswordHash || (envPassword ? hashPassword(envPassword) : hashPassword('@sanTODO'));
  const deviceKey = legacyDeviceKey || (process.env.DEVICE_KEY ? process.env.DEVICE_KEY.trim() : crypto.randomBytes(24).toString('hex'));

  const primaryUser = {
    id: `usr_san_${crypto.randomBytes(4).toString('hex')}`,
    username: 'san',
    passwordHash,
    deviceKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  usersData.users.push(primaryUser);
  saveUsers(usersData);

  // Setup user directory & migrate existing tasks.csv
  const userDir = path.join(USERS_DIR, primaryUser.id);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const userCsvPath = path.join(userDir, 'tasks.csv');
  if (fs.existsSync(LEGACY_CSV_FILE)) {
    try {
      fs.copyFileSync(LEGACY_CSV_FILE, userCsvPath);
      console.log(`[Migration] Migrated existing tasks.csv to user "${primaryUser.username}" (${userCsvPath})`);
    } catch (err) {
      console.error('[Migration] Error copying legacy tasks.csv:', err);
    }
  } else {
    initUserDefaultTasks(primaryUser.id);
  }

  console.log(`[Migration] Initialized primary user: "${primaryUser.username}" with preserved credentials.`);
}

// --- CSV Escaping & Parsing Helpers ---

function sanitizeForCsv(str) {
  if (str === null || str === undefined) return '';
  let value = String(str);
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }
  return value;
}

function escapeCsvField(field) {
  const sanitized = sanitizeForCsv(field);
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function unescapeCsvField(field) {
  let val = field.trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.slice(1, -1).replace(/""/g, '"');
  }
  if (val.startsWith("'") && /^[=+\-@\t\r]/.test(val.slice(1))) {
    val = val.slice(1);
  }
  return val;
}

function parseCsv(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      }
      insideQuotes = !insideQuotes;
      i++;
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
      i++;
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.length > 0 && currentRow.some(f => f.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      i++;
    } else {
      currentField += char;
      i++;
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim() !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

const CSV_HEADERS = ['id', 'title', 'description', 'status', 'priority', 'due_date', 'created_at', 'updated_at'];

function getUserCsvPath(userId) {
  const userDir = path.join(USERS_DIR, userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return path.join(userDir, 'tasks.csv');
}

function initUserDefaultTasks(userId) {
  const sampleTasks = [
    {
      id: `task_${Date.now()}_1`,
      title: '👋 Welcome to Flow Kanban!',
      description: 'Click this card to view details or edit. You can drag tasks between columns to update their progress.',
      status: 'todo',
      priority: 'high',
      due_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: `task_${Date.now()}_2`,
      title: '⚡ Try moving this task',
      description: 'Drag cards into In Progress or Done, or use the mobile quick action arrows.',
      status: 'in_progress',
      priority: 'medium',
      due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: `task_${Date.now()}_3`,
      title: '🔒 Zero-password auto-login active',
      description: 'Your browser is authorized with a secret device key. You never need to enter a password here again.',
      status: 'done',
      priority: 'low',
      due_date: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];
  saveTasksForUser(userId, sampleTasks);
}

function loadTasksForUser(userId) {
  const csvFile = getUserCsvPath(userId);
  if (!fs.existsSync(csvFile)) {
    initUserDefaultTasks(userId);
  }

  const content = fs.readFileSync(csvFile, 'utf-8');
  const rows = parseCsv(content);
  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const tasks = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

    const task = {};
    headers.forEach((header, index) => {
      task[header] = row[index] !== undefined ? unescapeCsvField(row[index]) : '';
    });

    if (task.id && task.title) {
      tasks.push({
        id: task.id,
        title: task.title,
        description: task.description || '',
        status: ['todo', 'in_progress', 'done'].includes(task.status) ? task.status : 'todo',
        priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
        due_date: task.due_date || '',
        created_at: task.created_at || new Date().toISOString(),
        updated_at: task.updated_at || new Date().toISOString()
      });
    }
  }

  return tasks;
}

function saveTasksForUser(userId, tasks) {
  const csvFile = getUserCsvPath(userId);
  const headerLine = CSV_HEADERS.join(',');
  const rowLines = tasks.map(t => [
    escapeCsvField(t.id || ''),
    escapeCsvField(t.title || ''),
    escapeCsvField(t.description || ''),
    escapeCsvField(t.status || 'todo'),
    escapeCsvField(t.priority || 'medium'),
    escapeCsvField(t.due_date || ''),
    escapeCsvField(t.created_at || new Date().toISOString()),
    escapeCsvField(t.updated_at || new Date().toISOString())
  ].join(','));

  const csvContent = [headerLine, ...rowLines].join('\n') + '\n';
  const tmpFile = `${csvFile}.${Date.now()}.tmp`;

  fs.writeFileSync(tmpFile, csvContent, 'utf-8');
  fs.renameSync(tmpFile, csvFile);
}

// Run initial migration
migrateSingleUser();

// --- Middlewares & Security ---
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Authentication Middleware
function requireAuth(req, res, next) {
  // 1. Check persistent device key (header or query)
  const deviceKey = req.headers['x-device-key'] || req.query.key;
  if (deviceKey) {
    const user = findUserByDeviceKey(deviceKey);
    if (user) {
      req.user = user;
      req.isDeviceAuthenticated = true;
      return next();
    }
  }

  // 2. Check token (cookie or Bearer header)
  const token = req.cookies.auth_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    // Check if token matches a deviceKey directly
    const userByKey = findUserByDeviceKey(token);
    if (userByKey) {
      req.user = userByKey;
      req.isDeviceAuthenticated = true;
      return next();
    }

    // Check active sessions map
    const session = activeSessions.get(token);
    if (session && Date.now() <= session.expiresAt) {
      const user = findUserById(session.userId);
      if (user) {
        session.expiresAt = Date.now() + SESSION_TTL_MS;
        req.user = user;
        req.session = session;
        return next();
      }
    }
    if (session) {
      activeSessions.delete(token);
    }
  }

  return res.status(401).json({ error: 'Unauthorized: Session missing or expired' });
}

// Clean up expired sessions periodically (every 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (now > session.expiresAt) {
      activeSessions.delete(token);
    }
  }
}, 1000 * 60 * 60);

// --- Auth Endpoints ---

// Sign Up
app.post('/api/auth/signup', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const { username, password } = req.body;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required.' });
  }

  const cleanUsername = username.trim();
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(cleanUsername)) {
    return res.status(400).json({
      error: 'Username must be 3-20 characters long and contain only letters, numbers, underscores, or hyphens.'
    });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const existing = findUserByUsername(cleanUsername);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken. Please choose another.' });
  }

  const userId = `usr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const deviceKey = crypto.randomBytes(24).toString('hex');
  const passwordHash = hashPassword(password);

  const newUser = {
    id: userId,
    username: cleanUsername,
    passwordHash,
    deviceKey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const usersData = loadUsers();
  usersData.users.push(newUser);
  saveUsers(usersData);

  // Initialize board with sample tasks
  initUserDefaultTasks(userId);

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, {
    userId,
    username: cleanUsername,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    ip
  });

  res.cookie('auth_token', token, {
    httpOnly: true,
    maxAge: SESSION_TTL_MS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && req.secure
  });

  console.log(`[Auth] New user registered: "${cleanUsername}" (${userId})`);
  return res.status(201).json({
    success: true,
    user: { id: newUser.id, username: newUser.username },
    deviceKey,
    token
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  const attemptKey = `${ip}_login`;
  const attemptInfo = loginAttempts.get(attemptKey) || { attempts: 0, lockUntil: 0 };
  if (attemptInfo.lockUntil > now) {
    const waitSec = Math.ceil((attemptInfo.lockUntil - now) / 1000);
    return res.status(429).json({
      error: `Too many failed attempts. Locked out for ${waitSec} seconds.`
    });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    attemptInfo.attempts += 1;
    if (attemptInfo.attempts >= MAX_ATTEMPTS) {
      attemptInfo.lockUntil = now + LOCKOUT_TIME_MS;
      loginAttempts.set(attemptKey, attemptInfo);
      return res.status(429).json({
        error: 'Too many failed login attempts. Locked out for 10 minutes.'
      });
    }
    loginAttempts.set(attemptKey, attemptInfo);
    return res.status(401).json({
      error: `Invalid username or password. (${MAX_ATTEMPTS - attemptInfo.attempts} attempts remaining)`
    });
  }

  loginAttempts.delete(attemptKey);

  // Generate secure session token
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, {
    userId: user.id,
    username: user.username,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    ip
  });

  res.cookie('auth_token', token, {
    httpOnly: true,
    maxAge: SESSION_TTL_MS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && req.secure
  });

  return res.json({
    success: true,
    user: { id: user.id, username: user.username },
    deviceKey: user.deviceKey,
    token
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies.auth_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    activeSessions.delete(token);
  }
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// Check Session & Device Key
app.get('/api/auth/check', (req, res) => {
  const deviceKey = req.headers['x-device-key'] || req.query.key;
  if (deviceKey) {
    const user = findUserByDeviceKey(deviceKey);
    if (user) {
      return res.json({
        authenticated: true,
        user: { id: user.id, username: user.username },
        deviceKey: user.deviceKey
      });
    }
  }

  const token = req.cookies.auth_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    const userByKey = findUserByDeviceKey(token);
    if (userByKey) {
      return res.json({
        authenticated: true,
        user: { id: userByKey.id, username: userByKey.username },
        deviceKey: userByKey.deviceKey
      });
    }

    const session = activeSessions.get(token);
    if (session && Date.now() <= session.expiresAt) {
      const user = findUserById(session.userId);
      if (user) {
        return res.json({
          authenticated: true,
          user: { id: user.id, username: user.username },
          deviceKey: user.deviceKey
        });
      }
    }
    if (session) {
      activeSessions.delete(token);
    }
  }

  return res.json({ authenticated: false });
});

// Get Device Key (for creating auto-login links for other personal devices)
app.get('/api/auth/device-key', requireAuth, (req, res) => {
  res.json({ deviceKey: req.user.deviceKey, username: req.user.username });
});

// Change Password (invalidates all devices for this user only)
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  if (!verifyPassword(currentPassword, req.user.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const usersData = loadUsers();
  const user = usersData.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  user.passwordHash = hashPassword(newPassword);
  // Rotate device key to invalidate all existing remembered devices for this user
  user.deviceKey = crypto.randomBytes(24).toString('hex');
  user.updatedAt = new Date().toISOString();

  // Purge active sessions for this user
  for (const [token, session] of activeSessions.entries()) {
    if (session.userId === user.id) {
      activeSessions.delete(token);
    }
  }

  saveUsers(usersData);
  console.log(`[Auth] User "${user.username}" changed password. Device key rotated; all remembered devices invalidated.`);
  res.json({ success: true, message: 'Password updated. All remembered devices have been invalidated.' });
});

// --- Tasks CRUD Endpoints (Scoped strictly to req.user.id) ---

// Get all tasks
app.get('/api/tasks', requireAuth, (req, res) => {
  try {
    const tasks = loadTasksForUser(req.user.id);
    res.json({ tasks, username: req.user.username });
  } catch (error) {
    console.error(`Error loading tasks for user ${req.user.id}:`, error);
    res.status(500).json({ error: 'Failed to read tasks CSV' });
  }
});

// Create new task
app.post('/api/tasks', requireAuth, (req, res) => {
  try {
    const { title, description, status, priority, due_date } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    const tasks = loadTasksForUser(req.user.id);
    const newTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      description: (description || '').trim(),
      status: ['todo', 'in_progress', 'done'].includes(status) ? status : 'todo',
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      due_date: (due_date || '').trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    tasks.unshift(newTask);
    saveTasksForUser(req.user.id, tasks);

    res.status(201).json({ success: true, task: newTask });
  } catch (error) {
    console.error(`Error creating task for user ${req.user.id}:`, error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
app.put('/api/tasks/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, due_date } = req.body;

    const tasks = loadTasksForUser(req.user.id);
    const index = tasks.findIndex(t => t.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = tasks[index];

    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: 'Title cannot be empty.' });
      task.title = title.trim();
    }
    if (description !== undefined) task.description = description.trim();
    if (status !== undefined && ['todo', 'in_progress', 'done'].includes(status)) {
      task.status = status;
    }
    if (priority !== undefined && ['low', 'medium', 'high'].includes(priority)) {
      task.priority = priority;
    }
    if (due_date !== undefined) task.due_date = due_date.trim();

    task.updated_at = new Date().toISOString();
    tasks[index] = task;

    saveTasksForUser(req.user.id, tasks);

    res.json({ success: true, task });
  } catch (error) {
    console.error(`Error updating task for user ${req.user.id}:`, error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    let tasks = loadTasksForUser(req.user.id);
    const initialCount = tasks.length;
    tasks = tasks.filter(t => t.id !== id);

    if (tasks.length === initialCount) {
      return res.status(404).json({ error: 'Task not found' });
    }

    saveTasksForUser(req.user.id, tasks);
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    console.error(`Error deleting task for user ${req.user.id}:`, error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Export CSV directly (for backup of current user's board)
app.get('/api/tasks/export', requireAuth, (req, res) => {
  const csvFile = getUserCsvPath(req.user.id);
  if (!fs.existsSync(csvFile)) {
    return res.status(404).send('CSV file not found');
  }
  const timestamp = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="tasks-${req.user.username}-${timestamp}.csv"`);
  res.sendFile(csvFile);
});

// Serve frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all for SPA/UI
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Multi-User Kanban Todo app running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Data directory: ${DATA_DIR}`);
});
