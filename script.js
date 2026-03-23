/* ============================================================
   SMPS COURSE — MASTER JAVASCRIPT
   Updated to use Flask Backend API on port 5001
   ============================================================ */

// ============================================================
// API CONFIGURATION
// ============================================================
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://smps-course-platform.onrender.com/api';

// ============================================================
// AUTH MODULE
// ============================================================
let currentUser = null;
let authToken = null;

function loadCurrentUser() {
    const savedUser = sessionStorage.getItem('smps_currentUser');
    const savedToken = sessionStorage.getItem('smps_token');
    if (savedUser && savedToken) {
        currentUser = JSON.parse(savedUser);
        authToken = savedToken;
    }
}

function saveAuth(user, token) {
    currentUser = user;
    authToken = token;
    sessionStorage.setItem('smps_currentUser', JSON.stringify(user));
    sessionStorage.setItem('smps_token', token);
}

function clearAuth() {
    currentUser = null;
    authToken = null;
    sessionStorage.removeItem('smps_currentUser');
    sessionStorage.removeItem('smps_token');
}

async function apiCall(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'API call failed');
    }
    return data;
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');

    if (!email || !password) {
        errEl.textContent = 'Email and password are required.';
        errEl.classList.remove('hidden');
        return;
    }

    try {
        const result = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        const user = result.data.user;
        const token = result.data.token;

        saveAuth(user, token);
        closeModal();
        updateNavForUser();
        showToast(`Welcome back, ${user.full_name.split(' ')[0]}! 👋`);

        if (user.role === 'admin') navigate('admin');
        else navigate('dashboard');
    } catch (error) {
        errEl.textContent = error.message || 'Invalid credentials.';
        errEl.classList.remove('hidden');
    }
}

async function handleSignup() {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const errEl = document.getElementById('signupError');

    if (!name || !email || !password) {
        errEl.textContent = 'All fields required.';
        errEl.classList.remove('hidden');
        return;
    }
    if (password.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.';
        errEl.classList.remove('hidden');
        return;
    }

    try {
        const result = await apiCall('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ username: email.split('@')[0], email, password, full_name: name })
        });

        const user = result.data.user;
        const token = result.data.token;

        saveAuth(user, token);
        closeModal();
        updateNavForUser();
        showToast(`Account created! Welcome, ${name.split(' ')[0]}! 🎉`);
        navigate('dashboard');
    } catch (error) {
        errEl.textContent = error.message || 'Signup failed. Please try again.';
        errEl.classList.remove('hidden');
    }
}

function handleLogout() {
    clearAuth();
    updateNavForUser();
    navigate('home');
    showToast('Logged out successfully.');
}

function updateNavForUser() {
    const authBtns = document.getElementById('navAuthButtons');
    const userMenu = document.getElementById('navUserMenu');
    const userInitial = document.getElementById('userInitial');
    const dropdownName = document.getElementById('dropdownName');
    const adminLink = document.getElementById('adminPanelLink');
    const userDropdown = document.getElementById('userDropdown');

    if (currentUser) {
        authBtns.classList.add('hidden');
        userMenu.classList.remove('hidden');
        userInitial.textContent = currentUser.full_name.charAt(0).toUpperCase();
        dropdownName.textContent = currentUser.full_name;
        if (currentUser.role === 'admin') adminLink.classList.remove('hidden');
        else adminLink.classList.add('hidden');
    } else {
        authBtns.classList.remove('hidden');
        userMenu.classList.add('hidden');
        if (userDropdown) userDropdown.classList.add('hidden');
    }
}

function toggleUserDropdown() {
    const dd = document.getElementById('userDropdown');
    dd.classList.toggle('hidden');
}

document.addEventListener('click', e => {
    const dd = document.getElementById('userDropdown');
    const avatar = document.getElementById('userAvatar');
    if (dd && !dd.classList.contains('hidden') && !dd.contains(e.target) && !avatar.contains(e.target)) {
        dd.classList.add('hidden');
    }
});

function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
    } else {
        signupForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        signupTab.classList.add('active');
        loginTab.classList.remove('active');
    }
}

// ============================================================
// NAVIGATION MODULE
// ============================================================
function navigate(page, params = {}) {
    const protectedPages = ['dashboard', 'learning', 'certificates'];
    const adminPages = ['admin'];

    if (protectedPages.includes(page) && !currentUser) {
        openModal('auth', 'login');
        return;
    }
    if (adminPages.includes(page) && (!currentUser || currentUser.role !== 'admin')) {
        showToast('Access denied. Admins only.', 'error');
        return;
    }

    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.classList.add('hidden');
    });

    const pageEl = document.getElementById(`page-${page}`);
    if (!pageEl) return;
    pageEl.classList.remove('hidden');
    pageEl.classList.add('active');

    const dd = document.getElementById('userDropdown');
    if (dd) dd.classList.add('hidden');
    const nav = document.getElementById('navLinks');
    if (nav) nav.classList.remove('mobile-open');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    const renderers = {
        home: renderHome,
        courses: renderCoursesPage,
        'course-detail': () => renderCourseDetail(params.courseId),
        learning: () => renderLearningPage(params.courseId),
        dashboard: renderDashboard,
        certificates: renderCertificatesPage,
        verify: () => { },
        admin: () => { adminTab('dashboard'); renderAdminDashboard(); },
    };

    if (renderers[page]) renderers[page]();
}

function toggleMobileMenu() {
    const nav = document.getElementById('navLinks');
    nav.classList.toggle('mobile-open');
}

// ============================================================
// COURSES MODULE
// ============================================================

