"""
============================================================
SMPS COURSE PLATFORM — BACKEND API (Flask + MySQL)
Single-file REST API

Run:
  pip install flask flask-cors mysql-connector-python PyJWT
  pip install reportlab qrcode pillow
  python backend.py

MySQL: Create database 'smps_course_db' and run schema.sql first
Default admin: admin@smps.com / admin123
Default student: student@smps.com / student123
============================================================
"""

# ============================================================
# SECTION 1: IMPORTS & INITIALIZATION
# ============================================================
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import hashlib
import uuid
import json
from datetime import datetime, timedelta
import jwt
import os
from functools import wraps
import io

# PDF & QR (optional — gracefully skipped if not installed)
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib.enums import TA_CENTER
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    print("⚠  reportlab not installed. PDF generation disabled.")

try:
    import qrcode
    QRCODE_AVAILABLE = True
except ImportError:
    QRCODE_AVAILABLE = False
    print("⚠  qrcode not installed. QR generation disabled.")

# ── App setup ────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

app.config['SECRET_KEY']    = 'smps_course_secret_key_2024_change_in_prod'
app.config['JWT_EXPIRATION'] = 24   # hours


# ============================================================
# SECTION 2: DATABASE CONNECTION
# ============================================================
DB_CONFIG = {
    'host':      'localhost',
    'database':  'smps_course_db',
    'user':      'root',
    'password':  '',  # Empty password for local MySQL
    'autocommit': True,
    'charset':   'utf8mb4',
}

def get_db():
    """Return a fresh MySQL connection. Returns None on failure."""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"[DB ERROR] {e}")
        return None

def db_query(sql, params=None, one=False):
    """Run a SELECT and return list-of-dicts (or single dict)."""
    conn = get_db()
    if not conn:
        return None if one else []
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(sql, params or ())
        result = cursor.fetchone() if one else cursor.fetchall()
        return result
    except Error as e:
        print(f"[QUERY ERROR] {e}")
        return None if one else []
    finally:
        cursor.close()
        conn.close()

def db_exec(sql, params=None):
    """Run INSERT / UPDATE / DELETE. Returns lastrowid."""
    conn = get_db()
    if not conn:
        return None
    cursor = conn.cursor()
    try:
        cursor.execute(sql, params or ())
        conn.commit()
        return cursor.lastrowid
    except Error as e:
        print(f"[EXEC ERROR] {e}")
        conn.rollback()
        return None
    finally:
        cursor.close()
        conn.close()


# ============================================================
# SECTION 3: HELPERS & UTILITIES
# ============================================================

def hash_password(password):
    """SHA-256 hash. Use bcrypt in production."""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password, hashed):
    return hash_password(password) == hashed

def generate_cert_id():
    """SMPS-YYYY-XXXXXXX format unique certificate ID."""
    year   = datetime.now().year
    suffix = str(uuid.uuid4()).replace('-', '')[:7].upper()
    return f"SMPS-{year}-{suffix}"

