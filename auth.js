/* ── AUTH.JS — JERGA SUDAKA ──────────────────────────────────────────────────
   Sistema de autenticación con Clerk (Google OAuth) + Turso
   
   SETUP REQUERIDO:
   1. Crear cuenta en https://clerk.com (gratis)
   2. Crear una Application → elegir "Google" como social provider
   3. Copiar tu "Publishable Key" (empieza con pk_test_ o pk_live_)
   4. Reemplazar CLERK_PUBLISHABLE_KEY abajo
   5. En Clerk dashboard → Domains → agregar tu dominio
   
   TABLAS TURSO requeridas (ejecutar una vez):
   
   CREATE TABLE IF NOT EXISTS users (
     id           TEXT PRIMARY KEY,
     email        TEXT UNIQUE NOT NULL,
     username     TEXT UNIQUE,
     display_name TEXT,
     avatar_url   TEXT,
     role         TEXT DEFAULT 'espectador',
     artist_id    INTEGER,
     created_at   TEXT DEFAULT (datetime('now')),
     banned       INTEGER DEFAULT 0
   );
   
   CREATE TABLE IF NOT EXISTS pending_approvals (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     type        TEXT NOT NULL,
     ref_id      TEXT NOT NULL,
     user_id     TEXT NOT NULL,
     note        TEXT,
     status      TEXT DEFAULT 'pending',
     reviewed_by TEXT,
     reviewed_at TEXT,
     created_at  TEXT DEFAULT (datetime('now'))
   );

   ALTER TABLE artists ADD COLUMN status TEXT DEFAULT 'approved';
   ALTER TABLE artists ADD COLUMN submitted_by TEXT;
   ─────────────────────────────────────────────────────────────────────────── */

const CLERK_PUBLISHABLE_KEY = 'pk_test_ZW5nYWdpbmctdGhydXNoLTQ2LmNsZXJrLmFjY291bnRzLmRldiQ';

// Estado global de auth
window.AUTH = {
  user: null,       // objeto usuario de Turso
  clerkUser: null,  // objeto usuario de Clerk
  ready: false,     // true cuando Clerk terminó de inicializar
};

// Roles en orden de jerarquía
const ROLE_HIERARCHY = ['espectador', 'artista', 'pending_manager', 'manager', 'admin'];
const ROLE_LABELS = {
  espectador:       'Espectador',
  artista:          'Artista',
  pending_manager:  'Manager (pendiente)',
  manager:          'Manager',
  admin:            'Admin',
};

// ── Helpers de permisos ──────────────────────────────────────────────────────

window.authCan = {
  addArtist:    () => hasRole(['artista','manager','admin']),
  editArtist:   (artistDbId) => {
    if (!AUTH.user) return false;
    if (AUTH.user.role === 'admin') return true;
    if (AUTH.user.role === 'manager') return true;
    if (AUTH.user.role === 'artista' && String(AUTH.user.artist_id) === String(artistDbId)) return true;
    return false;
  },
  deleteArtist: (artistDbId) => {
    if (!AUTH.user) return false;
    if (AUTH.user.role === 'admin') return true;
    if (AUTH.user.role === 'manager') return true;
    if (AUTH.user.role === 'artista' && String(AUTH.user.artist_id) === String(artistDbId)) return true;
    return false;
  },
  addEvent:     () => hasRole(['espectador','artista','manager','admin']),
  editEvent:    (eventCreatedBy) => {
    if (!AUTH.user) return false;
    if (AUTH.user.role === 'admin') return true;
    return AUTH.user.id === eventCreatedBy;
  },
  deleteEvent:  (eventCreatedBy) => {
    if (!AUTH.user) return false;
    if (AUTH.user.role === 'admin') return true;
    return AUTH.user.id === eventCreatedBy;
  },
  manageUsers:  () => AUTH.user?.role === 'admin',
};

function hasRole(roles) {
  if (!AUTH.user) return false;
  return roles.includes(AUTH.user.role);
}