function buildCourseCard(course, showProgress = false) {
    const progressHtml = showProgress && course.progress_percentage !== undefined
        ? `<div class="progress-course-bar"><div class="progress-course-fill" style="width:${course.progress_percentage}%"></div></div>
           <small style="font-size:11px;color:var(--ink-muted)">${course.progress_percentage}% complete</small>`
        : '';

    const btnLabel = course.is_enrolled ? (course.progress_percentage === 100 ? '✓ Completed' : 'Continue →') : 'Enroll Free';

    const thumbHtml = course.image_url
        ? `<img src="${course.image_url}" alt="${course.title}" loading="lazy" />`
        : `<div class="course-thumbnail-placeholder">${course.icon || '📚'}</div>`;

    return `
    <div class="course-card" onclick="navigate('course-detail', {courseId: ${course.id}})">
      <div class="course-thumbnail">${thumbHtml}<div class="course-level-badge">${course.difficulty_level}</div></div>
      <div class="course-body">
        <div class="course-category">${course.category}</div>
        <div class="course-title">${course.title}</div>
        <div class="course-instructor">by ${course.instructor_name}</div>
        ${progressHtml}
        <div class="course-meta">
          <span class="course-rating">★ ${course.rating}</span>
          <span class="course-enrolled">${course.enrolled_count?.toLocaleString() || 0} students</span>
        </div>
      </div>
      <div class="course-card-footer">
        <span class="course-duration">⏱ ${course.duration}</span>
        <button class="enroll-btn" onclick="event.stopPropagation(); quickEnroll(${course.id})">${btnLabel}</button>
      </div>
    </div>`;
}

async function renderHome() {
    try {
        const result = await apiCall('/courses?page=1');
        const courses = result.data.items || [];

        const categories = {};
        courses.forEach(c => {
            if (!categories[c.category]) categories[c.category] = { count: 0, icon: getCatIcon(c.category) };
            categories[c.category].count++;
        });

        const catGrid = document.getElementById('categoriesGrid');
        if (catGrid) {
            catGrid.innerHTML = Object.entries(categories).map(([name, info]) => `
                <div class="category-card" onclick="navigate('courses')">
                    <div class="cat-icon">${info.icon}</div>
                    <div class="cat-name">${name}</div>
                    <div class="cat-count">${info.count} course${info.count > 1 ? 's' : ''}</div>
                </div>`).join('');
        }

        const featEl = document.getElementById('featuredCourses');
        if (featEl) featEl.innerHTML = courses.slice(0, 3).map(c => buildCourseCard(c)).join('');
    } catch (error) {
        console.error('Error loading home:', error);
    }
}

function getCatIcon(cat) {
    const map = { 'Power Electronics': '⚡', 'PCB Design': '🖥️', 'EMC': '📡', 'Battery Technology': '🔋', 'Simulation': '🐍', 'Control Systems': '🎛️' };
    return map[cat] || '📚';
}

async function renderCoursesPage() {
    try {
        const result = await apiCall('/courses?page=1');
        const courses = result.data.items || [];

        const categories = [...new Set(courses.map(c => c.category))];
        const catFilter = document.getElementById('categoryFilter');
        if (catFilter) {
            catFilter.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
        }
        renderFilteredCourses(courses);
    } catch (error) {
        console.error('Error loading courses:', error);
    }
}

async function filterCourses() {
    try {
        const search = document.getElementById('courseSearch')?.value || '';
        const category = document.getElementById('categoryFilter')?.value || '';
        const level = document.getElementById('levelFilter')?.value || '';
        const sort = document.getElementById('sortFilter')?.value || 'enrolled';

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (category) params.append('category', category);
        if (level) params.append('level', level);
        if (sort) params.append('sort', sort);

        const result = await apiCall(`/courses?${params.toString()}`);
        const courses = result.data.items || [];
        renderFilteredCourses(courses);
    } catch (error) {
        console.error('Error filtering courses:', error);
    }
}

function renderFilteredCourses(courses) {
    const grid = document.getElementById('allCoursesGrid');
    const count = document.getElementById('courseCount');
    if (count) count.textContent = `${courses.length} course${courses.length !== 1 ? 's' : ''} found`;
    if (grid) {
        grid.innerHTML = courses.length
            ? courses.map(c => buildCourseCard(c)).join('')
            : `<div class="empty-state"><div class="empty-icon">🔍</div><h3>No courses found</h3><p>Try adjusting your filters.</p></div>`;
    }
}

function clearFilters() {
    document.getElementById('courseSearch').value = '';
    document.getElementById('categoryFilter').value = '';
    document.getElementById('levelFilter').value = '';
    filterCourses();
}

async function renderCourseDetail(courseId) {
    try {
        const result = await apiCall(`/courses/${courseId}`);
        const course = result.data.course;
        const lessons = result.data.lessons || [];
        const isEnrolled = result.data.is_enrolled;

        let whatYouLearn = [];
        if (course.what_you_learn) {
            if (typeof course.what_you_learn === 'string') {
                try {
                    whatYouLearn = JSON.parse(course.what_you_learn);
                } catch (e) {
                    whatYouLearn = [];
                }
            } else {
                whatYouLearn = course.what_you_learn;
            }
        }

        const whatLearnHtml = whatYouLearn.map(i => `<li>${i}</li>`).join('');
        const lessonsHtml = lessons.map((l, idx) => `
            <div class="lesson-item">
                <span class="lesson-num">${String(idx + 1).padStart(2, '0')}</span>
                <span class="lesson-name">${l.title}</span>
                <span class="lesson-dur">${l.duration}</span>
                <span class="lesson-lock">${isEnrolled ? '▶' : '🔒'}</span>
            </div>`).join('');

        const enrollBtn = isEnrolled
            ? `<button class="btn-primary full-width" onclick="navigate('learning', {courseId: ${course.id}})">Continue Learning →</button>`
            : `<button class="btn-primary full-width" onclick="enrollInCourse(${course.id})">Enroll for Free</button>`;

        document.getElementById('courseDetailContent').innerHTML = `
            <div class="course-detail-hero">
                <div class="course-detail-hero-inner">
                    <div>
                        <div class="detail-breadcrumb">
                            <a href="#" onclick="navigate('courses')" style="color:rgba(255,255,255,.5)">Courses</a>
                            <span> / ${course.category}</span>
                        </div>
                        <h1 class="detail-title">${course.title}</h1>
                        <p class="detail-desc">${course.description}</p>
                        <div class="detail-meta">
                            <div class="detail-meta-item">⭐ <strong>${course.rating}</strong> Rating</div>
                            <div class="detail-meta-item">👥 <strong>${course.enrolled_count?.toLocaleString() || 0}</strong> Students</div>
                            <div class="detail-meta-item">⏱ <strong>${course.duration}</strong></div>
                            <div class="detail-meta-item">📊 <strong>${course.difficulty_level}</strong></div>
                            <div class="detail-meta-item">👤 <strong>${course.instructor_name}</strong></div>
                        </div>
                    </div>
                    <div class="detail-enroll-card">
                        <div class="course-img"><div class="thumb-placeholder">${course.icon || '📚'}</div></div>
                        <div class="enroll-card-price">Free <span>Open Access</span></div>
                        <ul class="enroll-card-includes">
                            <li>📹 ${lessons.length} video lessons</li>
                            <li>♾️ Full lifetime access</li>
                            <li>📝 Quiz with certificate</li>
                            <li>🏆 Verifiable certificate</li>
                            <li>📱 Access on all devices</li>
                        </ul>
                        ${enrollBtn}
                    </div>
                </div>
            </div>
            <div class="course-detail-body">
                <div>
                    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:28px;margin-bottom:24px;">
                        <h2 style="font-family:var(--font-display);font-weight:800;font-size:1.5rem;margin-bottom:16px;">What You'll Learn</h2>
                        <ul class="what-learn-list">${whatLearnHtml || '<li>Course content will be added soon</li>'}</ul>
                    </div>
                    <div class="curriculum-section" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:28px;">
                        <h2>Course Curriculum</h2>
                        <p style="color:var(--ink-muted);font-size:14px;margin-bottom:16px;">${lessons.length} lessons • ${course.duration} total</p>
                        ${lessonsHtml}
                    </div>
                </div>
                <div>
                    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;">
                        <h3 style="font-family:var(--font-display);font-weight:700;margin-bottom:16px;">About the Instructor</h3>
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                            <div style="width:48px;height:48px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;">${course.instructor_name.charAt(0)}</div>
                            <div><strong>${course.instructor_name}</strong><br><small style="color:var(--ink-muted)">Industry Expert</small></div>
                        </div>
                        <p style="font-size:14px;color:var(--ink-muted);">An experienced professional with years of industry expertise in ${course.category}.</p>
                    </div>
                </div>
            </div>`;
    } catch (error) {
        console.error('Error loading course detail:', error);
        showToast('Error loading course details', 'error');
    }
}

