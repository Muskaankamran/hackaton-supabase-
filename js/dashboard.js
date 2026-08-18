import { supabaseClient as supabase } from './supabase.js';

// ===============================================
// STEP 1: Auth check — sirf logged-in user dashboard dekh sake
// ===============================================
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    // logged in nahi hai to login page pe bhej do
    window.location.href = 'index.html';
    return null;
  }

  return session.user;
}

// ===============================================
// STEP 2: Profile fetch karo (naam, avatar dikhane ke liye)
// ===============================================
async function loadProfile(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('name, avatar_url')
    .eq('id', userId)
    .maybeSingle(); // safe single-row query (aapka established pattern)

  if (error) {
    console.error('Profile load error:', error);
    return;
  }

  const name = profile?.name || 'Student';
  document.getElementById('welcomeMsg').textContent = `Welcome, ${name} 👋`;

  const avatarEl = document.getElementById('userAvatar');
  if (profile?.avatar_url) {
    avatarEl.innerHTML = `<img src="${profile.avatar_url}" alt="${name}" />`;
  } else {
    // avatar nahi hai to naam ke initials dikhao
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    avatarEl.textContent = initials;
  }
}

// ===============================================
// STEP 3: Stats load karo (total posts, upcoming events, unread notifs)
// ===============================================
async function loadStats(userId) {
  // total posts (sab users ke — poori community ke)
  const { count: postCount } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true });

  // upcoming events (aaj ki date ke baad wale)
  const today = new Date().toISOString();
  const { count: eventCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .gte('date', today);

  // is user ki unread notifications
  const { count: notifCount } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  document.getElementById('statPosts').textContent = postCount ?? 0;
  document.getElementById('statEvents').textContent = eventCount ?? 0;
  document.getElementById('statNotifs').textContent = notifCount ?? 0;

  // bell icon pe badge dikhao agar unread notifications hain
  if (notifCount > 0) {
    const badge = document.getElementById('notifBadge');
    badge.textContent = notifCount;
    badge.style.display = 'flex';
  }
}

// ===============================================
// STEP 4: Announcements load karo (admin ne jo publish ki hon)
// ===============================================
async function loadAnnouncements() {
  const { data: announcements, error } = await supabase
    .from('notifications') // ya alag 'announcements' table bhi bana sakti hain
    .select('message, created_at')
    .eq('type', 'announcement')
    .order('created_at', { ascending: false })
    .limit(5);

  const container = document.getElementById('announcementsList');

  if (error || !announcements || announcements.length === 0) {
    container.innerHTML = '<div class="empty-state">No announcements yet</div>';
    return;
  }

  container.innerHTML = announcements.map(a => `
    <div class="announcement-card">
      <div class="announcement-icon">📢</div>
      <div class="announcement-text">
        <p>${a.message}</p>
        <p>${timeAgo(a.created_at)}</p>
      </div>
    </div>
  `).join('');
}

// ===============================================
// STEP 5: Notification dropdown — click to open, mark as read
// ===============================================
async function loadNotifications(userId) {
  const { data: notifs } = await supabase
    .from('notifications')
    .select('id, message, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  const list = document.getElementById('notifList');

  if (!notifs || notifs.length === 0) {
    list.innerHTML = '<div class="empty-state">No notifications yet</div>';
    return;
  }

  list.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
      <p>${n.message}</p>
      <p>${timeAgo(n.created_at)}</p>
    </div>
  `).join('');

  // har notification pe click → mark as read
  list.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.id;
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      item.classList.remove('unread');
    });
  });
}

function setupNotifDropdown() {
  const btn = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });

  // bahar click karne pe panel band ho jaye
  document.addEventListener('click', () => panel.classList.remove('open'));
}

// ===============================================
// Helper: "2 hours ago" jaisa relative time
// ===============================================
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

// ===============================================
// STEP 6: GSAP animations — entrance + stagger
// ===============================================
function runAnimations() {
  gsap.from('.topbar', { opacity: 0, y: -20, duration: 0.6, ease: 'power2.out' });

  gsap.from('.stat-card', {
    opacity: 0,
    y: 20,
    duration: 0.5,
    stagger: 0.12,
    delay: 0.2,
    ease: 'power2.out'
  });

  gsap.from('.action-btn', {
    opacity: 0,
    scale: 0.9,
    duration: 0.4,
    stagger: 0.08,
    delay: 0.5,
    ease: 'back.out(1.7)'
  });

  gsap.from('.announcement-card', {
    opacity: 0,
    x: -15,
    duration: 0.4,
    stagger: 0.1,
    delay: 0.7,
    ease: 'power2.out'
  });
}

// ===============================================
// INIT — sab kuch yahan se chalta hai
// ===============================================
async function init() {
  const user = await checkAuth();
  if (!user) return;

  await Promise.all([
    loadProfile(user.id),
    loadStats(user.id),
    loadAnnouncements(),
    loadNotifications(user.id)
  ]);

  setupNotifDropdown();
  runAnimations();
}

init();