def make_token(user_id, role):
    """Encode JWT with user_id and role."""
    payload = {
        'user_id': user_id,
        'role':    role,
        'exp':     datetime.utcnow() + timedelta(hours=app.config['JWT_EXPIRATION']),
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

def decode_token(token):
    """Decode JWT. Returns payload dict or None."""
    try:
        return jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def ok(data, status=200):
    """Standard success response."""
    return jsonify({'success': True,  'data': data}), status

def err(message, status=400):
    """Standard error response."""
    return jsonify({'success': False, 'error': message}), status

def paginate(items, page=1, per_page=12):
    """Slice a list for pagination."""
    start = (page - 1) * per_page
    return {
        'items':  items[start: start + per_page],
        'total':  len(items),
        'page':   page,
        'pages':  max(1, (len(items) + per_page - 1) // per_page),
    }

# ── Auth decorators ──────────────────────────────────────────
def token_required(f):
    """Verify Bearer JWT in Authorization header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return err('Authentication token missing.', 401)
        token   = auth_header.split(' ', 1)[1]
        payload = decode_token(token)
        if not payload:
            return err('Token is invalid or expired.', 401)
        return f(payload['user_id'], payload['role'], *args, **kwargs)
    return decorated

def admin_required(f):
    """Must be called after @token_required."""
    @wraps(f)
    def decorated(current_user_id, current_user_role, *args, **kwargs):
        if current_user_role != 'admin':
            return err('Admin access required.', 403)
        return f(current_user_id, current_user_role, *args, **kwargs)
    return decorated

# ── Progress helpers ─────────────────────────────────────────
def recalc_progress(user_id, course_id):
    """Recalculate course progress % and update enrollment."""
    total = db_query(
        "SELECT COUNT(*) AS cnt FROM lessons WHERE course_id = %s",
        (course_id,), one=True
    ) or {'cnt': 0}
    done = db_query(
        """SELECT COUNT(*) AS cnt FROM progress p
           JOIN lessons l ON p.lesson_id = l.id
           WHERE p.user_id = %s AND l.course_id = %s AND p.is_completed = 1""",
        (user_id, course_id), one=True
    ) or {'cnt': 0}

    pct        = int((done['cnt'] / total['cnt']) * 100) if total['cnt'] else 0
    is_done    = pct == 100
    completed_at = datetime.now() if is_done else None

    db_exec(
        """UPDATE enrollments
           SET progress_percentage = %s, is_completed = %s, completed_at = %s
           WHERE user_id = %s AND course_id = %s""",
        (pct, is_done, completed_at, user_id, course_id)
    )
    return pct


# ============================================================
# SECTION 4: AUTH ENDPOINTS
# ============================================================

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    """POST /api/auth/signup — Register new user."""
    data     = request.get_json() or {}
    username = (data.get('username') or '').strip()
    email    = (data.get('email')    or '').strip().lower()
    password = (data.get('password') or '')
    name     = (data.get('full_name') or data.get('name') or '').strip()

    if not all([username, email, password, name]):
        return err('All fields (username, email, password, full_name) are required.')
    if len(password) < 6:
        return err('Password must be at least 6 characters.')

    exists = db_query(
        "SELECT id FROM users WHERE username = %s OR email = %s",
        (username, email), one=True
    )
    if exists:
        return err('Username or email already registered.', 409)

    uid = db_exec(
        """INSERT INTO users (username, email, password_hash, full_name, role, is_active, created_at)
           VALUES (%s, %s, %s, %s, 'student', 1, %s)""",
        (username, email, hash_password(password), name, datetime.now())
    )
    if not uid:
        return err('Could not create account. Please try again.', 500)

    token = make_token(uid, 'student')
    return ok({'token': token, 'user': {'id': uid, 'username': username,
                                        'email': email, 'full_name': name,
                                        'role': 'student'}}, 201)


@app.route('/api/auth/login', methods=['POST'])
def login():
    """POST /api/auth/login — Authenticate user."""
    data       = request.get_json() or {}
    identifier = (data.get('username') or data.get('email') or '').strip()
    password   = (data.get('password') or '')

    if not identifier or not password:
        return err('Email/username and password are required.')

    user = db_query(
        "SELECT * FROM users WHERE username = %s OR email = %s",
        (identifier, identifier), one=True
    )
    if not user or not verify_password(password, user['password_hash']):
        return err('Invalid credentials.', 401)
    if not user['is_active']:
        return err('Your account has been disabled.', 403)

    token = make_token(user['id'], user['role'])
    return ok({
        'token': token,
        'user':  {
            'id':        user['id'],
            'username':  user['username'],
            'email':     user['email'],
            'full_name': user['full_name'],
            'role':      user['role'],
        }
    })


@app.route('/api/auth/me', methods=['GET'])
@token_required
def auth_me(current_user_id, current_user_role):
    """GET /api/auth/me — Return current user profile."""
    user = db_query(
        "SELECT id, username, email, full_name, role, avatar_url, created_at FROM users WHERE id = %s",
        (current_user_id,), one=True
    )
    if not user:
        return err('User not found.', 404)
    return ok({'user': user})


# ============================================================
# SECTION 5: COURSE ENDPOINTS
# ============================================================

@app.route('/api/courses', methods=['GET'])
def get_courses():
    """GET /api/courses — List published courses with optional filters."""
    category = request.args.get('category', '')
    level    = request.args.get('level', '')
    search   = request.args.get('search', '')
    sort     = request.args.get('sort', 'enrolled')
    page     = int(request.args.get('page', 1))

    where  = ["c.is_published = 1"]
    params = []

    if category:
        where.append("c.category = %s")
        params.append(category)
    if level:
        where.append("c.difficulty_level = %s")
        params.append(level)
    if search:
        where.append("(c.title LIKE %s OR c.description LIKE %s OR c.instructor_name LIKE %s)")
        like = f"%{search}%"
        params.extend([like, like, like])

    sort_map = {
        'enrolled': 'c.enrolled_count DESC',
        'rating':   'c.rating DESC',
        'newest':   'c.created_at DESC',
    }
    order_by = sort_map.get(sort, 'c.enrolled_count DESC')

    sql = f"""
        SELECT c.*,
               (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) AS lesson_count
        FROM courses c
        WHERE {' AND '.join(where)}
        ORDER BY {order_by}
    """
    courses = db_query(sql, tuple(params))
    return ok(paginate(courses, page))


@app.route('/api/courses/categories', methods=['GET'])
def get_categories():
    """GET /api/courses/categories — Distinct categories."""
    cats = db_query(
        "SELECT category, COUNT(*) AS count FROM courses WHERE is_published=1 GROUP BY category ORDER BY count DESC"
    )
    return ok({'categories': cats})


@app.route('/api/courses/<int:course_id>', methods=['GET'])
def get_course(course_id):
    """GET /api/courses/<id> — Course detail with lessons & quiz info."""
    course = db_query(
        """SELECT c.*,
                  (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) AS lesson_count,
                  (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) AS total_enrollments
           FROM courses c WHERE c.id = %s""",
        (course_id,), one=True
    )
    if not course:
        return err('Course not found.', 404)

    lessons = db_query(
        "SELECT id, title, description, duration, lesson_order, is_preview FROM lessons WHERE course_id = %s ORDER BY lesson_order",
        (course_id,)
    )
    quiz_exists = bool(db_query(
        "SELECT id FROM quizzes WHERE course_id = %s", (course_id,), one=True
    ))

    # Enrollment status
    is_enrolled = False
    enrollment  = None
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        payload = decode_token(auth_header.split(' ', 1)[1])
        if payload:
            enrollment = db_query(
                "SELECT * FROM enrollments WHERE user_id = %s AND course_id = %s",
                (payload['user_id'], course_id), one=True
            )
            is_enrolled = bool(enrollment)

    return ok({
        'course':       course,
        'lessons':      lessons,
        'quiz_available': quiz_exists,
        'is_enrolled':  is_enrolled,
        'enrollment':   enrollment,
    })


@app.route('/api/courses/<int:course_id>/lessons', methods=['GET'])
@token_required
def get_course_lessons(current_user_id, current_user_role, course_id):
    """GET /api/courses/<id>/lessons — All lessons (enrolled users only)."""
    if not db_query(
        "SELECT id FROM enrollments WHERE user_id = %s AND course_id = %s",
        (current_user_id, course_id), one=True
    ):
        return err('You must enroll in this course to view lessons.', 403)

    lessons = db_query(
        "SELECT * FROM lessons WHERE course_id = %s ORDER BY lesson_order",
        (course_id,)
    )
    completed = db_query(
        """SELECT p.lesson_id FROM progress p
           JOIN lessons l ON p.lesson_id = l.id
           WHERE p.user_id = %s AND l.course_id = %s AND p.is_completed = 1""",
        (current_user_id, course_id)
    )
    completed_ids = [r['lesson_id'] for r in completed]

    for lesson in lessons:
        lesson['is_completed'] = lesson['id'] in completed_ids

    return ok({'lessons': lessons, 'completed_ids': completed_ids})


# ── Admin course management ───────────────────────────────────

@app.route('/api/admin/courses', methods=['GET'])
@token_required
@admin_required
def admin_list_courses(current_user_id, current_user_role):
    """GET /api/admin/courses — List all courses (admin)."""
    courses = db_query(
        """SELECT id, title, description, instructor_name, category, 
                  difficulty_level, duration, price, image_url, icon, 
                  rating, enrolled_count, is_published, created_at,
                  what_you_learn
           FROM courses 
           ORDER BY created_at DESC"""
    )
    # Parse JSON fields
    for course in courses:
        if course.get('what_you_learn'):
            try:
                course['what_you_learn'] = json.loads(course['what_you_learn'])
            except:
                course['what_you_learn'] = []
        else:
            course['what_you_learn'] = []
    return ok({'courses': courses})


@app.route('/api/admin/courses', methods=['POST'])
@token_required
@admin_required
def admin_create_course(current_user_id, current_user_role):
    """POST /api/admin/courses — Create new course + lessons."""
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return err('Course title is required.')

    # Convert what_you_learn to JSON if provided
    what_you_learn = data.get('what_you_learn', [])
    if isinstance(what_you_learn, list):
        what_you_learn_json = json.dumps(what_you_learn)
    else:
        what_you_learn_json = None

    course_id = db_exec(
        """INSERT INTO courses
             (title, description, instructor_name, category, difficulty_level,
              duration, price, image_url, icon, what_you_learn, is_published, created_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1,%s)""",
        (
            title,
            data.get('description', ''),
            data.get('instructor_name', ''),
            data.get('category', 'General'),
            data.get('difficulty_level', 'Beginner'),
            data.get('duration', '0h 0m'),
            data.get('price', 0),
            data.get('image_url', ''),
            data.get('icon', '📚'),
            what_you_learn_json,
            datetime.now(),
        )
    )
    if not course_id:
        return err('Failed to create course.', 500)

    # Insert lessons if provided
    for i, lesson in enumerate(data.get('lessons', [])):
        db_exec(
            """INSERT INTO lessons (course_id, title, description, video_url, duration, lesson_order, is_preview)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (
                course_id,
                lesson.get('title', f'Lesson {i+1}'),
                lesson.get('description', ''),
                lesson.get('video_url', ''),
                lesson.get('duration', '00:00'),
                i + 1,
                lesson.get('is_preview', False),
            )
        )

    return ok({'course_id': course_id, 'message': 'Course created successfully!'}, 201)


@app.route('/api/admin/courses/<int:course_id>', methods=['PUT'])
@token_required
@admin_required
def admin_update_course(current_user_id, current_user_role, course_id):
    """PUT /api/admin/courses/<id> — Update course details."""
    data = request.get_json() or {}
    
    # Convert what_you_learn to JSON if provided
    what_you_learn = data.get('what_you_learn')
    if what_you_learn and isinstance(what_you_learn, list):
        what_you_learn_json = json.dumps(what_you_learn)
    else:
        what_you_learn_json = None
    
    db_exec(
        """UPDATE courses
           SET title=%s, description=%s, instructor_name=%s, category=%s,
               difficulty_level=%s, duration=%s, price=%s, image_url=%s,
               what_you_learn=%s
           WHERE id=%s""",
        (
            data.get('title'), data.get('description'),
            data.get('instructor_name'), data.get('category'),
            data.get('difficulty_level'), data.get('duration'),
            data.get('price'), data.get('image_url'),
            what_you_learn_json, course_id
        )
    )
    return ok({'message': 'Course updated!'})


@app.route('/api/admin/courses/<int:course_id>', methods=['DELETE'])
@token_required
@admin_required
def admin_delete_course(current_user_id, current_user_role, course_id):
    """DELETE /api/admin/courses/<id> — Delete course (cascades via FK)."""
    db_exec("DELETE FROM courses WHERE id = %s", (course_id,))
    return ok({'message': 'Course deleted.'})


# ============================================================
# SECTION 6: ENROLLMENT ENDPOINTS
# ============================================================

@app.route('/api/enrollments', methods=['POST'])
@token_required
def enroll(current_user_id, current_user_role):
    """POST /api/enrollments — Enroll current user in a course."""
    data      = request.get_json() or {}
    course_id = data.get('course_id')
    if not course_id:
        return err('course_id is required.')

    course = db_query("SELECT id FROM courses WHERE id = %s AND is_published = 1", (course_id,), one=True)
    if not course:
        return err('Course not found.', 404)

    already = db_query(
        "SELECT id FROM enrollments WHERE user_id = %s AND course_id = %s",
        (current_user_id, course_id), one=True
    )
    if already:
        return ok({'message': 'Already enrolled.', 'already_enrolled': True})

    eid = db_exec(
        "INSERT INTO enrollments (user_id, course_id, enrolled_at, progress_percentage) VALUES (%s,%s,%s,0)",
        (current_user_id, course_id, datetime.now())
    )
    # Increment counter
    db_exec("UPDATE courses SET enrolled_count = enrolled_count + 1 WHERE id = %s", (course_id,))

    return ok({'message': 'Enrolled successfully!', 'enrollment_id': eid}, 201)


@app.route('/api/enrollments', methods=['GET'])
@token_required
def get_enrollments(current_user_id, current_user_role):
    """GET /api/enrollments — Current user's enrolled courses."""
    rows = db_query(
        """SELECT e.*, c.title, c.description, c.image_url, c.instructor_name,
                  c.category, c.difficulty_level, c.icon, c.duration,
                  c.rating, c.enrolled_count,
                  (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) AS total_lessons
           FROM enrollments e
           JOIN courses c ON e.course_id = c.id
           WHERE e.user_id = %s ORDER BY e.enrolled_at DESC""",
        (current_user_id,)
    )
    return ok({'enrollments': rows})


# ── Admin list all enrollments ────────────────────────────────
@app.route('/api/admin/enrollments', methods=['GET'])
@token_required
@admin_required
def admin_list_enrollments(current_user_id, current_user_role):
    """GET /api/admin/enrollments — All enrollments (admin)."""
    rows = db_query(
        """SELECT e.*, u.full_name, u.email, c.title AS course_title
           FROM enrollments e
           JOIN users u ON u.id = e.user_id
           JOIN courses c ON c.id = e.course_id
           ORDER BY e.enrolled_at DESC LIMIT 200"""
    )
    return ok({'enrollments': rows})


# ============================================================
# SECTION 7: PROGRESS ENDPOINTS
# ============================================================

@app.route('/api/progress/<int:lesson_id>', methods=['POST'])
@token_required
def mark_lesson_progress(current_user_id, current_user_role, lesson_id):
    """POST /api/progress/<lesson_id> — Mark lesson complete/incomplete."""
    data         = request.get_json() or {}
    is_completed = bool(data.get('is_completed', True))

    lesson = db_query("SELECT course_id FROM lessons WHERE id = %s", (lesson_id,), one=True)
    if not lesson:
        return err('Lesson not found.', 404)
    course_id = lesson['course_id']

    if not db_query(
        "SELECT id FROM enrollments WHERE user_id = %s AND course_id = %s",
        (current_user_id, course_id), one=True
    ):
        return err('You are not enrolled in this course.', 403)

    completed_at = datetime.now() if is_completed else None
    db_exec(
        """INSERT INTO progress (user_id, lesson_id, is_completed, completed_at)
           VALUES (%s,%s,%s,%s)
           ON DUPLICATE KEY UPDATE
             is_completed = VALUES(is_completed),
             completed_at = VALUES(completed_at)""",
        (current_user_id, lesson_id, is_completed, completed_at)
    )

    pct = recalc_progress(current_user_id, course_id)
    return ok({'message': 'Progress updated!', 'course_progress': pct})


@app.route('/api/progress/course/<int:course_id>', methods=['GET'])
@token_required
def get_course_progress(current_user_id, current_user_role, course_id):
    """GET /api/progress/course/<id> — User's progress for a course."""
    completed = db_query(
        """SELECT p.lesson_id FROM progress p
           JOIN lessons l ON p.lesson_id = l.id
           WHERE p.user_id = %s AND l.course_id = %s AND p.is_completed = 1""",
        (current_user_id, course_id)
    )
    total = db_query(
        "SELECT COUNT(*) AS cnt FROM lessons WHERE course_id = %s", (course_id,), one=True
    ) or {'cnt': 0}

    completed_ids = [r['lesson_id'] for r in completed]
    pct = int((len(completed_ids) / total['cnt']) * 100) if total['cnt'] else 0
    return ok({'completed_lessons': completed_ids, 'total_lessons': total['cnt'], 'progress': pct})


# ============================================================
# SECTION 8: QUIZ ENDPOINTS
# ============================================================

@app.route('/api/quiz/course/<int:course_id>', methods=['GET'])
@token_required
def get_quiz(current_user_id, current_user_role, course_id):
    """GET /api/quiz/course/<id> — Fetch quiz (answers hidden from client)."""
    if not db_query(
        "SELECT id FROM enrollments WHERE user_id = %s AND course_id = %s",
        (current_user_id, course_id), one=True
    ):
        return err('Enroll in this course to access the quiz.', 403)

    quiz = db_query(
        "SELECT id, title, passing_score, time_limit FROM quizzes WHERE course_id = %s",
        (course_id,), one=True
    )
    if not quiz:
        return err('No quiz found for this course.', 404)

    questions = db_query(
        """SELECT id, question_text, option_a, option_b, option_c, option_d
           FROM questions WHERE quiz_id = %s ORDER BY id""",
        (quiz['id'],)
    )
    quiz['questions'] = questions
    return ok({'quiz': quiz})


@app.route('/api/quiz/<int:quiz_id>/submit', methods=['POST'])
@token_required
def submit_quiz(current_user_id, current_user_role, quiz_id):
    """POST /api/quiz/<id>/submit — Grade quiz, issue cert if passed."""
    data    = request.get_json() or {}
    answers = data.get('answers', {})   # {"question_id": "A"|"B"|"C"|"D"}

    quiz = db_query(
        "SELECT passing_score, course_id FROM quizzes WHERE id = %s", (quiz_id,), one=True
    )
    if not quiz:
        return err('Quiz not found.', 404)

    if not db_query(
        "SELECT id FROM enrollments WHERE user_id = %s AND course_id = %s",
        (current_user_id, quiz['course_id']), one=True
    ):
        return err('You are not enrolled in this course.', 403)

    questions = db_query(
        "SELECT id, correct_answer, points FROM questions WHERE quiz_id = %s", (quiz_id,)
    )

    total_points, earned_points = 0, 0
    results = []
    for q in questions:
        total_points  += q['points']
        user_answer    = (answers.get(str(q['id'])) or '').upper()
        is_correct     = user_answer == q['correct_answer'].upper()
        if is_correct:
            earned_points += q['points']
        results.append({'question_id': q['id'], 'correct': is_correct,
                        'your_answer': user_answer, 'correct_answer': q['correct_answer']})

    score  = int((earned_points / total_points) * 100) if total_points else 0
    passed = score >= quiz['passing_score']

    # Record attempt
    db_exec(
        "INSERT INTO quiz_attempts (user_id, quiz_id, score, passed, attempted_at) VALUES (%s,%s,%s,%s,%s)",
        (current_user_id, quiz_id, score, passed, datetime.now())
    )

    # Issue certificate if passed
    cert_id = None
    if passed:
        cert_id = _issue_certificate(current_user_id, quiz['course_id'])

    return ok({
        'score':         score,
        'passed':        passed,
        'earned_points': earned_points,
        'total_points':  total_points,
        'passing_score': quiz['passing_score'],
        'cert_id':       cert_id,
        'results':       results,
        'message':       ('🎉 Congratulations! Certificate issued!' if passed
                          else f'You need {quiz["passing_score"]}% to pass. Keep going!'),
    })


# ── Admin quizzes management ───────────────────────────────────

@app.route('/api/admin/quizzes', methods=['GET'])
@token_required
@admin_required
def admin_list_quizzes(current_user_id, current_user_role):
    """GET /api/admin/quizzes — List all quizzes."""
    quizzes = db_query(
        """SELECT q.id, q.course_id, q.title, q.passing_score, q.time_limit,
                  c.title AS course_title,
                  (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count
           FROM quizzes q
           JOIN courses c ON q.course_id = c.id
           ORDER BY q.created_at DESC"""
    )
    return ok({'quizzes': quizzes})


@app.route('/api/admin/quizzes/<int:quiz_id>', methods=['GET'])
@token_required
@admin_required
def admin_get_quiz(current_user_id, current_user_role, quiz_id):
    """GET /api/admin/quizzes/<id> — Get quiz with questions."""
    quiz = db_query(
        "SELECT id, course_id, title, passing_score, time_limit FROM quizzes WHERE id = %s",
        (quiz_id,), one=True
    )
    if not quiz:
        return err('Quiz not found.', 404)
    
    questions = db_query(
        """SELECT id, question_text, option_a, option_b, option_c, option_d, correct_answer, points
           FROM questions WHERE quiz_id = %s ORDER BY id""",
        (quiz_id,)
    )
    quiz['questions'] = questions
    return ok({'quiz': quiz})


@app.route('/api/admin/quizzes', methods=['POST'])
@token_required
@admin_required
def admin_create_quiz(current_user_id, current_user_role):
    """POST /api/admin/quizzes — Create quiz with questions."""
    data      = request.get_json() or {}
    course_id = data.get('course_id')
    questions = data.get('questions', [])

    if not course_id:
        return err('course_id is required.')
    if not questions:
        return err('At least one question is required.')

    quiz_id = db_exec(
        "INSERT INTO quizzes (course_id, title, passing_score, time_limit) VALUES (%s,%s,%s,%s)",
        (course_id, data.get('title', 'Course Quiz'),
         data.get('passing_score', 70), data.get('time_limit', 0))
    )
    if not quiz_id:
        return err('Failed to create quiz.', 500)

    for q in questions:
        db_exec(
            """INSERT INTO questions
                 (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, points)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                quiz_id,
                q.get('question_text', ''),
                q.get('option_a', ''), q.get('option_b', ''),
                q.get('option_c', ''), q.get('option_d', ''),
                q.get('correct_answer', 'A'),
                q.get('points', 1),
            )
        )
    return ok({'quiz_id': quiz_id, 'message': 'Quiz created!'}, 201)


@app.route('/api/admin/quizzes/<int:quiz_id>', methods=['DELETE'])
@token_required
@admin_required
def admin_delete_quiz(current_user_id, current_user_role, quiz_id):
    """DELETE /api/admin/quizzes/<id>"""
    db_exec("DELETE FROM quizzes WHERE id = %s", (quiz_id,))
    return ok({'message': 'Quiz deleted.'})


# ============================================================
# SECTION 9: CERTIFICATE ENDPOINTS
# ============================================================

def _issue_certificate(user_id, course_id):
    """Internal helper — idempotent certificate issuance."""
    existing = db_query(
        "SELECT certificate_code FROM certificates WHERE user_id = %s AND course_id = %s",
        (user_id, course_id), one=True
    )
    if existing:
        return existing['certificate_code']

    cert_code = generate_cert_id()
    db_exec(
        """INSERT INTO certificates (user_id, course_id, certificate_code, is_valid, issued_at)
           VALUES (%s,%s,%s,1,%s)""",
        (user_id, course_id, cert_code, datetime.now())
    )
    return cert_code


@app.route('/api/certificates/generate/<int:course_id>', methods=['POST'])
@token_required
def generate_certificate(current_user_id, current_user_role, course_id):
    """POST /api/certificates/generate/<course_id> — Manual certificate request."""
    enrollment = db_query(
        "SELECT * FROM enrollments WHERE user_id = %s AND course_id = %s AND is_completed = 1",
        (current_user_id, course_id), one=True
    )
    if not enrollment:
        return err('Complete the course first to receive your certificate.', 400)

    cert_code = _issue_certificate(current_user_id, course_id)
    return ok({'certificate_code': cert_code, 'message': 'Certificate ready!'})


@app.route('/api/certificates/mine', methods=['GET'])
@token_required
def my_certificates(current_user_id, current_user_role):
    """GET /api/certificates/mine — All certificates for current user."""
    rows = db_query(
        """SELECT ct.*, c.title AS course_title, c.category, c.difficulty_level, c.instructor_name
           FROM certificates ct
           JOIN courses c ON c.id = ct.course_id
           WHERE ct.user_id = %s ORDER BY ct.issued_at DESC""",
        (current_user_id,)
    )
    return ok({'certificates': rows})


@app.route('/api/verify/<certificate_code>', methods=['GET'])
def verify_certificate(certificate_code):
    """GET /api/verify/<code> — Public certificate verification."""
    row = db_query(
        """SELECT ct.*, u.full_name AS student_name, u.email,
                  c.title AS course_title, c.instructor_name, c.difficulty_level
           FROM certificates ct
           JOIN users u ON u.id = ct.user_id
           JOIN courses c ON c.id = ct.course_id
           WHERE ct.certificate_code = %s AND ct.is_valid = 1""",
        (certificate_code,), one=True
    )
    if not row:
        return ok({'valid': False, 'message': 'Certificate not found or has been revoked.'}, 404)
    return ok({'valid': True, 'certificate': row})


@app.route('/api/certificates/<certificate_code>/download', methods=['GET'])
def download_certificate(certificate_code):
    """GET /api/certificates/<code>/download — PDF certificate download."""
    if not REPORTLAB_AVAILABLE:
        return err('PDF generation is not available. Install reportlab.', 503)

    row = db_query(
        """SELECT ct.*, u.full_name AS student_name,
                  c.title AS course_title, c.instructor_name, c.difficulty_level
           FROM certificates ct
           JOIN users u ON u.id = ct.user_id
           JOIN courses c ON c.id = ct.course_id
           WHERE ct.certificate_code = %s AND ct.is_valid = 1""",
        (certificate_code,), one=True
    )
    if not row:
        return err('Certificate not found.', 404)

    buffer = _build_certificate_pdf(row)
    return send_file(
        buffer, mimetype='application/pdf', as_attachment=True,
        download_name=f"certificate-{certificate_code}.pdf"
    )


def _build_certificate_pdf(cert):
    """Build and return a BytesIO PDF certificate."""
    buffer = io.BytesIO()
    doc    = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        topMargin=0.8*inch, bottomMargin=0.8*inch,
        leftMargin=1*inch,  rightMargin=1*inch
    )
    styles  = getSampleStyleSheet()
    accent  = colors.HexColor('#e85d04')
    dark    = colors.HexColor('#1a1917')
    grey    = colors.HexColor('#5c5a54')

    def ps(name, **kw):
        return ParagraphStyle(name, alignment=TA_CENTER, **kw)

    issued = cert.get('issued_at')
    issued_str = issued.strftime('%B %d, %Y') if hasattr(issued, 'strftime') else str(issued)

    story = [
        Spacer(1, 0.2*inch),
        Paragraph('⚡ SMPS Course', ps('brand', fontSize=20, fontName='Helvetica-Bold', textColor=accent, spaceAfter=16)),
        HRFlowable(width='75%', thickness=1.5, color=accent, spaceAfter=24),
        Paragraph('CERTIFICATE OF COMPLETION', ps('title', fontSize=30, fontName='Helvetica-Bold', textColor=dark, spaceAfter=10)),
        Paragraph('This is to certify that', ps('sub', fontSize=13, fontName='Helvetica', textColor=grey, spaceAfter=8)),
        Spacer(1, 0.1*inch),
        Paragraph(cert['student_name'], ps('name', fontSize=38, fontName='Helvetica-Bold', textColor=accent, spaceAfter=8)),
        Paragraph('has successfully completed', ps('sub2', fontSize=13, fontName='Helvetica', textColor=grey, spaceAfter=8)),
        Paragraph(cert['course_title'], ps('course', fontSize=22, fontName='Helvetica-Bold', textColor=dark, spaceAfter=12)),
        HRFlowable(width='50%', thickness=2, color=accent, spaceAfter=20),
        Paragraph(f"Instructor: {cert['instructor_name']}  •  Level: {cert['difficulty_level']}", ps('meta', fontSize=11, fontName='Helvetica', textColor=grey, spaceAfter=24)),
        Spacer(1, 0.2*inch),
        Paragraph(f"Issued: {issued_str}  •  Certificate ID: {cert['certificate_code']}", ps('footer', fontSize=10, fontName='Helvetica', textColor=grey)),
    ]

    # Optional QR code
    if QRCODE_AVAILABLE:
        try:
            qr = qrcode.make(f"https://smpscourse.com/verify/{cert['certificate_code']}")
            qr_buf = io.BytesIO()
            qr.save(qr_buf, format='PNG')
            qr_buf.seek(0)
            from reportlab.platypus import Image as RLImage
            story.insert(-1, RLImage(qr_buf, width=1.2*inch, height=1.2*inch))
            story.insert(-1, Spacer(1, 0.1*inch))
        except Exception:
            pass

    doc.build(story)
    buffer.seek(0)
    return buffer


# ── Admin certificate management ─────────────────────────────

@app.route('/api/admin/certificates', methods=['GET'])
@token_required
@admin_required
def admin_list_certificates(current_user_id, current_user_role):
    """GET /api/admin/certificates — All issued certificates."""
    rows = db_query(
        """SELECT ct.*, u.full_name AS student_name, u.email,
                  c.title AS course_title
           FROM certificates ct
           JOIN users u ON u.id = ct.user_id
           JOIN courses c ON c.id = ct.course_id
           ORDER BY ct.issued_at DESC"""
    )
    return ok({'certificates': rows})


@app.route('/api/admin/certificates', methods=['POST'])
@token_required
@admin_required
def admin_issue_certificate(current_user_id, current_user_role):
    """POST /api/admin/certificates — Manually issue certificate."""
    data      = request.get_json() or {}
    user_id   = data.get('user_id')
    course_id = data.get('course_id')
    if not user_id or not course_id:
        return err('user_id and course_id are required.')
    cert_code = _issue_certificate(user_id, course_id)
    return ok({'certificate_code': cert_code, 'message': 'Certificate issued!'}, 201)


@app.route('/api/admin/certificates/<int:cert_id>', methods=['DELETE'])
@token_required
@admin_required
def admin_revoke_certificate(current_user_id, current_user_role, cert_id):
    """DELETE /api/admin/certificates/<id> — Revoke a certificate."""
    db_exec("UPDATE certificates SET is_valid = 0 WHERE id = %s", (cert_id,))
    return ok({'message': 'Certificate revoked.'})


# ============================================================
# SECTION 10: USER MANAGEMENT (Admin)
# ============================================================

@app.route('/api/admin/users', methods=['GET'])
@token_required
@admin_required
def admin_list_users(current_user_id, current_user_role):
    """GET /api/admin/users — All users with enrollment count."""
    rows = db_query(
        """SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active,
                  u.created_at,
                  COUNT(e.id) AS enrolled_count
           FROM users u
           LEFT JOIN enrollments e ON e.user_id = u.id
           GROUP BY u.id
           ORDER BY u.created_at DESC"""
    )
    return ok({'users': rows})


@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@token_required
@admin_required
def admin_update_user(current_user_id, current_user_role, user_id):
    """PUT /api/admin/users/<id> — Update role or active status."""
    data = request.get_json() or {}
    if 'role' in data:
        db_exec("UPDATE users SET role = %s WHERE id = %s", (data['role'], user_id))
    if 'is_active' in data:
        db_exec("UPDATE users SET is_active = %s WHERE id = %s", (int(data['is_active']), user_id))
    return ok({'message': 'User updated.'})


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@token_required
@admin_required
def admin_delete_user(current_user_id, current_user_role, user_id):
    """DELETE /api/admin/users/<id> — Remove a user account."""
    if user_id == current_user_id:
        return err("You cannot delete your own account.", 400)
    db_exec("DELETE FROM users WHERE id = %s", (user_id,))
    return ok({'message': 'User removed.'})


# ============================================================
# SECTION 11: DASHBOARD
# ============================================================

@app.route('/api/dashboard', methods=['GET'])
@token_required
def get_dashboard(current_user_id, current_user_role):
    """GET /api/dashboard — Full dashboard for current user."""
    enrollments = db_query(
        """SELECT e.*, c.title, c.image_url, c.instructor_name, c.category,
                  c.difficulty_level, c.icon, c.duration, c.rating,
                  (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) AS total_lessons
           FROM enrollments e
           JOIN courses c ON e.course_id = c.id
           WHERE e.user_id = %s ORDER BY e.enrolled_at DESC""",
        (current_user_id,)
    )
    certificates = db_query(
        """SELECT ct.*, c.title AS course_title
           FROM certificates ct
           JOIN courses c ON c.id = ct.course_id
           WHERE ct.user_id = %s ORDER BY ct.issued_at DESC""",
        (current_user_id,)
    )
    recent_quizzes = db_query(
        """SELECT qa.score, qa.passed, qa.attempted_at,
                  q.title AS quiz_title, c.title AS course_title
           FROM quiz_attempts qa
           JOIN quizzes q ON qa.quiz_id = q.id
           JOIN courses c ON q.course_id = c.id
           WHERE qa.user_id = %s ORDER BY qa.attempted_at DESC LIMIT 5""",
        (current_user_id,)
    )
    completed = [e for e in enrollments if e.get('is_completed')]
    avg_pct   = (
        sum(e['progress_percentage'] or 0 for e in enrollments) // len(enrollments)
        if enrollments else 0
    )
    return ok({
        'enrolled_courses': enrollments,
        'certificates':     certificates,
        'recent_quizzes':   recent_quizzes,
        'stats': {
            'total_enrolled':    len(enrollments),
            'total_completed':   len(completed),
            'total_certificates':len(certificates),
            'avg_progress':      avg_pct,
        },
    })


# ============================================================
# SECTION 12: ADMIN DASHBOARD STATS
# ============================================================

@app.route('/api/admin/dashboard', methods=['GET'])
@token_required
@admin_required
def admin_dashboard(current_user_id, current_user_role):
    """GET /api/admin/dashboard — Platform-wide statistics."""
    users_count   = (db_query("SELECT COUNT(*) AS cnt FROM users", one=True)         or {}).get('cnt', 0)
    courses_count = (db_query("SELECT COUNT(*) AS cnt FROM courses", one=True)       or {}).get('cnt', 0)
    enroll_count  = (db_query("SELECT COUNT(*) AS cnt FROM enrollments", one=True)   or {}).get('cnt', 0)
    cert_count    = (db_query("SELECT COUNT(*) AS cnt FROM certificates WHERE is_valid=1", one=True) or {}).get('cnt', 0)

    recent_enroll = db_query(
        """SELECT e.enrolled_at, u.full_name, u.email, c.title AS course_title
           FROM enrollments e
           JOIN users u ON u.id = e.user_id
           JOIN courses c ON c.id = e.course_id
           ORDER BY e.enrolled_at DESC LIMIT 10"""
    )
    top_courses = db_query(
        """SELECT c.title, c.category, COUNT(e.id) AS enrollment_count
           FROM courses c
           LEFT JOIN enrollments e ON e.course_id = c.id
           GROUP BY c.id ORDER BY enrollment_count DESC LIMIT 5"""
    )
    return ok({
        'stats': {
            'users':        users_count,
            'courses':      courses_count,
            'enrollments':  enroll_count,
            'certificates': cert_count,
        },
        'recent_enrollments': recent_enroll,
        'top_courses':        top_courses,
    })


# ============================================================
# SECTION 13: HEALTH CHECK & SEED
# ============================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """GET /api/health — Liveness probe."""
    conn = get_db()
    db_ok = conn is not None
    if conn:
        conn.close()
    return ok({'status': 'healthy' if db_ok else 'degraded',
               'db_connected': db_ok,
               'timestamp': datetime.now().isoformat()})


@app.route('/api/seed', methods=['POST'])
def seed_data():
    """POST /api/seed — Insert demo data (dev only, remove in production)."""
    # Admin user
    if not db_query("SELECT id FROM users WHERE email='admin@smps.com'", one=True):
        db_exec(
            "INSERT INTO users (username,email,password_hash,full_name,role,is_active,created_at) VALUES(%s,%s,%s,%s,'admin',1,%s)",
            ('admin', 'admin@smps.com', hash_password('admin123'), 'Admin User', datetime.now())
        )
    # Student user
    if not db_query("SELECT id FROM users WHERE email='student@smps.com'", one=True):
        db_exec(
            "INSERT INTO users (username,email,password_hash,full_name,role,is_active,created_at) VALUES(%s,%s,%s,%s,'student',1,%s)",
            ('student', 'student@smps.com', hash_password('student123'), 'Alex Johnson', datetime.now())
        )

    # Sample course
    if not db_query("SELECT id FROM courses WHERE title='Switch Mode Power Supply Fundamentals'", one=True):
        cid = db_exec(
            """INSERT INTO courses
                 (title,description,instructor_name,category,difficulty_level,price,icon,is_published,enrolled_count,created_at,what_you_learn)
               VALUES(%s,%s,%s,%s,%s,0,%s,1,1842,%s,%s)""",
            (
                'Switch Mode Power Supply Fundamentals',
                'A comprehensive introduction to SMPS design covering Buck, Boost, Flyback topologies, magnetics, and control loops.',
                'Dr. Robert Kim', 'Power Electronics', 'Beginner', '⚡', datetime.now(),
                json.dumps(['SMPS topologies: Buck, Boost, Flyback', 'Magnetics design fundamentals', 'Control loop theory', 'PCB layout best practices', 'EMI/EMC compliance basics', 'Thermal management'])
            )
        )
        # Lessons
        for i, (title, dur) in enumerate([
            ('Introduction to SMPS', '12:30'),
            ('Buck Converter Operation', '18:45'),
            ('Boost Converter Design', '21:10'),
            ('Flyback Topology', '24:00'),
            ('Magnetics Design', '30:15'),
            ('Control Loop Theory', '27:40'),
        ], 1):
            db_exec(
                "INSERT INTO lessons (course_id,title,duration,lesson_order,is_preview) VALUES(%s,%s,%s,%s,%s)",
                (cid, title, dur, i, i == 1)
            )
        # Quiz
        qid = db_exec(
            "INSERT INTO quizzes (course_id,title,passing_score,time_limit) VALUES(%s,%s,70,0)",
            (cid, 'SMPS Fundamentals Quiz')
        )
        for q_text, opts, correct in [
            ('What is the main advantage of SMPS over linear regulators?',
             ('Lower output ripple','Higher efficiency due to switching','Simpler design','Better noise rejection'), 'B'),
            ('In a Buck converter, Vout relates to Vin as:',
             ('Vout = Vin/D','Vout = Vin × D','Vout = Vin × (1-D)','Vout = Vin/(1-D)'), 'B'),
            ('The Flyback topology is derived from:',
             ('Buck','Boost','Buck-Boost','Cuk'), 'C'),
        ]:
            db_exec(
                "INSERT INTO questions (quiz_id,question_text,option_a,option_b,option_c,option_d,correct_answer,points) VALUES(%s,%s,%s,%s,%s,%s,%s,1)",
                (qid, q_text, *opts, correct)
            )

    return ok({'message': 'Demo data seeded successfully! 🎉'})


# ============================================================
# SECTION 14: ENTRY POINT
# ============================================================
if __name__ == '__main__':
    print("=" * 60)
    print("  SMPS COURSE PLATFORM — BACKEND API")
    print("=" * 60)
    print("  Server : http://localhost:5001")
    print("  DB     : smps_course_db @ localhost")
    print()
    print("  Endpoints:")
    print("    POST  /api/auth/signup")
    print("    POST  /api/auth/login")
    print("    GET   /api/auth/me")
    print("    GET   /api/courses          ?category=&level=&search=&sort=")
    print("    GET   /api/courses/<id>")
    print("    POST  /api/enrollments")
    print("    GET   /api/enrollments")
    print("    POST  /api/progress/<lesson_id>")
    print("    GET   /api/progress/course/<course_id>")
    print("    GET   /api/quiz/course/<course_id>")
    print("    POST  /api/quiz/<quiz_id>/submit")
    print("    POST  /api/certificates/generate/<course_id>")
    print("    GET   /api/certificates/mine")
    print("    GET   /api/verify/<code>")
    print("    GET   /api/certificates/<code>/download")
    print("    GET   /api/dashboard")
    print("    GET   /api/admin/dashboard")
    print("    GET   /api/admin/users")
    print("    GET   /api/admin/courses")
    print("    GET   /api/admin/quizzes")
    print("    GET   /api/admin/certificates")
    print("    GET   /api/health")
    print("    POST  /api/seed             (dev only)")
    print("=" * 60)
    print("  Demo credentials:")
    print("    Admin   : admin@smps.com   / admin123")
    print("    Student : student@smps.com / student123")
    print("  (Run POST /api/seed to insert demo data)")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5001)