function quickEnroll(courseId) {
    if (!currentUser) { openModal('auth', 'login'); return; }
    enrollInCourse(courseId);
}

async function enrollInCourse(courseId) {
    if (!currentUser) { openModal('auth', 'login'); return; }

    try {
        await apiCall('/enrollments', {
            method: 'POST',
            body: JSON.stringify({ course_id: courseId })
        });
        showToast('Enrolled successfully! 🎉 Starting your learning...');
        navigate('learning', { courseId });
    } catch (error) {
        if (error.message.includes('already')) {
            navigate('learning', { courseId });
        } else {
            showToast(error.message || 'Enrollment failed', 'error');
        }
    }
}

// ============================================================
// LEARNING MODULE
// ============================================================
let currentLearningCourse = null;
let currentLesson = null;
let learningLessons = [];

async function renderLearningPage(courseId) {
    if (!courseId || !currentUser) return;

    try {
        const courseResult = await apiCall(`/courses/${courseId}`);
        const course = courseResult.data.course;
        currentLearningCourse = course;

        const lessonsResult = await apiCall(`/courses/${courseId}/lessons`);
        learningLessons = lessonsResult.data.lessons || [];
        const completedIds = lessonsResult.data.completed_ids || [];

        const totalLessons = learningLessons.length;
        const completedCount = completedIds.length;
        const progressPct = totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0;

        document.getElementById('learningCourseTitle').textContent = course.title;
        document.getElementById('learningProgressBar').style.width = `${progressPct}%`;
        document.getElementById('learningProgressText').textContent = `${progressPct}% complete`;

        const listEl = document.getElementById('lessonsList');
        listEl.innerHTML = learningLessons.map(l => {
            const done = completedIds.includes(l.id);
            return `
                <li class="lesson-list-item ${done ? 'completed' : ''}" id="lesson-li-${l.id}" onclick="loadLesson(${l.id})">
                    <span class="lesson-check">${done ? '✓' : '○'}</span>
                    <div class="lesson-item-info">
                        <div class="lesson-item-title">${l.title}</div>
                        <div class="lesson-item-dur">${l.duration}</div>
                    </div>
                </li>`;
        }).join('');

        const quizResult = await apiCall(`/quiz/course/${courseId}`).catch(() => null);
        document.getElementById('takeQuizBtn').style.display = quizResult ? 'inline-flex' : 'none';

        if (learningLessons.length > 0) loadLesson(learningLessons[0].id);
    } catch (error) {
        console.error('Error loading learning page:', error);
        showToast('Error loading course content', 'error');
    }
}

