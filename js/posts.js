import { supabaseClient as supabase } from './supabase.js';
console.log('supabase object:', supabase);
let currentUser = null;
let allPosts = []; // local cache, search filter isi pe chalega

// ===============================================
// STEP 1: Auth check
// ===============================================
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session.user;
}

// ===============================================
// STEP 2: Posts fetch karo (author profile ke saath join)
// ===============================================
async function fetchPosts() {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id, title, description, image, created_at, user_id,
      profiles ( name, avatar_url ),
      likes ( user_id ),
      comments ( id, content, created_at, user_id, profiles ( name ) )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fetch posts error:', error);
    return [];
  }

  return data || [];
}

// ===============================================
// STEP 3: Post card ka HTML banao
// ===============================================
function renderPostCard(post) {
  const isOwner = post.user_id === currentUser.id;
  const likeCount = post.likes?.length || 0;
  const userHasLiked = post.likes?.some(l => l.user_id === currentUser.id);
  const commentCount = post.comments?.length || 0;

  const authorName = post.profiles?.name || 'Unknown';
  const initials = authorName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatarHtml = post.profiles?.avatar_url
    ? `<img src="${post.profiles.avatar_url}" alt="${authorName}" />`
    : initials;

  const commentsHtml = (post.comments || []).map(c => `
    <div class="comment-item">
      <div class="comment-avatar">${(c.profiles?.name || '?')[0].toUpperCase()}</div>
      <div class="comment-bubble">
        <span class="comment-author">${c.profiles?.name || 'Unknown'}</span>${c.content}
      </div>
    </div>
  `).join('');

  return `
    <div class="post-card" data-post-id="${post.id}">
      <div class="post-header">
        <div class="post-author">
          <div class="post-author-avatar">${avatarHtml}</div>
          <div>
            <div class="post-author-name">${authorName}</div>
            <div class="post-time">${timeAgo(post.created_at)}</div>
          </div>
        </div>
        ${isOwner ? `
          <div class="post-menu">
            <button class="edit-post-btn" title="Edit">✏️</button>
            <button class="delete-post-btn" title="Delete">🗑️</button>
          </div>
        ` : ''}
      </div>

      <div class="post-title">${escapeHtml(post.title)}</div>
      <div class="post-description">${escapeHtml(post.description)}</div>
      ${post.image ? `<img src="${post.image}" class="post-image" alt="Post image" />` : ''}

      <div class="post-actions">
        <button class="post-action-btn like-btn ${userHasLiked ? 'liked' : ''}">
          <span class="icon">${userHasLiked ? '❤️' : '🤍'}</span>
          <span class="like-count">${likeCount}</span>
        </button>
        <button class="post-action-btn comment-toggle-btn">
          <span class="icon">💬</span>
          <span>${commentCount} comments</span>
        </button>
      </div>

      <div class="comments-section">
        <div class="comments-list">${commentsHtml}</div>
        <form class="comment-form">
          <input type="text" placeholder="Write a comment..." required maxlength="300" />
          <button type="submit">Post</button>
        </form>
      </div>
    </div>
  `;
}

// ===============================================
// STEP 4: Feed render karo (search filter apply karke)
// ===============================================
function renderFeed(posts) {
  const feed = document.getElementById('postsFeed');

  if (posts.length === 0) {
    feed.innerHTML = `
      <div class="empty-feed">
        <div class="icon">📭</div>
        <p>No posts yet. Be the first to share something!</p>
      </div>
    `;
    return;
  }

  feed.innerHTML = posts.map(renderPostCard).join('');
  attachCardListeners();

  // GSAP entrance for cards
  gsap.from('.post-card', {
    opacity: 0,
    y: 16,
    duration: 0.45,
    stagger: 0.08,
    ease: 'power2.out'
  });
}

// ===============================================
// STEP 5: Har card ke buttons pe listeners lagao
// ===============================================
function attachCardListeners() {
  document.querySelectorAll('.post-card').forEach(card => {
    const postId = card.dataset.postId;

    // Like button
    card.querySelector('.like-btn').addEventListener('click', () => toggleLike(postId, card));

    // Comment toggle
    card.querySelector('.comment-toggle-btn').addEventListener('click', () => {
      card.querySelector('.comments-section').classList.toggle('open');
    });

    // Comment submit
    card.querySelector('.comment-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      addComment(postId, input.value.trim());
      input.value = '';
    });

    // Edit (sirf owner ke paas ye button hoga)
    const editBtn = card.querySelector('.edit-post-btn');
    if (editBtn) editBtn.addEventListener('click', () => openEditModal(postId));

    // Delete
    const deleteBtn = card.querySelector('.delete-post-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', () => deletePost(postId));
  });
}

