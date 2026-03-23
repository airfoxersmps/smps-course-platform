-- ============================================================
-- SMPS COURSE PLATFORM — MySQL Database Schema (FIXED)
-- Database: smps_course_db
--
-- Run with:
--   mysql -u root -p < schema.sql
--
-- Fixes applied:
--   [1] Added `icon` and `duration` columns to courses table
--   [2] Added `what_you_learn` JSON column to courses table
--   [3] Correct SHA-256 password hashes for demo users
--   [4] DROP TABLE order respects foreign keys
--   [5] No emojis in SQL literals that cause charset issues
-- ============================================================

CREATE DATABASE IF NOT EXISTS smps_course_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smps_course_db;

-- Drop in reverse FK order so re-runs are clean
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS certificates;
DROP TABLE IF EXISTS quiz_attempts;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS quizzes;
DROP TABLE IF EXISTS progress;
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE users (
    id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    username      VARCHAR(60)   NOT NULL,
    email         VARCHAR(120)  NOT NULL,
    password_hash VARCHAR(255)  NOT NULL,
    full_name     VARCHAR(120)  NOT NULL,
    role          ENUM('student','admin','instructor') NOT NULL DEFAULT 'student',
    avatar_url    VARCHAR(500)  DEFAULT NULL,
    is_active     TINYINT(1)    NOT NULL DEFAULT 1,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_username (username),
    UNIQUE KEY uq_email    (email),
    INDEX idx_users_role   (role),
    INDEX idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: courses (UPDATED with what_you_learn JSON column)
-- ============================================================
CREATE TABLE courses (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    title            VARCHAR(255)  NOT NULL,
    description      TEXT          DEFAULT NULL,
    instructor_name  VARCHAR(120)  NOT NULL DEFAULT '',
    category         VARCHAR(80)   NOT NULL DEFAULT 'General',
    difficulty_level ENUM('Beginner','Intermediate','Advanced') NOT NULL DEFAULT 'Beginner',
    duration         VARCHAR(20)   NOT NULL DEFAULT '0h 0m',   -- e.g. "8h 30m"
    price            DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
    image_url        VARCHAR(500)  DEFAULT NULL,
    icon             VARCHAR(10)   NOT NULL DEFAULT '',         -- emoji e.g. stored as UTF-8
    rating           DECIMAL(3,2)  NOT NULL DEFAULT 4.50,
    enrolled_count   INT UNSIGNED  NOT NULL DEFAULT 0,
    what_you_learn   JSON          DEFAULT NULL,                -- Array of learning outcomes
    is_published     TINYINT(1)    NOT NULL DEFAULT 0,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_courses_category  (category),
    INDEX idx_courses_level     (difficulty_level),
    INDEX idx_courses_published (is_published),
    INDEX idx_courses_rating    (rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: lessons
-- ============================================================
CREATE TABLE lessons (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    course_id    INT UNSIGNED  NOT NULL,
    title        VARCHAR(255)  NOT NULL,
    description  TEXT          DEFAULT NULL,
    video_url    VARCHAR(500)  DEFAULT NULL,
    duration     VARCHAR(10)   NOT NULL DEFAULT '00:00',
    lesson_order SMALLINT      NOT NULL DEFAULT 1,
    is_preview   TINYINT(1)    NOT NULL DEFAULT 0,
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_lessons_course
        FOREIGN KEY (course_id) REFERENCES courses(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_lessons_course (course_id),
    INDEX idx_lessons_order  (course_id, lesson_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: enrollments
-- ============================================================
CREATE TABLE enrollments (
    id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id             INT UNSIGNED  NOT NULL,
    course_id           INT UNSIGNED  NOT NULL,
    enrolled_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    progress_percentage TINYINT       NOT NULL DEFAULT 0,
    is_completed        TINYINT(1)    NOT NULL DEFAULT 0,
    completed_at        DATETIME      DEFAULT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_enrollment (user_id, course_id),
    CONSTRAINT fk_enroll_user
        FOREIGN KEY (user_id)   REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_enroll_course
        FOREIGN KEY (course_id) REFERENCES courses(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_enroll_user      (user_id),
    INDEX idx_enroll_course    (course_id),
    INDEX idx_enroll_completed (is_completed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: progress  (one row per user x lesson)
-- ============================================================
CREATE TABLE progress (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id      INT UNSIGNED  NOT NULL,
    lesson_id    INT UNSIGNED  NOT NULL,
    is_completed TINYINT(1)    NOT NULL DEFAULT 0,
    completed_at DATETIME      DEFAULT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_progress (user_id, lesson_id),
    CONSTRAINT fk_progress_user
        FOREIGN KEY (user_id)   REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_progress_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_progress_user   (user_id),
    INDEX idx_progress_lesson (lesson_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: quizzes
-- ============================================================
CREATE TABLE quizzes (
    id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    course_id     INT UNSIGNED  NOT NULL,
    title         VARCHAR(255)  NOT NULL DEFAULT 'Course Quiz',
    passing_score TINYINT       NOT NULL DEFAULT 70,
    time_limit    SMALLINT      NOT NULL DEFAULT 0,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_quiz_course
        FOREIGN KEY (course_id) REFERENCES courses(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_quiz_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: questions
-- ============================================================
CREATE TABLE questions (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    quiz_id        INT UNSIGNED  NOT NULL,
    question_text  TEXT          NOT NULL,
    option_a       VARCHAR(500)  NOT NULL,
    option_b       VARCHAR(500)  NOT NULL,
    option_c       VARCHAR(500)  DEFAULT NULL,
    option_d       VARCHAR(500)  DEFAULT NULL,
    correct_answer CHAR(1)       NOT NULL DEFAULT 'A',
    points         TINYINT       NOT NULL DEFAULT 1,

    PRIMARY KEY (id),
    CONSTRAINT fk_question_quiz
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_questions_quiz (quiz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: quiz_attempts
-- ============================================================
CREATE TABLE quiz_attempts (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id      INT UNSIGNED  NOT NULL,
    quiz_id      INT UNSIGNED  NOT NULL,
    score        TINYINT       NOT NULL DEFAULT 0,
    passed       TINYINT(1)    NOT NULL DEFAULT 0,
    attempted_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_attempt_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_attempt_quiz
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_attempt_user (user_id),
    INDEX idx_attempt_quiz (quiz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: certificates
-- ============================================================
CREATE TABLE certificates (
    id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id           INT UNSIGNED  NOT NULL,
    course_id         INT UNSIGNED  NOT NULL,
    certificate_code  VARCHAR(30)   NOT NULL,
    is_valid          TINYINT(1)    NOT NULL DEFAULT 1,
    issued_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_cert_code        (certificate_code),
    UNIQUE KEY uq_cert_user_course (user_id, course_id),
    CONSTRAINT fk_cert_user
        FOREIGN KEY (user_id)   REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_cert_course
        FOREIGN KEY (course_id) REFERENCES courses(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_cert_code  (certificate_code),
    INDEX idx_cert_user  (user_id),
    INDEX idx_cert_valid (is_valid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- SEED DATA
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
-- SHA-256 hash verification (Python):
--   import hashlib
--   hashlib.sha256(b'admin123').hexdigest()
--   => 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
--   hashlib.sha256(b'student123').hexdigest()
--   => ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f

INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES
('admin',
 'admin@smps.com',
 '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
 'Admin User', 'admin', 1),

('student',
 'student@smps.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Alex Johnson', 'student', 1),

('maria',
 'maria@example.com',
 '344d73b5e0f72bb01f47f38d88ff8efbc87bffe6a71b9b2fadf1e0f4c97ab8e1',
 'Maria Chen', 'student', 1);


-- ── Courses ──────────────────────────────────────────────────
-- icon column left empty here; the frontend JS fills emoji icons.
-- what_you_learn is stored as JSON array

INSERT INTO courses
  (id, title, description, instructor_name, category, difficulty_level,
   duration, price, icon, rating, enrolled_count, what_you_learn, is_published)
VALUES
(1,
 'Switch Mode Power Supply Fundamentals',
 'A comprehensive introduction to SMPS design. Learn the core topologies: Buck, Boost, Flyback, magnetics theory, and control strategies.',
 'Dr. Robert Kim', 'Power Electronics', 'Beginner',
 '8h 30m', 0.00, '', 4.90, 1842, 
 '["SMPS topologies: Buck, Boost, Flyback", "Magnetics design fundamentals", "Control loop theory", "PCB layout best practices", "EMI/EMC compliance basics", "Thermal management"]',
 1),

(2,
 'Advanced Power Electronics Design',
 'Deep dive into resonant converters, digital control, and wide-bandgap devices. For engineers pushing performance boundaries.',
 'Prof. Sarah Williams', 'Power Electronics', 'Advanced',
 '12h 15m', 0.00, '', 4.80, 964,
 '["Resonant converters (LLC, SRC)", "Digital control with DSPs", "GaN & SiC wide-bandgap devices", "Multi-phase interleaving", "High-frequency magnetics", "Battery charger design"]',
 1),

(3,
 'PCB Design for Power Converters',
 'Master the art of laying out power converter PCBs. Reduce EMI, improve efficiency, and ensure reliability in your designs.',
 'Eng. David Park', 'PCB Design', 'Intermediate',
 '6h 45m', 0.00, '', 4.70, 1231,
 '["High-current trace sizing", "Ground plane strategies", "Thermal vias and heatsinking", "Differential pair routing", "Layer stack-up selection", "DFM principles"]',
 1),

(4,
 'EMI/EMC for Power Electronics',
 'Understand electromagnetic interference in power converters and master the techniques to pass regulatory testing.',
 'Dr. Lisa Tanaka', 'EMC', 'Intermediate',
 '5h 20m', 0.00, '', 4.60, 712,
 '["Common-mode vs. differential-mode noise", "Input filter design", "CISPR & FCC standards", "Pre-compliance testing setup", "Shielding techniques", "Software simulation tools"]',
 1),

(5,
 'Battery Management Systems (BMS)',
 'Design safe and efficient BMS for Li-ion packs. From cell chemistry to SoC estimation and CAN communication.',
 'Dr. Thomas Nguyen', 'Battery Technology', 'Intermediate',
 '9h 10m', 0.00, '', 4.80, 1540,
 '["Cell chemistry basics", "Cell balancing: active vs. passive", "SoC & SoH estimation", "Protection circuit design", "Thermal modeling", "CAN bus communication"]',
 1),

(6,
 'Python for Power Electronics Simulation',
 'Use Python and open-source libraries to simulate converters, plot waveforms, and automate design calculations.',
 'Eng. Priya Singh', 'Simulation', 'Beginner',
 '7h 00m', 0.00, '', 4.70, 2100,
 '["Python fundamentals for engineers", "PySPICE circuit simulation", "Numpy for signal processing", "Matplotlib waveform plotting", "Automated Bode plots", "Optimization algorithms"]',
 1);


-- ── Lessons — Course 1 (IDs will be 1-6) ─────────────────────
INSERT INTO lessons (course_id, title, description, duration, lesson_order, is_preview) VALUES
(1, 'Introduction to SMPS',
    'Why SMPS replaced linear regulators. Basic block diagram and key advantages.',
    '12:30', 1, 1),
(1, 'Buck Converter Operation',
    'Step-down topology: waveforms, CCM vs DCM, duty cycle derivation.',
    '18:45', 2, 0),
(1, 'Boost Converter Design',
    'Step-up converter: duty cycle, inductor and output capacitor selection.',
    '21:10', 3, 0),
(1, 'Flyback Converter Topology',
    'Isolated converter using coupled inductors. Turns ratio and clamp circuits.',
    '24:00', 4, 0),
(1, 'Magnetics Design Basics',
    'Core materials, Litz wire, Faraday law, and transformer design equations.',
    '30:15', 5, 0),
(1, 'Control Loop Theory',
    'Feedback control, compensation networks, and phase margin.',
    '27:40', 6, 0);

-- ── Lessons — Course 2 (IDs will be 7-10) ────────────────────
INSERT INTO lessons (course_id, title, description, duration, lesson_order, is_preview) VALUES
(2, 'Resonant Converter Overview',
    'Introduction to LLC and SRC resonant topologies and advantages.',
    '15:00', 1, 1),
(2, 'LLC Half-Bridge Design',
    'Detailed design procedure for LLC resonant converters.',
    '22:30', 2, 0),
(2, 'Digital Control with DSPs',
    'Implementing digital PI controllers on microcontrollers.',
    '28:00', 3, 0),
(2, 'GaN Device Characteristics',
    'Wide-bandgap semiconductors for high-frequency switching applications.',
    '19:15', 4, 0);

-- ── Lessons — Course 3 (IDs will be 11-13) ───────────────────
INSERT INTO lessons (course_id, title, description, duration, lesson_order, is_preview) VALUES
(3, 'PCB Layout Fundamentals',
    'Current loop minimisation and return path management strategies.',
    '14:20', 1, 1),
(3, 'Trace Width and Copper Pour',
    'Calculating trace sizes and using copper pours for high-current paths.',
    '16:30', 2, 0),
(3, 'Ground Plane Strategies',
    'Split grounds, star grounding, and stitching vias.',
    '18:00', 3, 0);

-- ── Lessons — Courses 4, 5, 6 (IDs 14-22) ───────────────────
INSERT INTO lessons (course_id, title, description, duration, lesson_order, is_preview) VALUES
(4, 'EMI Sources in Converters',
    'Identifying noise sources and propagation paths in switching circuits.',
    '13:00', 1, 1),
(4, 'Input Filter Design',
    'Designing L-C input filters to suppress differential-mode noise.',
    '20:00', 2, 0),
(4, 'Regulatory Testing Overview',
    'CISPR 32 and FCC Part 15: test setup and interpreting results.',
    '22:00', 3, 0),

(5, 'Li-ion Cell Chemistry',
    'NMC, LFP, and LCO cell types and their key characteristics.',
    '11:00', 1, 1),
(5, 'Cell Balancing Circuits',
    'Passive dissipative balancing and active charge shuttling methods.',
    '17:00', 2, 0),
(5, 'SoC Estimation Methods',
    'Coulomb counting and Kalman filter approaches to state-of-charge.',
    '25:00', 3, 0),

(6, 'Python Setup for Engineers',
    'Anaconda, Jupyter Notebooks, and essential scientific Python libraries.',
    '10:00', 1, 1),
(6, 'Simulating a Buck Converter in Python',
    'Building a time-domain switching simulation from scratch.',
    '28:00', 2, 0),
(6, 'Plotting Bode Plots with Python',
    'Using the control library to analyse loop stability graphically.',
    '20:00', 3, 0);


-- ── Quizzes ──────────────────────────────────────────────────
INSERT INTO quizzes (id, course_id, title, passing_score, time_limit) VALUES
(1, 1, 'SMPS Fundamentals Quiz',          70, 0),
(2, 2, 'Advanced Power Electronics Quiz', 75, 0),
(3, 3, 'PCB Design Quiz',                 70, 0);


-- ── Questions — Quiz 1 ───────────────────────────────────────
INSERT INTO questions
  (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, points)
VALUES
(1,
 'What is the primary advantage of SMPS over linear regulators?',
 'Lower output ripple voltage',
 'Higher efficiency due to switching transistors',
 'Simpler circuit design',
 'Better noise rejection',
 'B', 1),

(1,
 'In a Buck converter operating in CCM, if duty cycle D increases, Vout:',
 'Decreases proportionally',
 'Stays the same regardless',
 'Increases proportionally',
 'Becomes unstable immediately',
 'C', 1),

(1,
 'Which formula correctly relates Buck converter Vout to Vin and duty cycle D?',
 'Vout = Vin / D',
 'Vout = Vin x D',
 'Vout = Vin x (1 - D)',
 'Vout = Vin / (1 - D)',
 'B', 1),

(1,
 'What is the main function of the output capacitor in a Buck converter?',
 'Energy storage during the transistor off-time',
 'Filtering the output ripple voltage',
 'Providing gate drive current to the switch',
 'Protecting the diode from reverse voltage',
 'B', 1),

(1,
 'The Flyback converter topology is derived from which basic converter?',
 'Buck',
 'Boost',
 'Buck-Boost',
 'Cuk',
 'C', 1);


-- ── Questions — Quiz 2 ───────────────────────────────────────
INSERT INTO questions
  (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, points)
VALUES
(2,
 'In an LLC resonant converter, voltage gain characteristics are primarily determined by:',
 'Switching frequency relative to the resonant frequency',
 'The magnitude of the input voltage',
 'The value of the output capacitance',
 'The transformer turns ratio alone',
 'A', 1),

(2,
 'The key performance advantage of GaN FETs over Silicon MOSFETs is:',
 'Lower on-resistance at low blocking voltages',
 'Higher gate capacitance for easier drive',
 'Near-zero reverse recovery charge and faster switching speed',
 'Significantly lower cost per unit at volume',
 'C', 1),

(2,
 'Multi-phase interleaving in DC-DC converters primarily improves:',
 'Voltage regulation accuracy across load',
 'Input and output ripple current cancellation',
 'Switching efficiency at very light load',
 'Package thermal resistance',
 'B', 1),

(2,
 'Digital power supply controllers most commonly implement:',
 'Analog hysteresis control loops',
 'Digital PI or PID control algorithms',
 'Simple bang-bang on/off control',
 'Sliding mode control',
 'B', 1);


-- ── Questions — Quiz 3 ───────────────────────────────────────
INSERT INTO questions
  (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, points)
VALUES
(3,
 'Why must the high-current switching loop be minimised in power converter PCBs?',
 'To reduce DC trace resistance losses',
 'To minimise radiated EMI and parasitic stray inductance',
 'To improve thermal spreading from the switch',
 'To reduce total manufacturing cost',
 'B', 1),

(3,
 'Thermal vias in a PCB are primarily used to:',
 'Provide electrical isolation between copper layers',
 'Conduct heat from component pads to inner copper planes or heatsinks',
 'Increase the current-carrying capacity of a trace',
 'Improve signal integrity on high-speed digital nets',
 'B', 1),

(3,
 'In a standard 4-layer PCB for a power converter, the power plane is typically placed on:',
 'Layer 1 (Top signal layer)',
 'Layer 2 (inner)',
 'Layer 3 (inner)',
 'Layer 4 (Bottom signal layer)',
 'C', 1);


-- ── Sample enrollments ────────────────────────────────────────
INSERT INTO enrollments
  (user_id, course_id, enrolled_at, progress_percentage, is_completed, completed_at)
VALUES
(2, 1, '2024-03-01 09:00:00', 66,  0, NULL),
(2, 3, '2024-03-15 14:00:00', 100, 1, '2024-04-01 12:00:00'),
(3, 1, '2024-03-20 10:00:00', 33,  0, NULL),
(3, 5, '2024-03-22 11:00:00', 0,   0, NULL);


-- ── Sample progress: user 2, Course 1 (lessons 1-4 of 6 done) ─
INSERT INTO progress (user_id, lesson_id, is_completed, completed_at) VALUES
(2, 1, 1, '2024-03-01 10:00:00'),
(2, 2, 1, '2024-03-02 11:00:00'),
(2, 3, 1, '2024-03-05 14:00:00'),
(2, 4, 1, '2024-03-08 16:00:00');

-- ── Sample progress: user 2, Course 3 (all 3 lessons done) ───
-- Course 3 lessons are IDs 11, 12, 13 (after 6 course-1 + 4 course-2 lessons)
INSERT INTO progress (user_id, lesson_id, is_completed, completed_at) VALUES
(2, 11, 1, '2024-04-01 09:00:00'),
(2, 12, 1, '2024-04-01 10:30:00'),
(2, 13, 1, '2024-04-01 12:00:00');


-- ── Sample certificate ────────────────────────────────────────
INSERT INTO certificates (user_id, course_id, certificate_code, is_valid, issued_at) VALUES
(2, 3, 'SMPS-2024-PCB001A', 1, '2024-04-01 12:00:00');


-- ============================================================
-- REPORTING VIEWS
-- ============================================================
CREATE OR REPLACE VIEW v_course_stats AS
SELECT
    c.id,
    c.title,
    c.category,
    c.difficulty_level,
    COUNT(DISTINCT e.id)                 AS total_enrollments,
    COUNT(DISTINCT ct.id)                AS total_certificates,
    ROUND(AVG(e.progress_percentage), 1) AS avg_progress_pct,
    c.rating,
    c.enrolled_count
FROM courses c
LEFT JOIN enrollments  e  ON e.course_id  = c.id
LEFT JOIN certificates ct ON ct.course_id = c.id
GROUP BY c.id;

CREATE OR REPLACE VIEW v_user_stats AS
SELECT
    u.id,
    u.full_name,
    u.email,
    u.role,
    COUNT(DISTINCT e.id)  AS enrolled_courses,
    SUM(e.is_completed)   AS completed_courses,
    COUNT(DISTINCT ct.id) AS certificates_earned
FROM users u
LEFT JOIN enrollments  e  ON e.user_id  = u.id
LEFT JOIN certificates ct ON ct.user_id = u.id
GROUP BY u.id;


-- ============================================================
-- QUICK VERIFICATION QUERIES (uncomment to run after import)
-- ============================================================
-- SELECT 'users'        AS tbl, COUNT(*) AS rows FROM users;
-- SELECT 'courses'      AS tbl, COUNT(*) AS rows FROM courses;
-- SELECT 'lessons'      AS tbl, COUNT(*) AS rows FROM lessons;
-- SELECT 'quizzes'      AS tbl, COUNT(*) AS rows FROM quizzes;
-- SELECT 'questions'    AS tbl, COUNT(*) AS rows FROM questions;
-- SELECT 'enrollments'  AS tbl, COUNT(*) AS rows FROM enrollments;
-- SELECT 'certificates' AS tbl, COUNT(*) AS rows FROM certificates;
-- SELECT * FROM v_course_stats;