function loadLesson(lessonId) {
    const lesson = learningLessons.find(l => l.id === lessonId);
    if (!lesson) return;
    currentLesson = lesson;

    document.querySelectorAll('.lesson-list-item').forEach(li => li.classList.remove('active'));
    const activeLi = document.getElementById(`lesson-li-${lessonId}`);
    if (activeLi) activeLi.classList.add('active');

    document.getElementById('lessonMainTitle').textContent = lesson.title;
    document.getElementById('lessonDescription').textContent = lesson.description || 'Watch the video lesson to continue your learning journey.';

    const videoPlayer = document.getElementById('videoPlayer');
    const youtubeEmbed = document.getElementById('youtubeEmbed');
    const youtubeFrame = document.getElementById('youtubeFrame');
    const videoPlaceholder = document.getElementById('videoPlaceholder');
    document.getElementById('currentLessonTitle').textContent = lesson.title;

    // Reset all
    videoPlayer.classList.add('hidden');
    youtubeEmbed.classList.add('hidden');
    videoPlaceholder.classList.remove('hidden');
    videoPlayer.pause();

    if (lesson.video_url && lesson.video_url.trim() !== '') {
        const url = lesson.video_url.trim();

        // Check if it's a YouTube URL (any format)
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // Use the exact URL as-is in the iframe
            let embedUrl = url;

            // If it's a youtube.com/watch?v= format, convert to embed for better compatibility
            if (url.includes('youtube.com/watch')) {
                const videoIdMatch = url.match(/[?&]v=([^&]+)/);
                if (videoIdMatch && videoIdMatch[1]) {
                    embedUrl = `https://www.youtube.com/embed/${videoIdMatch[1]}`;
                }
            }
            // If it's youtu.be/ format, convert to embed
            else if (url.includes('youtu.be/')) {
                const videoIdMatch = url.match(/youtu\.be\/([^?]+)/);
                if (videoIdMatch && videoIdMatch[1]) {
                    embedUrl = `https://www.youtube.com/embed/${videoIdMatch[1].split('?')[0]}`;
                }
            }

            youtubeFrame.src = embedUrl;
            youtubeEmbed.classList.remove('hidden');
            videoPlaceholder.classList.add('hidden');
        }
        // Check if it's a direct video file
        else if (url.match(/\.(mp4|webm|ogg)$/i)) {
            videoPlayer.src = url;
            videoPlayer.classList.remove('hidden');
            videoPlaceholder.classList.add('hidden');
        }
        // For other URLs, try to embed directly
        else {
            youtubeFrame.src = url;
            youtubeEmbed.classList.remove('hidden');
            videoPlaceholder.classList.add('hidden');
        }
    }

    const markBtn = document.getElementById('markCompleteBtn');
    if (lesson.is_completed) {
        markBtn.textContent = '✓ Completed';
        markBtn.disabled = true;
        markBtn.style.opacity = '.6';
    } else {
        markBtn.textContent = 'Mark Complete ✓';
        markBtn.disabled = false;
        markBtn.style.opacity = '1';
    }
}

async function markLessonComplete() {
    if (!currentUser || !currentLesson || !currentLearningCourse) return;

    try {
        await apiCall(`/progress/${currentLesson.id}`, {
            method: 'POST',
            body: JSON.stringify({ is_completed: true })
        });

        currentLesson.is_completed = true;

        const li = document.getElementById(`lesson-li-${currentLesson.id}`);
        if (li) {
            li.classList.add('completed');
            li.querySelector('.lesson-check').textContent = '✓';
        }

        const markBtn = document.getElementById('markCompleteBtn');
        markBtn.textContent = '✓ Completed';
        markBtn.disabled = true;
        markBtn.style.opacity = '.6';

        showToast('Lesson marked complete! 🎉');

        await renderLearningPage(currentLearningCourse.id);
    } catch (error) {
        showToast(error.message || 'Error marking lesson complete', 'error');
    }
}

// ============================================================
// QUIZ MODULE
// ============================================================
let currentQuiz = null;
let currentQuizIndex = 0;
let quizAnswers = [];
let quizQuestions = [];

async function openQuiz() {
    if (!currentUser || !currentLearningCourse) return;

    try {
        const result = await apiCall(`/quiz/course/${currentLearningCourse.id}`);
        currentQuiz = result.data.quiz;
        quizQuestions = currentQuiz.questions || [];
        currentQuizIndex = 0;
        quizAnswers = new Array(quizQuestions.length).fill(null);

        renderQuizQuestion();
        openModal('quiz');
    } catch (error) {
        showToast(error.message || 'No quiz available for this course.', 'error');
    }
}

function renderQuizQuestion() {
    const q = quizQuestions[currentQuizIndex];
    const total = quizQuestions.length;
    const selected = quizAnswers[currentQuizIndex];

    const optionsHtml = q.options.map((opt, idx) => `
        <div class="quiz-option ${selected === idx ? 'selected' : ''}" onclick="selectQuizAnswer(${idx})">
            <span style="font-weight:700;margin-right:8px;">${String.fromCharCode(65 + idx)}.</span>${opt}
        </div>`).join('');

    document.getElementById('quizContent').innerHTML = `
        <div class="quiz-header">
            <h2>Quiz: ${currentLearningCourse.title}</h2>
            <p style="color:var(--ink-muted);font-size:14px;">Pass with ${currentQuiz.passing_score}% to earn your certificate</p>
        </div>
        <div class="quiz-question">
            <p><strong>Q${currentQuizIndex + 1}.</strong> ${q.text}</p>
            <div class="quiz-options">${optionsHtml}</div>
        </div>
        <div class="quiz-nav">
            <span class="quiz-progress-text">Question ${currentQuizIndex + 1} of ${total}</span>
            <div style="display:flex;gap:8px;">
                ${currentQuizIndex > 0 ? `<button class="btn-ghost" onclick="quizNavPrev()">← Back</button>` : ''}
                ${currentQuizIndex < total - 1
            ? `<button class="btn-primary" onclick="quizNavNext()" ${selected === null ? 'disabled style="opacity:.5"' : ''}>Next →</button>`
            : `<button class="btn-primary" onclick="submitQuiz()" ${selected === null ? 'disabled style="opacity:.5"' : ''}>Submit Quiz</button>`}
            </div>
        </div>`;
}

function selectQuizAnswer(optIdx) {
    quizAnswers[currentQuizIndex] = optIdx;
    renderQuizQuestion();
}

function quizNavNext() {
    if (quizAnswers[currentQuizIndex] === null) return;
    currentQuizIndex++;
    renderQuizQuestion();
}

function quizNavPrev() {
    currentQuizIndex--;
    renderQuizQuestion();
}

async function submitQuiz() {
    const answers = {};
    quizQuestions.forEach((q, idx) => {
        if (quizAnswers[idx] !== null) {
            answers[q.id] = String.fromCharCode(65 + quizAnswers[idx]);
        }
    });

    try {
        const result = await apiCall(`/quiz/${currentQuiz.id}/submit`, {
            method: 'POST',
            body: JSON.stringify({ answers })
        });

        const data = result.data;
        const passed = data.passed;
        const score = data.score;
        const icon = passed ? '🎉' : '😞';
        const resultColor = passed ? 'var(--green)' : 'var(--red)';

        document.getElementById('quizContent').innerHTML = `
            <div class="quiz-result">
                <div class="quiz-result-icon">${icon}</div>
                <h2 style="color:${resultColor}">${passed ? 'Congratulations!' : 'Not Quite There'}</h2>
                <div class="score" style="color:${resultColor}">${score}%</div>
                <p>${data.message}</p>
                <div class="result-actions">
                    ${passed && data.cert_id
                ? `<button class="btn-primary" onclick="closeModal();viewCertificate('${data.cert_id}')">View Certificate 🏆</button>`
                : ''}
                    <button class="btn-outline" onclick="closeModal()">Close</button>
                    ${!passed ? `<button class="btn-ghost" onclick="retakeQuiz()">Retake Quiz</button>` : ''}
                </div>
            </div>`;
    } catch (error) {
        showToast(error.message || 'Error submitting quiz', 'error');
    }
}