// ===============================================
// STEP 6: Like toggle — insert agar nahi liked, delete agar already liked
// ===============================================
async function toggleLike(postId, cardEl) {
  const post = allPosts.find(p => p.id === postId);
  const alreadyLiked = post.likes?.some(l => l.user_id === currentUser.id);

  if (alreadyLiked) {
    await supabase.from('likes').delete()
      .eq('post_id', postId)
      .eq('user_id', currentUser.id);
    post.likes = post.likes.filter(l => l.user_id !== currentUser.id);
  } else {
    await supabase.from('likes').insert({ post_id: postId, user_id: currentUser.id });
    post.likes.push({ user_id: currentUser.id });

    // post owner ko notification bhejo (agar khud ka post nahi hai)
    if (post.user_id !== currentUser.id) {
      await sendNotification(post.user_id, `Someone liked your post "${post.title}"`);
    }
  }

  // sirf is card ka like button update karo, pura feed reload nahi karna
  const likeBtn = cardEl.querySelector('.like-btn');
  const likeCountEl = cardEl.querySelector('.like-count');
  const nowLiked = post.likes.some(l => l.user_id === currentUser.id);
  likeBtn.classList.toggle('liked', nowLiked);
  likeBtn.querySelector('.icon').textContent = nowLiked ? '❤️' : '🤍';
  likeCountEl.textContent = post.likes.length;
}

// ===============================================
// STEP 7: Comment add karo
// ===============================================
async function addComment(postId, content) {
  if (!content) return;

  const { error } = await supabase.from('comments').insert({
    post_id: postId,
    user_id: currentUser.id,
    content
  });

  if (error) {
    console.error('Comment error:', error);
    return;
  }

  const post = allPosts.find(p => p.id === postId);
  if (post.user_id !== currentUser.id) {
    await sendNotification(post.user_id, `Someone commented on your post "${post.title}"`);
  }

  // feed refresh karo taake naya comment dikhe
  await loadAndRenderPosts();
}

// ===============================================
// STEP 8: Notification helper (Partner D ki file se yahi pattern hoga)
// ===============================================
async function sendNotification(receiverId, message) {
  await supabase.from('notifications').insert({
    user_id: receiverId,
    message,
    is_read: false
  });
}

// ===============================================
// STEP 9: Create / Edit post modal
// ===============================================
const modal = document.getElementById('postModal');
const postForm = document.getElementById('postForm');

document.getElementById('openCreateModalBtn').addEventListener('click', () => {
  document.getElementById('modalTitle').textContent = 'Create post';
  postForm.reset();
  document.getElementById('postId').value = '';
  modal.classList.add('open');
});

document.getElementById('cancelModalBtn').addEventListener('click', () => {
  modal.classList.remove('open');
});

function openEditModal(postId) {
  const post = allPosts.find(p => p.id === postId);
  document.getElementById('modalTitle').textContent = 'Edit post';
  document.getElementById('postId').value = post.id;
  document.getElementById('postTitle').value = post.title;
  document.getElementById('postDescription').value = post.description;
  modal.classList.add('open');
}

postForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const postId = document.getElementById('postId').value;
  const title = document.getElementById('postTitle').value.trim();
  const description = document.getElementById('postDescription').value.trim();
  const fileInput = document.getElementById('postImage');

  let imageUrl = null;

  // agar image select ki hai to Supabase Storage pe upload karo
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const filePath = `${currentUser.id}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Image upload error:', uploadError);
    } else {
      const { data: publicUrlData } = supabase.storage
        .from('post-images')
        .getPublicUrl(filePath);
      imageUrl = publicUrlData.publicUrl;
    }
  }

  if (postId) {
    // ===== EDIT =====
    const updatePayload = { title, description };
    if (imageUrl) updatePayload.image_url = imageUrl;

    const { error } = await supabase
      .from('posts')
      .update(updatePayload)
      .eq('id', postId)
      .eq('user_id', currentUser.id); // extra safety, RLS bhi ye enforce karega

    if (error) console.error('Update error:', error);
  } else {
    // ===== CREATE =====
    const { error } = await supabase.from('posts').insert({
      title,
      description,
      image: imageUrl,
      user_id: currentUser.id,
      author: currentUser.id
    });

    if (error) console.error('Create error:', error);
  }

  modal.classList.remove('open');
  await loadAndRenderPosts();
});

// ===============================================
// STEP 10: Delete post
// ===============================================
async function deletePost(postId) {
  const confirmed = confirm('Delete this post? This cannot be undone.');
  if (!confirmed) return;

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', currentUser.id); // RLS bhi ye check karega, ye extra safety hai

  if (error) {
    console.error('Delete error:', error);
    return;
  }

  await loadAndRenderPosts();
}

// ===============================================
// STEP 11: Search
// ===============================================
document.getElementById('searchInput').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  const filtered = allPosts.filter(p =>
    p.title.toLowerCase().includes(query) ||
    p.description.toLowerCase().includes(query)
  );
  renderFeed(filtered);
});

// ===============================================
// Helpers
// ===============================================
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===============================================
// INIT
// ===============================================
async function loadAndRenderPosts() {
  allPosts = await fetchPosts();
  renderFeed(allPosts);
}

async function init() {
  currentUser = await checkAuth();
  if (!currentUser) return;

  await loadAndRenderPosts();
}

init();