// ── Inicialización de Clerk ──────────────────────────────────────────────────

async function initAuth() {
  // Inyectar SDK de Clerk dinámicamente
  await loadClerkScript();

  const clerk = window.Clerk;
  await clerk.load();

  AUTH.ready = true;

  if (clerk.user) {
    AUTH.clerkUser = clerk.user;
    await syncUserWithTurso(clerk.user);
    renderAuthUI();
  } else {
    renderAuthUI();
  }

  // Escuchar cambios de sesión
  clerk.addListener(({ user }) => {
    AUTH.clerkUser = user || null;
    if (user) {
      syncUserWithTurso(user).then(renderAuthUI);
    } else {
      AUTH.user = null;
      renderAuthUI();
    }
  });
}

function loadClerkScript() {
  return new Promise((resolve, reject) => {
    if (window.Clerk) { resolve(); return; }
    const script = document.createElement('script');
    script.src = `https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js`;
    script.setAttribute('data-clerk-publishable-key', CLERK_PUBLISHABLE_KEY);
    script.onload = async () => {
      await window.Clerk.load();
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ── Sincronización con Turso ─────────────────────────────────────────────────

async function syncUserWithTurso(clerkUser) {
  const id = clerkUser.id;
  const email = clerkUser.primaryEmailAddress?.emailAddress || '';
  const display_name = clerkUser.fullName || clerkUser.username || email.split('@')[0];
  const avatar_url = clerkUser.imageUrl || '';

  // Buscar usuario existente
  const rows = await turso('SELECT * FROM users WHERE id=?', [id]);
  
  if (rows && rows.length > 0) {
    AUTH.user = rows[0];
    // Actualizar avatar/nombre si cambió en Google
    await turso(
      'UPDATE users SET display_name=?, avatar_url=? WHERE id=?',
      [display_name, avatar_url, id]
    );
    AUTH.user.display_name = display_name;
    AUTH.user.avatar_url = avatar_url;
  } else {
    // Primer login: crear usuario
    await turso(
      'INSERT INTO users (id, email, display_name, avatar_url, role) VALUES (?,?,?,?,?)',
      [id, email, display_name, avatar_url, 'espectador']
    );
    AUTH.user = { id, email, display_name, avatar_url, role: 'espectador', artist_id: null, banned: 0 };
    // Mostrar modal de bienvenida para elegir rol
    setTimeout(() => openRoleSelector(), 400);
  }
}

// ── UI del header ────────────────────────────────────────────────────────────

function renderAuthUI() {
  const btnAuth = document.getElementById('btn-auth');
  const userChip = document.getElementById('user-chip');

  if (!AUTH.user) {
    // No logueado
    if (btnAuth) { btnAuth.style.display = ''; }
    if (userChip) { userChip.classList.remove('on'); }
    // Ocultar botón agregar artista para guests
    const btnAdd = document.getElementById('btn-add');
    if (btnAdd) btnAdd.style.display = 'none';
  } else {
    // Logueado
    if (btnAuth) { btnAuth.style.display = 'none'; }
    
    // Mostrar/ocultar botón agregar artista según rol
    const btnAdd = document.getElementById('btn-add');
    if (btnAdd) {
      btnAdd.style.display = authCan.addArtist() ? '' : 'none';
    }

    if (userChip) {
      userChip.classList.add('on');
      // Avatar
      const av = document.getElementById('user-chip-av');
      if (av) {
        if (AUTH.user.avatar_url) {
          av.innerHTML = `<img src="${AUTH.user.avatar_url}" alt="">`;
        } else {
          av.innerHTML = (AUTH.user.display_name || '?')[0].toUpperCase();
        }
      }
      // Nombre
      const nm = document.getElementById('user-chip-name');
      if (nm) nm.textContent = AUTH.user.display_name || AUTH.user.email;
      // Rol badge
      const rl = document.getElementById('user-chip-role');
      if (rl) {
        rl.textContent = ROLE_LABELS[AUTH.user.role] || AUTH.user.role;
        rl.className = 'user-chip-role role-' + AUTH.user.role;
      }
    }

    // Badge de pendientes para admin
    updateAdminBadge();
  }
}

async function updateAdminBadge() {
  if (AUTH.user?.role !== 'admin') return;
  const rows = await turso("SELECT COUNT(*) as n FROM pending_approvals WHERE status='pending'", []);
  const count = rows?.[0]?.n || 0;
  const badge = document.getElementById('umenu-admin-badge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  }
}

// ── Modales ──────────────────────────────────────────────────────────────────

function openAuthModal(tab = 'login') {
  const mov = document.getElementById('auth-mov');
  if (mov) {
    mov.classList.add('open');
    switchAuthTab(tab);
    setAuthMsg('');
  }
}
window.openAuthModal = openAuthModal;

function closeAuthModal() {
  const mov = document.getElementById('auth-mov');
  if (mov) mov.classList.remove('open');
}
window.closeAuthModal = closeAuthModal;

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('auth-login-body').style.display  = tab === 'login'    ? '' : 'none';
  document.getElementById('auth-register-body').style.display = tab === 'register' ? '' : 'none';
  const title = document.getElementById('auth-title');
  if (title) title.textContent = tab === 'login' ? 'INGRESAR' : 'REGISTRO';
}
window.switchAuthTab = switchAuthTab;

function setAuthMsg(msg, type = 'error') {
  const el = document.getElementById('auth-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'auth-msg ' + (msg ? type + ' on' : '');
}

// ── Google OAuth ─────────────────────────────────────────────────────────────

const CLERK_HOSTED = 'https://engaging-thrush-46.clerk.accounts.dev';

function loginWithGoogle() {
  const returnUrl = window.location.href;
  try {
    // Usar buildSignInUrl de Clerk si está disponible
    if (window.Clerk && window.Clerk.buildSignInUrl) {
      const url = window.Clerk.buildSignInUrl({ redirectUrl: returnUrl });
      window.location.href = url;
    } else {
      // Fallback: Account Portal directo
      window.location.href = `${CLERK_HOSTED}/sign-in#/?redirect_url=${encodeURIComponent(returnUrl)}`;
    }
  } catch(e) {
    window.location.href = `${CLERK_HOSTED}/sign-in#/?redirect_url=${encodeURIComponent(returnUrl)}`;
  }
}
window.loginWithGoogle = loginWithGoogle;

function registerWithGoogle() {
  const returnUrl = window.location.href;
  try {
    if (window.Clerk && window.Clerk.buildSignUpUrl) {
      const url = window.Clerk.buildSignUpUrl({ redirectUrl: returnUrl });
      window.location.href = url;
    } else {
      window.location.href = `${CLERK_HOSTED}/sign-up#/?redirect_url=${encodeURIComponent(returnUrl)}`;
    }
  } catch(e) {
    window.location.href = `${CLERK_HOSTED}/sign-up#/?redirect_url=${encodeURIComponent(returnUrl)}`;
  }
}
window.registerWithGoogle = registerWithGoogle;

async function logout() {
  closeUserMenu();
  await window.Clerk.signOut();
  AUTH.user = null;
  AUTH.clerkUser = null;
  renderAuthUI();
}
window.logout = logout;

// ── Selector de rol (primer login) ──────────────────────────────────────────

function openRoleSelector() {
  const mov = document.getElementById('auth-mov');
  if (!mov) return;
  mov.classList.add('open');

  // Mostrar solo el selector de rol
  document.getElementById('auth-login-body').style.display  = 'none';
  document.getElementById('auth-register-body').style.display = 'none';
  document.getElementById('auth-tabs').style.display = 'none';
  document.getElementById('auth-role-selector').style.display = '';
  document.getElementById('auth-title').textContent = 'BIENVENIDO/A';
  document.getElementById('auth-ft').style.display = 'flex';
  document.getElementById('auth-ft-submit').textContent = 'CONFIRMAR ROL';
  document.getElementById('auth-ft-submit').onclick = confirmRole;
  document.getElementById('auth-cls').style.display = 'none'; // no se puede cerrar sin elegir rol
}

function confirmRole() {
  const selected = document.querySelector('.role-opt.selected');
  if (!selected) {
    setAuthMsg('Elegí un rol para continuar.', 'info');
    return;
  }
  const role = selected.dataset.role;
  saveUserRole(role);
}

async function saveUserRole(role) {
  if (!AUTH.user) return;
  await turso('UPDATE users SET role=? WHERE id=?', [role, AUTH.user.id]);
  AUTH.user.role = role;

  // Si eligió manager, crear pending approval
  if (role === 'pending_manager') {
    await turso(
      "INSERT INTO pending_approvals (type, ref_id, user_id) VALUES ('manager', ?, ?)",
      [AUTH.user.id, AUTH.user.id]
    );
    // Mostrar notice de pendiente
    closeRoleSelectorUI();
    showPendingNotice('Tu solicitud como Manager está siendo revisada por un administrador. Te avisaremos cuando sea aprobada.');
    return;
  }

  closeRoleSelectorUI();
  closeAuthModal();
  renderAuthUI();
}

function closeRoleSelectorUI() {
  document.getElementById('auth-role-selector').style.display = 'none';
  document.getElementById('auth-tabs').style.display = '';
  document.getElementById('auth-cls').style.display = '';
  document.getElementById('auth-ft').style.display = 'flex';
}

function showPendingNotice(msg) {
  const el = document.getElementById('auth-pending-notice');
  if (!el) return;
  el.querySelector('.pending-desc').textContent = msg;
  el.classList.add('on');
  // Ocultar otras secciones del modal
  ['auth-login-body','auth-register-body','auth-role-selector','auth-tabs','auth-ft'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.style.display = 'none';
  });
}

function selectRoleOpt(el) {
  document.querySelectorAll('.role-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}
window.selectRoleOpt = selectRoleOpt;

// ── User chip dropdown ───────────────────────────────────────────────────────

function toggleUserMenu() {
  document.getElementById('user-menu')?.classList.toggle('on');
}
window.toggleUserMenu = toggleUserMenu;

function closeUserMenu() {
  document.getElementById('user-menu')?.classList.remove('on');
}

// Click fuera cierra el menú
document.addEventListener('click', (e) => {
  const chip = document.getElementById('user-chip');
  const menu = document.getElementById('user-menu');
  if (chip && menu && !chip.contains(e.target)) {
    menu.classList.remove('on');
  }
});

// ── Panel Admin ──────────────────────────────────────────────────────────────

async function openAdminPanel() {
  closeUserMenu();
  if (AUTH.user?.role !== 'admin') return;
  const mov = document.getElementById('admin-mov');
  if (mov) {
    mov.classList.add('open');
    await loadAdminTab('pending');
  }
}
window.openAdminPanel = openAdminPanel;

function closeAdminPanel() {
  document.getElementById('admin-mov')?.classList.remove('open');
}
window.closeAdminPanel = closeAdminPanel;

async function loadAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const body = document.getElementById('admin-body');
  body.innerHTML = '<div class="admin-empty"><span class="auth-spinner"></span></div>';

  if (tab === 'pending') {
    await renderPendingApprovals(body);
  } else if (tab === 'users') {
    await renderUsersTable(body);
  }
}
window.loadAdminTab = loadAdminTab;

async function renderPendingApprovals(container) {
  const rows = await turso(
    `SELECT pa.*, u.display_name, u.email, u.avatar_url, u.role as u_role,
            a.nombre as artist_name
     FROM pending_approvals pa
     JOIN users u ON pa.user_id = u.id
     LEFT JOIN artists a ON pa.type='artist' AND CAST(pa.ref_id AS TEXT) = CAST(a.id AS TEXT)
     WHERE pa.status='pending'
     ORDER BY pa.created_at DESC`
  );

  // Actualizar badge
  const badge = document.getElementById('admin-pending-badge');
  if (badge) { badge.textContent = rows?.length || 0; badge.style.display = (rows?.length) ? '' : 'none'; }

  if (!rows || !rows.length) {
    container.innerHTML = '<div class="admin-empty">No hay solicitudes pendientes 🎉</div>';
    return;
  }

  container.innerHTML = rows.map(r => `
    <div class="approval-card" id="apcard-${r.id}">
      <div class="approval-card-hdr">
        <div class="approval-av">
          ${r.avatar_url ? `<img src="${r.avatar_url}" alt="">` : (r.display_name||'?')[0].toUpperCase()}
        </div>
        <div>
          <div class="approval-name">${r.display_name || r.email}</div>
          <div class="approval-meta">
            ${r.email} · ${r.type === 'artist' ? ('Artista: ' + (r.artist_name || r.ref_id)) : 'Manager'}
          </div>
          ${r.note ? `<div class="approval-meta" style="margin-top:3px;font-style:italic">"${r.note}"</div>` : ''}
        </div>
        <span class="approval-type ${r.type}">${r.type === 'artist' ? 'Artista' : 'Manager'}</span>
      </div>
      <div class="approval-actions">
        <button class="btn-reject" onclick="resolveApproval(${r.id},'${r.type}','${r.user_id}','${r.ref_id}','rejected')">✕ RECHAZAR</button>
        <button class="btn-approve" onclick="resolveApproval(${r.id},'${r.type}','${r.user_id}','${r.ref_id}','approved')">✓ APROBAR</button>
      </div>
    </div>
  `).join('');
}

async function resolveApproval(approvalId, type, userId, refId, status) {
  const now = new Date().toISOString();
  // Marcar approval
  await turso(
    'UPDATE pending_approvals SET status=?, reviewed_by=?, reviewed_at=? WHERE id=?',
    [status, AUTH.user.id, now, approvalId]
  );

  if (status === 'approved') {
    if (type === 'manager') {
      // Promover a manager
      await turso("UPDATE users SET role='manager' WHERE id=?", [userId]);
    } else if (type === 'artist') {
      // Aprobar artista en el mapa
      await turso("UPDATE artists SET status='approved' WHERE id=?", [Number(refId)]);
    }
  } else {
    if (type === 'manager') {
      // Volver a espectador
      await turso("UPDATE users SET role='espectador' WHERE id=?", [userId]);
    } else if (type === 'artist') {
      await turso("UPDATE artists SET status='rejected' WHERE id=?", [Number(refId)]);
    }
  }

  // Remover card del DOM
  document.getElementById('apcard-' + approvalId)?.remove();
  const body = document.getElementById('admin-body');
  if (body && !body.querySelector('.approval-card')) {
    body.innerHTML = '<div class="admin-empty">No hay solicitudes pendientes 🎉</div>';
  }
  updateAdminBadge();
}
window.resolveApproval = resolveApproval;

async function renderUsersTable(container) {
  const rows = await turso('SELECT * FROM users ORDER BY created_at DESC LIMIT 100');
  if (!rows || !rows.length) {
    container.innerHTML = '<div class="admin-empty">No hay usuarios registrados.</div>';
    return;
  }
  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Email</th>
          <th>Rol</th>
          <th>Desde</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(u => `
          <tr>
            <td style="display:flex;align-items:center;gap:8px">
              <div class="approval-av" style="width:28px;height:28px;font-size:12px;flex-shrink:0">
                ${u.avatar_url ? `<img src="${u.avatar_url}" alt="">` : (u.display_name||'?')[0]}
              </div>
              ${u.display_name || '—'}
            </td>
            <td style="font-size:9px;color:var(--tm)">${u.email}</td>
            <td>
              <select class="role-select" onchange="changeUserRole('${u.id}', this.value)">
                ${ROLE_HIERARCHY.map(r => `<option value="${r}" ${u.role===r?'selected':''}>${ROLE_LABELS[r]}</option>`).join('')}
              </select>
            </td>
            <td style="font-size:9px;color:var(--tm)">${(u.created_at||'').slice(0,10)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function changeUserRole(userId, newRole) {
  await turso('UPDATE users SET role=? WHERE id=?', [newRole, userId]);
}
window.changeUserRole = changeUserRole;

// ── Inyección de HTML en el DOM ──────────────────────────────────────────────

function injectAuthHTML() {
  // 1. Botón en el header (antes del btn-add)
  const btnAdd = document.getElementById('btn-add');
  if (btnAdd && !document.getElementById('btn-auth')) {
    // Botón "INGRESAR" para guests
    const btnAuth = document.createElement('button');
    btnAuth.id = 'btn-auth';
    btnAuth.textContent = 'INGRESAR';
    btnAuth.onclick = () => openAuthModal('login');
    btnAdd.parentNode.insertBefore(btnAuth, btnAdd);

    // User chip para logueados
    const chip = document.createElement('div');
    chip.id = 'user-chip';
    chip.onclick = toggleUserMenu;
    chip.innerHTML = `
      <div id="user-chip-av"></div>
      <span id="user-chip-name"></span>
      <span id="user-chip-role" class="user-chip-role"></span>
      <div id="user-menu">
        <div class="umenu-hdr">
          <div class="umenu-email" id="umenu-email"></div>
        </div>
        <div class="umenu-item" onclick="closeUserMenu()">✎ Mi perfil</div>
        <div class="umenu-item" id="umenu-admin" style="display:none" onclick="openAdminPanel()">
          ⚙ Panel admin
          <span class="umenu-badge" id="umenu-admin-badge" style="display:none">0</span>
        </div>
        <div class="umenu-item danger" onclick="logout()">↩ Cerrar sesión</div>
      </div>
    `;
    btnAdd.parentNode.insertBefore(chip, btnAdd);
  }

  // 2. Modal de auth
  if (!document.getElementById('auth-mov')) {
    const mov = document.createElement('div');
    mov.id = 'auth-mov';
    mov.onclick = (e) => { if (e.target === mov) closeAuthModal(); };
    mov.innerHTML = `
      <div id="auth-modal">
        <div id="auth-hdr">
          <div id="auth-title">INGRESAR</div>
          <button id="auth-cls" onclick="closeAuthModal()">✕</button>
        </div>

        <div id="auth-tabs">
          <div class="auth-tab active" data-tab="login" onclick="switchAuthTab('login')">Ingresar</div>
          <div class="auth-tab" data-tab="register" onclick="switchAuthTab('register')">Registrarse</div>
        </div>

        <div id="auth-body">
          <div id="auth-msg" class="auth-msg"></div>

          <!-- LOGIN -->
          <div id="auth-login-body">
            <button id="btn-google" onclick="loginWithGoogle()">
              <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continuar con Google
            </button>
            <div class="auth-sep">o</div>
            <div style="font-size:10px;color:var(--tm);text-align:center;letter-spacing:1px;line-height:1.6;padding:8px 0">
              Por ahora solo soportamos login con Google.<br>
              Más opciones próximamente.
            </div>
          </div>

          <!-- REGISTER -->
          <div id="auth-register-body" style="display:none">
            <button id="btn-google-reg" onclick="registerWithGoogle()">
              <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Registrarse con Google
            </button>
            <div style="font-size:10px;color:var(--tm);text-align:center;letter-spacing:1px;line-height:1.6;padding:16px 0">
              Después del registro elegís tu rol.<br>
              Más opciones próximamente.
            </div>
          </div>

          <!-- ROLE SELECTOR (primer login con Google) -->
          <div id="auth-role-selector" style="display:none">
            <div style="font-size:11px;color:var(--tm);letter-spacing:1px;margin-bottom:14px;line-height:1.6">
              ¡Bienvenido/a! Antes de continuar, elegí cómo vas a usar el sitio:
            </div>
            <div class="role-grid">
              <div class="role-opt" data-role="espectador" onclick="selectRoleOpt(this)">
                <div class="role-opt-name">👀 Espectador</div>
                <div class="role-opt-desc">Seguís la escena y agregás eventos.</div>
              </div>
              <div class="role-opt" data-role="artista" onclick="selectRoleOpt(this)">
                <div class="role-opt-name">🎤 Artista</div>
                <div class="role-opt-desc">Cargás tu perfil al mapa (con aprobación).</div>
              </div>
              <div class="role-opt" data-role="pending_manager" onclick="selectRoleOpt(this)" style="grid-column:1/-1">
                <div class="role-opt-name">📋 Manager / Booking</div>
                <div class="role-opt-desc">Representás artistas. Requiere aprobación.</div>
              </div>
            </div>
            <div id="auth-msg" class="auth-msg"></div>
          </div>

          <!-- PENDING NOTICE -->
          <div id="auth-pending-notice">
            <div class="pending-icon">⏳</div>
            <div class="pending-title">SOLICITUD ENVIADA</div>
            <div class="pending-desc"></div>
            <button class="madd" onclick="closeAuthModal()" style="margin-top:8px">ENTENDIDO</button>
          </div>
        </div>

        <div id="auth-ft" style="display:flex">
          <button class="mcan" onclick="closeAuthModal()">CANCELAR</button>
          <button class="madd" id="auth-ft-submit" style="display:none">CONFIRMAR</button>
        </div>
      </div>
    `;
    document.body.appendChild(mov);
  }

  // 3. Modal de admin
  if (!document.getElementById('admin-mov')) {
    const adminMov = document.createElement('div');
    adminMov.id = 'admin-mov';
    adminMov.onclick = (e) => { if (e.target === adminMov) closeAdminPanel(); };
    adminMov.innerHTML = `
      <div id="admin-modal">
        <div id="admin-hdr">
          <div id="admin-title">⚙ PANEL ADMIN</div>
          <button id="admin-cls" onclick="closeAdminPanel()">✕</button>
        </div>
        <div id="admin-tabs">
          <div class="admin-tab active" data-tab="pending" onclick="loadAdminTab('pending')">
            Pendientes
            <span class="admin-tab-badge" id="admin-pending-badge" style="display:none">0</span>
          </div>
          <div class="admin-tab" data-tab="users" onclick="loadAdminTab('users')">Usuarios</div>
        </div>
        <div id="admin-body">
          <div class="admin-empty">Cargando...</div>
        </div>
      </div>
    `;
    document.body.appendChild(adminMov);
  }
}

// ── Guardia para el botón "Agregar Artista" ──────────────────────────────────

function guardAddArtist() {
  if (!AUTH.user) {
    openAuthModal('login');
    return false;
  }
  if (!authCan.addArtist()) {
    alert('Tu rol actual no te permite agregar artistas al mapa.');
    return false;
  }
  return true;
}
window.guardAddArtist = guardAddArtist;

// ── Bootstrap ────────────────────────────────────────────────────────────────

// Inyectar HTML inmediatamente (no esperar a Clerk)
injectAuthHTML();

// Mostrar admin item en menú si corresponde (se actualiza después de sync)
function updateAdminMenuVisibility() {
  const item = document.getElementById('umenu-admin');
  if (item) item.style.display = AUTH.user?.role === 'admin' ? '' : 'none';
  const emailEl = document.getElementById('umenu-email');
  if (emailEl && AUTH.user) emailEl.textContent = AUTH.user.email || '';
}

// Hook: sobrescribir openModal para requerir auth
const _origOpenModal = window.openModal;
window.openModal = function() {
  if (!guardAddArtist()) return;
  if (_origOpenModal) _origOpenModal();
};

// Iniciar Clerk cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initAuth().then(() => {
      updateAdminMenuVisibility();
      renderAuthUI();
    });
  });
} else {
  initAuth().then(() => {
    updateAdminMenuVisibility();
    renderAuthUI();
  });
}