function retakeQuiz() {
    currentQuizIndex = 0;
    quizAnswers = new Array(quizQuestions.length).fill(null);
    renderQuizQuestion();
}

// ============================================================
// CERTIFICATE MODULE
// ============================================================

async function viewCertificate(certId) {
    try {
        const result = await apiCall(`/verify/${certId}`);
        const cert = result.data.certificate;

        document.getElementById('certPreview').innerHTML = `
            <div class="cert-top-decoration">
                <span style="font-size:32px">⚡</span>
                <div class="cert-logo-txt">SMPS<em>Course</em></div>
            </div>
            <div class="cert-watermark">🏆</div>
            <h2>Certificate of Completion</h2>
            <p class="cert-sub">This is to certify that</p>
            <div class="cert-name">${cert.student_name}</div>
            <p class="cert-sub">has successfully completed the course</p>
            <div class="cert-course-name">${cert.course_title}</div>
            <div class="cert-divider"></div>
            <p style="font-size:13px;color:var(--ink-muted);">Instructor: ${cert.instructor_name} &nbsp;|&nbsp; Level: ${cert.difficulty_level}</p>
            <div class="cert-meta">
                <div><strong>Issued</strong><br><span>${cert.issued_at?.split('T')[0] || cert.issued_at}</span></div>
                <div><strong>Certificate ID</strong><br><span style="font-family:var(--font-mono)">${cert.certificate_code}</span></div>
                <div><strong>Valid</strong><br><span>Lifetime</span></div>
            </div>`;
        window._currentCertId = certId;
        openModal('cert');
    } catch (error) {
        showToast('Certificate not found.', 'error');
    }
}

function downloadCertificate() {
    if (window._currentCertId) {
        window.open(`${API_BASE_URL}/certificates/${window._currentCertId}/download`, '_blank');
    } else {
        showToast('No certificate selected.', 'error');
    }
}

function verifyCertFromModal() {
    closeModal();
    navigate('verify');
    setTimeout(() => {
        document.getElementById('verifyCertId').value = window._currentCertId || '';
    }, 200);
}

async function verifyCertificate() {
    const certId = document.getElementById('verifyCertId').value.trim();
    const resultEl = document.getElementById('verifyResult');

    if (!certId) { showToast('Please enter a certificate ID.', 'error'); return; }

    try {
        const result = await apiCall(`/verify/${certId}`);
        const cert = result.data.certificate;

        resultEl.className = 'verify-result valid';
        resultEl.innerHTML = `
            <h3>✅ Valid Certificate</h3>
            <p><strong>Recipient:</strong> ${cert.student_name}</p>
            <p><strong>Course:</strong> ${cert.course_title}</p>
            <p><strong>Issued:</strong> ${cert.issued_at?.split('T')[0] || cert.issued_at}</p>
            <p><strong>ID:</strong> <span style="font-family:var(--font-mono)">${cert.certificate_code}</span></p>`;
        resultEl.classList.remove('hidden');
    } catch (error) {
        resultEl.className = 'verify-result invalid';
        resultEl.innerHTML = `
            <h3>❌ Certificate Not Found</h3>
            <p>The ID <strong>${certId}</strong> was not found in our records. Please check and try again.</p>`;
        resultEl.classList.remove('hidden');
    }
}

async function renderCertificatesPage() {
    if (!currentUser) return;

    try {
        const result = await apiCall('/certificates/mine');
        const myCerts = result.data.certificates || [];
        const grid = document.getElementById('certificatesGrid');

        if (!myCerts.length) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🏆</div><h3>No certificates yet</h3><p>Complete a course and pass the quiz to earn your first certificate.</p><button class="btn-primary" style="margin-top:16px" onclick="navigate('courses')">Browse Courses</button></div>`;
            return;
        }

        grid.innerHTML = myCerts.map(cert => `
            <div class="certificate-card" onclick="viewCertificate('${cert.certificate_code}')">
                <div class="cert-badge">🏆</div>
                <div class="cert-card-title">${cert.course_title}</div>
                <div class="cert-card-id">${cert.certificate_code}</div>
                <div class="cert-card-date">Issued ${cert.issued_at?.split('T')[0] || cert.issued_at}</div>
                <button class="btn-primary" style="margin-top:16px" onclick="event.stopPropagation();viewCertificate('${cert.certificate_code}')">View Certificate</button>
            </div>`).join('');
    } catch (error) {
        console.error('Error loading certificates:', error);
    }
}

// ============================================================
// DASHBOARD MODULE
// ============================================================

async function renderDashboard() {
    if (!currentUser) return;

    document.getElementById('dashGreeting').textContent = `Welcome back, ${currentUser.full_name.split(' ')[0]}! 👋`;

    try {
        const result = await apiCall('/dashboard');
        const data = result.data;
        const stats = data.stats;
        const enrollments = data.enrolled_courses || [];

        document.getElementById('dashStats').innerHTML = `
            <div class="dash-stat"><div class="stat-value">${stats.total_enrolled}</div><div class="stat-label">Enrolled Courses</div></div>
            <div class="dash-stat"><div class="stat-value">${stats.total_completed}</div><div class="stat-label">Completed</div></div>
            <div class="dash-stat"><div class="stat-value">${stats.total_certificates}</div><div class="stat-label">Certificates Earned</div></div>
            <div class="dash-stat"><div class="stat-value">${stats.avg_progress}%</div><div class="stat-label">Avg. Progress</div></div>`;

        const enrolledCoursesGrid = document.getElementById('enrolledCoursesGrid');
        if (!enrollments.length) {
            enrolledCoursesGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><h3>No courses yet</h3><p>Browse our catalog and enroll in your first course!</p><button class="btn-primary" style="margin-top:16px" onclick="navigate('courses')">Browse Courses</button></div>`;
        } else {
            enrolledCoursesGrid.innerHTML = enrollments.map(e => buildCourseCard(e, true)).join('');
        }

        const certificates = data.certificates || [];
        if (!certificates.length) {
            document.getElementById('dashCertList').innerHTML = `<p style="color:var(--ink-muted);font-size:14px;">No certificates yet. Complete a course quiz to earn one!</p>`;
        } else {
            document.getElementById('dashCertList').innerHTML = certificates.map(cert => `
                <div class="cert-mini-card" onclick="viewCertificate('${cert.certificate_code}')">
                    <div class="cert-mini-icon">🏆</div>
                    <div class="cert-mini-info">
                        <strong>${cert.course_title}</strong>
                        <span>${cert.certificate_code}</span>
                    </div>
                </div>`).join('');
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Error loading dashboard', 'error');
    }
}

