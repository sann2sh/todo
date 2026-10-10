const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const CSV_FILE = path.join(DATA_DIR, 'tasks.csv');
const CONFIG_FILE = path.join(DATA_DIR, 'auth-config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Global active sessions map: token -> { expiresAt: number, ip: string }
const activeSessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Brute-force protection: IP -> { attempts: number, lockUntil: number }
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

// Initialize Auth Config
let authConfig = { passwordHash: null, initialized: false };
function loadAuthConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      authConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) {
      console.error('Error reading auth config:', e);
    }
  }

  // Fallback or override from environment variable
  const envPassword = process.env.ADMIN_PASSWORD;
  if (envPassword) {
    const hash = hashPassword(envPassword);
    authConfig = { passwordHash: hash, initialized: true };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(authConfig, null, 2));
    console.log('[Auth] Password initialized from ADMIN_PASSWORD environment variable.');
  } else if (!authConfig.initialized) {
    // Generate a default secure password on first boot if neither file nor env exists
    const defaultPassword = crypto.randomBytes(6).toString('hex'); // 12-char friendly password
    const hash = hashPassword(defaultPassword);
    authConfig = { passwordHash: hash, initialized: true };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(authConfig, null, 2));
    console.log('====================================================');
    console.log('[SECURITY SETUP] First-time setup detected!');
    console.log(`Generated Default Password: ${defaultPassword}`);
    console.log('You can change this anytime or set ADMIN_PASSWORD in your .env');
    console.log('====================================================');
  }
}
loadAuthConfig();

// CSV Escaping & Sanitization
// Neutralize spreadsheet formula injection (=, +, -, @)
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
  // If field contains comma, quote, or newline, surround with quotes and escape internal quotes
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
  // Remove leading single quote if added for formula sanitization
  if (val.startsWith("'") && /^[=+\-@\t\r]/.test(val.slice(1))) {
    val = val.slice(1);
  }
  return val;
}

// Robust CSV parser supporting quotes, escaped quotes, and newlines
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

// Initialize CSV with headers and seed data if not present
function initializeCsvIfMissing() {
  if (!fs.existsSync(CSV_FILE)) {
    const sampleTasks = [
      {
        id: 'task_' + Date.now() + '_1',
        title: 'Deploy to GCP e2-micro instance',
        description: 'Set up systemd service and Nginx reverse proxy on the Google Cloud VM.',
        status: 'todo',
        priority: 'high',
        due_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'task_' + Date.now() + '_2',
        title: 'Review Kanban workflow',
        description: 'Drag cards between To Do, In Progress, and Done to organize daily priorities.',
        status: 'in_progress',
        priority: 'medium',
        due_date: new Date(Date.now() + 86400000 * 1).toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'task_' + Date.now() + '_3',
        title: 'Configure password in .env',
        description: 'Update your ADMIN_PASSWORD secret so only you have access.',
        status: 'done',
        priority: 'low',
        due_date: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    saveTasksToCsv(sampleTasks);
    console.log('[CSV] Initialized new tasks.csv with sample tasks.');
  }
}

// Atomic file write to avoid corruption
let fileWriteLock = Promise.resolve();
function saveTasksToCsv(tasks) {
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
  const tmpFile = `${CSV_FILE}.${Date.now()}.tmp`;

  fs.writeFileSync(tmpFile, csvContent, 'utf-8');
  fs.renameSync(tmpFile, CSV_FILE);
}

function loadTasksFromCsv() {
  if (!fs.existsSync(CSV_FILE)) {
    initializeCsvIfMissing();
  }

  const content = fs.readFileSync(CSV_FILE, 'utf-8');
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

initializeCsvIfMissing();

// Middlewares
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Authentication Middleware
function requireAuth(req, res, next) {
  const token = req.cookies.auth_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Access token missing' });
  }

  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
  }

  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized: Session expired' });
  }

  // Refresh sliding expiration window
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  req.session = session;
  next();
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

// Login
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  // Check lockout
  const attemptInfo = loginAttempts.get(ip) || { attempts: 0, lockUntil: 0 };
  if (attemptInfo.lockUntil > now) {
    const waitSec = Math.ceil((attemptInfo.lockUntil - now) / 1000);
    return res.status(429).json({
      error: `Too many failed attempts. Locked out for ${waitSec} seconds.`
    });
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password required' });
  }

  if (!authConfig.passwordHash || !verifyPassword(password, authConfig.passwordHash)) {
    attemptInfo.attempts += 1;
    if (attemptInfo.attempts >= MAX_ATTEMPTS) {
      attemptInfo.lockUntil = now + LOCKOUT_TIME_MS;
      loginAttempts.set(ip, attemptInfo);
      return res.status(429).json({
        error: 'Too many failed login attempts. Locked out for 10 minutes.'
      });
    }
    loginAttempts.set(ip, attemptInfo);
    return res.status(401).json({
      error: `Incorrect password. (${MAX_ATTEMPTS - attemptInfo.attempts} attempts remaining)`
    });
  }

  // Success: reset attempts
  loginAttempts.delete(ip);

  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, {
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    ip
  });

  // Set cookie (httpOnly, sameSite lax, secure in production if https)
  res.cookie('auth_token', token, {
    httpOnly: true,
    maxAge: SESSION_TTL_MS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && req.secure
  });

  return res.json({ success: true, token });
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

// Check Session
app.get('/api/auth/check', (req, res) => {
  const token = req.cookies.auth_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token && activeSessions.has(token)) {
    const session = activeSessions.get(token);
    if (Date.now() <= session.expiresAt) {
      return res.json({ authenticated: true });
    }
    activeSessions.delete(token);
  }
  return res.json({ authenticated: false });
});

// Change Password
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
  }

  if (!verifyPassword(currentPassword, authConfig.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const newHash = hashPassword(newPassword);
  authConfig.passwordHash = newHash;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(authConfig, null, 2));

  res.json({ success: true, message: 'Password updated successfully' });
});

// --- Tasks CRUD Endpoints ---

// Get all tasks
app.get('/api/tasks', requireAuth, (req, res) => {
  try {
    const tasks = loadTasksFromCsv();
    res.json({ tasks });
  } catch (error) {
    console.error('Error loading tasks:', error);
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

    const tasks = loadTasksFromCsv();
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
    saveTasksToCsv(tasks);

    res.status(201).json({ success: true, task: newTask });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
app.put('/api/tasks/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, due_date } = req.body;

    const tasks = loadTasksFromCsv();
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

    saveTasksToCsv(tasks);

    res.json({ success: true, task });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    let tasks = loadTasksFromCsv();
    const initialCount = tasks.length;
    tasks = tasks.filter(t => t.id !== id);

    if (tasks.length === initialCount) {
      return res.status(404).json({ error: 'Task not found' });
    }

    saveTasksToCsv(tasks);
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Export CSV directly (for backup)
app.get('/api/tasks/export', requireAuth, (req, res) => {
  if (!fs.existsSync(CSV_FILE)) {
    return res.status(404).send('CSV file not found');
  }
  const timestamp = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="tasks-backup-${timestamp}.csv"`);
  res.sendFile(CSV_FILE);
});

// Serve frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all for SPA/UI
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Kanban Todo app running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Data directory: ${DATA_DIR}`);
});
