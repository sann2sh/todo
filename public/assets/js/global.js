/**
 * SSMS — Global JavaScript Utilities
 * Shared across admin and customer portals.
 */

// ─── API Fetch Wrapper ──────────────────────────────────────

/**
 * Make an API request with JSON support and error handling.
 * @param {string} url - API endpoint URL
 * @param {object} options - { method, body, headers }
 * @returns {Promise<object>} - Parsed JSON response
 */
async function apiRequest(url, options = {}) {
    const config = {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '',
            ...options.headers,
        },
    };

    if (options.body && config.method !== 'GET') {
        config.body = JSON.stringify(options.body);
    }

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || `Request failed (${response.status})`);
        }

        return data;
    } catch (error) {
        if (error.name === 'TypeError') {
            throw new Error('Network error. Please check your connection.');
        }
        throw error;
    }
}


// ─── Toast Notifications ────────────────────────────────────

/**
 * Initialize toast container if it doesn't exist.
 */
function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Show a toast notification.
 * @param {string} message - Toast message
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - Auto-dismiss duration in ms (default 4500)
 */
function showToast(message, type = 'info', duration = 4500) {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓', error: '✕', warning: '⚠', info: 'ℹ'
    };

    toast.innerHTML = `
        <span style="font-weight:700;font-size:1.1rem;">${icons[type] || 'ℹ'}</span>
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, duration);
}


// ─── Modal Manager ──────────────────────────────────────────

/**
 * Open a modal by its overlay ID.
 * @param {string} modalId - The modal overlay element ID
 */
function openModal(modalId) {
    const overlay = document.getElementById(modalId);
    if (overlay) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Close a modal by its overlay ID.
 * @param {string} modalId - The modal overlay element ID
 */
function closeModal(modalId) {
    const overlay = document.getElementById(modalId);
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * Close modal when clicking overlay background.
 */
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

/**
 * Close modal on Escape key.
 */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const openOverlay = document.querySelector('.modal-overlay.active');
        if (openOverlay) {
            openOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
});


// ─── Loading States ─────────────────────────────────────────

/**
 * Show a loading overlay inside an element.
 * @param {HTMLElement} element - The container element
 */
function showLoading(element) {
    element.style.position = 'relative';
    const loader = document.createElement('div');
    loader.className = 'loading-overlay';
    loader.innerHTML = '<div class="spinner spinner-lg"></div>';
    element.appendChild(loader);
}

/**
 * Remove loading overlay from an element.
 * @param {HTMLElement} element - The container element
 */
function hideLoading(element) {
    const loader = element.querySelector('.loading-overlay');
    if (loader) loader.remove();
}

/**
 * Set a button to loading state.
 * @param {HTMLButtonElement} btn - The button element
 * @param {boolean} loading - True to show loading, false to restore
 */
function setBtnLoading(btn, loading) {
    if (loading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<div class="spinner"></div> Loading...';
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        btn.disabled = false;
    }
}


// ─── Form Helpers ───────────────────────────────────────────

/**
 * Serialize a form to a plain object.
 * @param {HTMLFormElement} form - The form element
 * @returns {object} - Key-value pairs
 */
function serializeForm(form) {
    const formData = new FormData(form);
    const data = {};
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }
    return data;
}

/**
 * Show validation error on a form field.
 * @param {string} fieldName - The input name attribute
 * @param {string} message - Error message
 */
function showFieldError(fieldName, message) {
    const field = document.querySelector(`[name="${fieldName}"]`);
    if (!field) return;
    field.classList.add('error');
    const errorEl = field.parentElement.querySelector('.form-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    } else {
        const el = document.createElement('span');
        el.className = 'form-error';
        el.textContent = message;
        field.parentElement.appendChild(el);
    }
}

/**
 * Clear all validation errors in a form.
 * @param {HTMLFormElement} form - The form element
 */
function clearFormErrors(form) {
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    form.querySelectorAll('.form-error').forEach(el => el.remove());
}


// ─── Sidebar Toggle (Mobile) ────────────────────────────────

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}


// ─── Confirm Dialog ─────────────────────────────────────────

/**
 * Show a confirmation dialog.
 * @param {string} message - Confirmation message
 * @param {Function} onConfirm - Callback if confirmed
 * @param {string} confirmText - Text for the confirm button
 */
function confirmAction(message, onConfirm, confirmText = 'Confirm', title = 'Confirm Action') {
    const overlayId = 'confirm-dialog-overlay';

    // Remove any existing confirm dialog
    const existing = document.getElementById(overlayId);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
        <div class="modal" style="max-width:420px; border:1px solid var(--gray-200);">
            <div class="modal-header">
                <h3 style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.1rem;">⚠️</span>
                    <span>${title}</span>
                </h3>
                <button class="modal-close" id="confirm-close-btn">✕</button>
            </div>
            <div class="modal-body">
                <p style="color:var(--gray-600); font-size:var(--text-sm); line-height:1.5;">${message}</p>
            </div>
            <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:var(--sp-2);">
                <button class="btn btn-outline" id="confirm-cancel">Cancel</button>
                <button class="btn btn-danger" id="confirm-ok">${confirmText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const cleanup = () => {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => overlay.remove(), 200);
    };

    document.getElementById('confirm-close-btn').addEventListener('click', cleanup);
    document.getElementById('confirm-cancel').addEventListener('click', cleanup);
    document.getElementById('confirm-ok').addEventListener('click', () => {
        cleanup();
        onConfirm();
    });
}


// ─── Date Formatter ─────────────────────────────────────────

/**
 * Format a date string for display.
 * @param {string} dateStr - ISO date string
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string}
 */
function formatDate(dateStr, options = {}) {
    const defaults = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateStr).toLocaleDateString('en-US', { ...defaults, ...options });
}

/**
 * Format a date string with time.
 */
function formatDateTime(dateStr) {
    return new Date(dateStr).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}


// ─── Debounce ───────────────────────────────────────────────

function debounce(fn, delay = 300) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        const context = this;
        timer = setTimeout(() => fn.apply(context, args), delay);
    };
}

// ─── Instant Navigation Hover/Touch Prefetcher ──────────────
// Prefetches destination pages into HTTP cache on hover (65ms intent threshold) or touchstart
if (typeof window !== 'undefined') {
    const prefetchedUrls = new Set();

    function triggerPrefetch(rawHref) {
        if (!rawHref) return;
        let url;
        try {
            url = new URL(rawHref, window.location.origin);
        } catch (e) {
            return;
        }

        if (url.origin !== window.location.origin) return;
        if (!url.pathname.startsWith('/admin')) return;
        if (url.pathname.includes('logout') || url.pathname.includes('/api/')) return;

        // Clean .php to match Apache internal rewrites and avoid 301 redirect aborts
        const cleanPath = url.pathname.replace(/\.php$/, '');
        const targetHref = url.origin + cleanPath + url.search;

        if (prefetchedUrls.has(targetHref)) return;
        prefetchedUrls.add(targetHref);
        prefetchedUrls.add(url.href);

        console.log('[SSMS Prefetch] Prefetching:', targetHref);

        // 1. Link prefetch for browser document cache
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = targetHref;
        document.head.appendChild(link);

        // 2. Fetch with low priority to warm HTTP cache & visibly appear in DevTools Network tab
        fetch(targetHref, { priority: 'low', credentials: 'include' })
            .then(res => {
                if (res.ok) {
                    console.log('[SSMS Prefetch] Ready (200 OK):', targetHref);
                }
            })
            .catch(() => {});
    }

    // Hover with 65ms intent delay (cancels if mouse quickly sweeps across)
    document.addEventListener('mouseover', (e) => {
        const a = e.target.closest('a');
        if (!a || !a.href) return;

        const timer = setTimeout(() => {
            triggerPrefetch(a.href);
        }, 65);

        a.addEventListener('mouseleave', () => clearTimeout(timer), { once: true });
    }, { passive: true });

    // Touchstart on mobile devices
    document.addEventListener('touchstart', (e) => {
        const a = e.target.closest('a');
        if (a && a.href) {
            triggerPrefetch(a.href);
        }
    }, { passive: true });
}