// ============================================================
// ADMIN MODULE - Complete Admin Functions
// ============================================================

function adminTab(tab) {
    document.querySelectorAll('.admin-panel').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    document.querySelectorAll('.admin-nav-link').forEach(l => l.classList.remove('active'));
    const panel = document.getElementById(`admin-panel-${tab}`);
    const link = document.getElementById(`atab-${tab}`);
    if (panel) { panel.classList.remove('hidden'); panel.classList.add('active'); }
    if (link) link.classList.add('active');

    const renderers = {
        dashboard: renderAdminDashboard,
        courses: renderAdminCourses,
        users: renderAdminUsers,
        quizzes: renderAdminQuizzes,
        certificates: renderAdminCertificates,
    };
    if (renderers[tab]) renderers[tab]();
}

async function renderAdminDashboard() {
    try {
        const result = await apiCall('/admin/dashboard');
        const data = result.data;
        const stats = data.stats;

        document.getElementById('adminStatsGrid').innerHTML = `
            <div class="admin-stat-card"><div class="stat-value">${stats.users}</div><div class="stat-label">Total Users</div></div>
            <div class="admin-stat-card"><div class="stat-value">${stats.courses}</div><div class="stat-label">Total Courses</div></div>
            <div class="admin-stat-card"><div class="stat-value">${stats.enrollments}</div><div class="stat-label">Enrollments</div></div>
            <div class="admin-stat-card"><div class="stat-value">${stats.certificates}</div><div class="stat-label">Certificates Issued</div></div>`;

        const recentBody = document.getElementById('recentEnrollmentsBody');
        const recent = data.recent_enrollments || [];
        recentBody.innerHTML = recent.map(e => `
            <tr>
                <td>${e.full_name}</td>
                <td>${e.course_title}</td>
                <td>${e.enrolled_at?.split('T')[0] || e.enrolled_at}</td>
            </tr>
        `).join('');

        const topCoursesList = document.getElementById('topCoursesList');
        const topCourses = data.top_courses || [];
        topCoursesList.innerHTML = topCourses.map((c, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
                <span style="font-weight:800;color:var(--accent);font-family:var(--font-mono);width:20px">${i + 1}</span>
                <span style="flex:1;font-size:13px">${c.title}</span>
                <span style="font-size:12px;color:var(--ink-muted)">${c.enrollment_count} enrolled</span>
            </div>`).join('');
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        showToast('Error loading dashboard', 'error');
    }
}

// Admin Courses Functions
async function renderAdminCourses() {
    try {
        const result = await apiCall('/admin/courses', { method: 'GET' });
        const courses = result.data.courses || [];
        const body = document.getElementById('adminCoursesBody');

        if (!courses.length) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center">No courses found</td></tr>';
            return;
        }

        body.innerHTML = courses.map(c => `
            <tr>
                <td><strong>${c.title}</strong></td>
                <td>${c.category}</td>
                <td>${c.difficulty_level}</td>
                <td>${c.enrolled_count || 0}</td>
                <td>
                    <button class="admin-action-btn edit" onclick="editCourse(${c.id})">Edit</button>
                    <button class="admin-action-btn delete" onclick="deleteCourse(${c.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading admin courses:', error);
        document.getElementById('adminCoursesBody').innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red)">Error loading courses: ${error.message}</td></tr>`;
    }
}

function openAddCourseForm() {
    document.getElementById('courseFormTitle').textContent = 'Add New Course';
    document.getElementById('editCourseId').value = '';
    document.getElementById('courseTitle').value = '';
    document.getElementById('courseCategory').value = '';
    document.getElementById('courseLevel').value = 'Beginner';
    document.getElementById('courseDuration').value = '';
    document.getElementById('courseDesc').value = '';
    document.getElementById('courseThumbnail').value = '';
    document.getElementById('courseInstructor').value = '';
    document.getElementById('lessonsFormList').innerHTML = '';
    document.getElementById('addCourseForm').classList.remove('hidden');
}

function cancelCourseForm() {
    document.getElementById('addCourseForm').classList.add('hidden');
}

function addLessonField() {
    const list = document.getElementById('lessonsFormList');
    const idx = list.children.length + 1;
    const div = document.createElement('div');
    div.className = 'lesson-form-item';
    div.innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>Lesson ${idx} Title</label><input type="text" placeholder="Lesson title" class="lf-title" /></div>
            <div class="form-group"><label>Duration</label><input type="text" placeholder="e.g. 15:00" class="lf-dur" /></div>
        </div>
        <div class="form-group"><label>Video URL (optional)</label><input type="text" placeholder="YouTube URL or video link" class="lf-url" /></div>
        <div class="form-group"><label>Description</label><input type="text" placeholder="Brief description" class="lf-desc" /></div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px">✕ Remove</button>`;
    list.appendChild(div);
}

async function saveCourse() {
    const id = document.getElementById('editCourseId').value;
    const title = document.getElementById('courseTitle').value.trim();
    const category = document.getElementById('courseCategory').value.trim();

    if (!title || !category) {
        showToast('Title and category required.', 'error');
        return;
    }

    const courseData = {
        title: title,
        category: category,
        difficulty_level: document.getElementById('courseLevel').value,
        duration: document.getElementById('courseDuration').value,
        description: document.getElementById('courseDesc').value,
        image_url: document.getElementById('courseThumbnail').value,
        instructor_name: document.getElementById('courseInstructor').value,
    };

    const lessonItems = document.querySelectorAll('.lesson-form-item');
    const lessons = Array.from(lessonItems).map((item, idx) => ({
        title: item.querySelector('.lf-title').value || `Lesson ${idx + 1}`,
        duration: item.querySelector('.lf-dur').value || '10:00',
        video_url: item.querySelector('.lf-url').value || '',
        description: item.querySelector('.lf-desc').value || '',
        lesson_order: idx + 1,
        is_preview: idx === 0 ? 1 : 0,
    }));

    courseData.lessons = lessons;

    try {
        if (id) {
            await apiCall(`/admin/courses/${id}`, {
                method: 'PUT',
                body: JSON.stringify(courseData)
            });
            showToast('Course updated! ✅');
        } else {
            await apiCall('/admin/courses', {
                method: 'POST',
                body: JSON.stringify(courseData)
            });
            showToast('Course created! ✅');
        }
        cancelCourseForm();
        renderAdminCourses();
    } catch (error) {
        showToast(error.message || 'Failed to save course', 'error');
    }
}

async function editCourse(courseId) {
    try {
        const result = await apiCall(`/courses/${courseId}`);
        const course = result.data.course;

        openAddCourseForm();
        document.getElementById('courseFormTitle').textContent = 'Edit Course';
        document.getElementById('editCourseId').value = courseId;
        document.getElementById('courseTitle').value = course.title;
        document.getElementById('courseCategory').value = course.category;
        document.getElementById('courseLevel').value = course.difficulty_level;
        document.getElementById('courseDuration').value = course.duration;
        document.getElementById('courseDesc').value = course.description;
        document.getElementById('courseThumbnail').value = course.image_url || '';
        document.getElementById('courseInstructor').value = course.instructor_name;
    } catch (error) {
        showToast('Error loading course for editing', 'error');
    }
}

async function deleteCourse(courseId) {
    if (!confirm('Delete this course? This cannot be undone.')) return;
    try {
        await apiCall(`/admin/courses/${courseId}`, { method: 'DELETE' });
        showToast('Course deleted.');
        renderAdminCourses();
    } catch (error) {
        showToast(error.message || 'Failed to delete course', 'error');
    }
}

// Admin Users Functions
async function renderAdminUsers() {
    try {
        const result = await apiCall('/admin/users', { method: 'GET' });
        const users = result.data.users || [];
        const body = document.getElementById('adminUsersBody');

        if (!users.length) {
            body.innerHTML = '<tr><td colspan="6" style="text-align:center">No users found</td></tr>';
            return;
        }

        body.innerHTML = users.map(u => `
            <tr>
                <td><strong>${u.full_name}</strong></td>
                <td>${u.email}</td>
                <td><span class="role-badge ${u.role}">${u.role}</span></td>
                <td>${u.enrolled_count || 0}</td>
                <td>${u.created_at?.split('T')[0] || u.created_at}</td>
                <td>
                    <button class="admin-action-btn delete" onclick="deleteUser(${u.id})">Remove</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading admin users:', error);
        document.getElementById('adminUsersBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red)">Error loading users</td></tr>';
    }
}

function filterAdminUsers() {
    const q = document.getElementById('userSearchInput').value.toLowerCase();
    const rows = document.querySelectorAll('#adminUsersBody tr');
    rows.forEach(row => {
        const name = row.cells[0]?.textContent.toLowerCase() || '';
        const email = row.cells[1]?.textContent.toLowerCase() || '';
        row.style.display = (name.includes(q) || email.includes(q)) ? '' : 'none';
    });
}

async function deleteUser(userId) {
    if (!confirm('Remove this user?')) return;
    if (userId === currentUser?.id) {
        showToast("You can't delete yourself.", 'error');
        return;
    }
    try {
        await apiCall(`/admin/users/${userId}`, { method: 'DELETE' });
        showToast('User removed.');
        renderAdminUsers();
    } catch (error) {
        showToast(error.message || 'Failed to delete user', 'error');
    }
}

// Admin Quizzes Functions
async function renderAdminQuizzes() {
    try {
        const result = await apiCall('/admin/quizzes', { method: 'GET' });
        const quizzes = result.data.quizzes || [];
        const body = document.getElementById('adminQuizzesBody');

        if (!quizzes.length) {
            body.innerHTML = '<tr><td colspan="4" style="text-align:center">No quizzes found</td></tr>';
            return;
        }

        body.innerHTML = quizzes.map(q => `
            <tr>
                <td>${q.course_title || '-'}</td>
                <td>${q.question_count || 0}</td>
                <td>${q.passing_score}%</td>
                <td>
                    <button class="admin-action-btn edit" onclick="editQuiz(${q.id})">Edit</button>
                    <button class="admin-action-btn delete" onclick="deleteQuiz(${q.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading admin quizzes:', error);
        document.getElementById('adminQuizzesBody').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--red)">Error loading quizzes</td></tr>';
    }
}

function openAddQuizForm() {
    document.getElementById('editQuizId').value = '';
    document.getElementById('questionsFormList').innerHTML = '';
    addQuestionField();
    document.getElementById('addQuizForm').classList.remove('hidden');
}

function cancelQuizForm() {
    document.getElementById('addQuizForm').classList.add('hidden');
}

function addQuestionField() {
    const list = document.getElementById('questionsFormList');
    const idx = list.children.length + 1;
    const div = document.createElement('div');
    div.className = 'question-form-item';
    div.innerHTML = `
        <div class="form-group"><label>Question ${idx}</label><input type="text" class="q-text" placeholder="Enter question..." /></div>
        <div class="form-row">
            <div class="form-group"><label>Option A</label><input type="text" class="q-opt-0" placeholder="Option A" /></div>
            <div class="form-group"><label>Option B</label><input type="text" class="q-opt-1" placeholder="Option B" /></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Option C</label><input type="text" class="q-opt-2" placeholder="Option C" /></div>
            <div class="form-group"><label>Option D</label><input type="text" class="q-opt-3" placeholder="Option D" /></div>
        </div>
        <div class="form-group"><label>Correct Answer (0=A, 1=B, 2=C, 3=D)</label>
            <select class="q-correct"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select>
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px">✕ Remove Question</button>`;
    list.appendChild(div);
}

async function saveQuiz() {
    const courseId = parseInt(document.getElementById('quizCourseSelect').value);
    const questionItems = document.querySelectorAll('.question-form-item');

    if (!courseId) {
        showToast('Please select a course.', 'error');
        return;
    }

    const questions = Array.from(questionItems).map((item) => ({
        question_text: item.querySelector('.q-text').value || '',
        option_a: item.querySelector('.q-opt-0').value || '',
        option_b: item.querySelector('.q-opt-1').value || '',
        option_c: item.querySelector('.q-opt-2').value || '',
        option_d: item.querySelector('.q-opt-3').value || '',
        correct_answer: ['A', 'B', 'C', 'D'][parseInt(item.querySelector('.q-correct').value)],
        points: 1,
    }));

    const quizData = {
        course_id: courseId,
        title: 'Course Quiz',
        passing_score: 70,
        questions: questions
    };

    const editId = document.getElementById('editQuizId').value;

    try {
        if (editId) {
            await apiCall(`/admin/quizzes/${editId}`, { method: 'DELETE' });
            await apiCall('/admin/quizzes', {
                method: 'POST',
                body: JSON.stringify(quizData)
            });
            showToast('Quiz updated! ✅');
        } else {
            await apiCall('/admin/quizzes', {
                method: 'POST',
                body: JSON.stringify(quizData)
            });
            showToast('Quiz created! ✅');
        }
        cancelQuizForm();
        renderAdminQuizzes();
    } catch (error) {
        showToast(error.message || 'Failed to save quiz', 'error');
    }
}

async function editQuiz(quizId) {
    try {
        const result = await apiCall(`/admin/quizzes/${quizId}`);
        const quiz = result.data.quiz;

        openAddQuizForm();
        document.getElementById('editQuizId').value = quizId;
        document.getElementById('quizCourseSelect').value = quiz.course_id;

        document.getElementById('questionsFormList').innerHTML = '';
        quiz.questions.forEach((q, idx) => {
            addQuestionField();
            const items = document.querySelectorAll('.question-form-item');
            const lastItem = items[items.length - 1];
            lastItem.querySelector('.q-text').value = q.question_text;
            lastItem.querySelector('.q-opt-0').value = q.option_a;
            lastItem.querySelector('.q-opt-1').value = q.option_b;
            lastItem.querySelector('.q-opt-2').value = q.option_c || '';
            lastItem.querySelector('.q-opt-3').value = q.option_d || '';
            const correctMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
            lastItem.querySelector('.q-correct').value = correctMap[q.correct_answer] || 0;
        });
    } catch (error) {
        showToast('Error loading quiz for editing', 'error');
    }
}

async function deleteQuiz(quizId) {
    if (!confirm('Delete this quiz?')) return;
    try {
        await apiCall(`/admin/quizzes/${quizId}`, { method: 'DELETE' });
        showToast('Quiz deleted.');
        renderAdminQuizzes();
    } catch (error) {
        showToast(error.message || 'Failed to delete quiz', 'error');
    }
}

// Admin Certificates Functions
async function renderAdminCertificates() {
    try {
        const result = await apiCall('/admin/certificates', { method: 'GET' });
        const certs = result.data.certificates || [];
        const body = document.getElementById('adminCertsBody');

        if (!certs.length) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center">No certificates found</td></tr>';
            return;
        }

        body.innerHTML = certs.map(c => `
            <tr>
                <td style="font-family:var(--font-mono);font-size:12px">${c.certificate_code}</td>
                <td>${c.student_name || '-'}</td>
                <td>${c.course_title || '-'}</td>
                <td>${c.issued_at?.split('T')[0] || c.issued_at}</td>
                <td>
                    <button class="admin-action-btn view" onclick="viewCertificate('${c.certificate_code}')">View</button>
                    <button class="admin-action-btn delete" onclick="revokeAdminCert(${c.id})">Revoke</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading admin certificates:', error);
        document.getElementById('adminCertsBody').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red)">Error loading certificates</td></tr>';
    }
}

async function issueCertificateAdmin() {
    const userId = prompt('Enter User ID:');
    if (!userId) return;
    const courseId = prompt('Enter Course ID:');
    if (!courseId) return;

    try {
        const result = await apiCall('/admin/certificates', {
            method: 'POST',
            body: JSON.stringify({ user_id: parseInt(userId), course_id: parseInt(courseId) })
        });
        showToast(`Certificate issued: ${result.data.certificate_code}`, 'success');
        renderAdminCertificates();
    } catch (error) {
        showToast(error.message || 'Failed to issue certificate', 'error');
    }
}

async function revokeAdminCert(certId) {
    if (!confirm('Revoke this certificate?')) return;
    try {
        await apiCall(`/admin/certificates/${certId}`, { method: 'DELETE' });
        showToast('Certificate revoked.');
        renderAdminCertificates();
    } catch (error) {
        showToast(error.message || 'Failed to revoke certificate', 'error');
    }
}

// ============================================================
// UTILITY HELPERS
// ============================================================

function openModal(type, subtype) {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('hidden');

    if (type === 'auth') {
        const modal = document.getElementById('authModal');
        modal.classList.remove('hidden');
        switchAuthTab(subtype || 'login');
        document.getElementById('loginError').classList.add('hidden');
        document.getElementById('signupError').classList.add('hidden');
    } else if (type === 'cert') {
        document.getElementById('certModal').classList.remove('hidden');
    } else if (type === 'quiz') {
        document.getElementById('quizModal').classList.remove('hidden');
    }
}

function closeModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
    document.getElementById('authModal').classList.add('hidden');
    document.getElementById('certModal').classList.add('hidden');
    document.getElementById('quizModal').classList.add('hidden');
}

function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 3500);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadCurrentUser();
    updateNavForUser();
    renderHome();

    if (window.location.hash) {
        const page = window.location.hash.replace('#', '');
        if (['courses', 'verify'].includes(page)) navigate(page);
    }
});
