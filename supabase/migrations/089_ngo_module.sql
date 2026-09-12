-- ============================================================
-- NGO Module: Programs, Training, Advisory, Donations, Volunteers
-- ============================================================

-- Programs (aid programs, services, initiatives)
CREATE TABLE IF NOT EXISTS ngo_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  category TEXT,                    -- 'health', 'education', 'agriculture', 'livelihoods', 'emergency'
  eligibility_criteria JSONB DEFAULT '{}',   -- {min_age, max_age, location, income_level, etc}
  status TEXT NOT NULL DEFAULT 'active',     -- 'active', 'inactive', 'upcoming', 'closed'
  max_enrollments INTEGER,
  current_enrollments INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, slug)
);

ALTER TABLE ngo_programs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ngo_programs_account ON ngo_programs(account_id);
CREATE INDEX IF NOT EXISTS idx_ngo_programs_category ON ngo_programs(category);
CREATE INDEX IF NOT EXISTS idx_ngo_programs_status ON ngo_programs(status);

-- Program applications
CREATE TABLE IF NOT EXISTS ngo_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES ngo_programs(id) ON DELETE CASCADE,
  contact_id UUID,
  conversation_id UUID,
  applicant_name TEXT NOT NULL,
  applicant_phone TEXT,
  applicant_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',    -- 'pending', 'under_review', 'approved', 'rejected', 'waitlisted'
  answers JSONB DEFAULT '{}',                -- Form answers collected conversationally
  notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ngo_applications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ngo_applications_account ON ngo_applications(account_id);
CREATE INDEX IF NOT EXISTS idx_ngo_applications_program ON ngo_applications(program_id);
CREATE INDEX IF NOT EXISTS idx_ngo_applications_contact ON ngo_applications(contact_id);
CREATE INDEX IF NOT EXISTS idx_ngo_applications_status ON ngo_applications(status);

-- Training courses
CREATE TABLE IF NOT EXISTS training_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  category TEXT,                    -- 'farming', 'health', 'education', 'livelihoods', 'general'
  duration_weeks INTEGER DEFAULT 4,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',     -- {region, language, prerequisites, etc}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, slug)
);

ALTER TABLE training_courses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_training_courses_account ON training_courses(account_id);

-- Training lessons (one per day per course)
CREATE TABLE IF NOT EXISTS training_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  day_number INTEGER NOT NULL,      -- 1-7 within the week
  title TEXT NOT NULL,
  content TEXT NOT NULL,            -- Lesson text (can be markdown)
  media_url TEXT,                   -- Optional image/audio/video
  lesson_type TEXT NOT NULL DEFAULT 'text',  -- 'text', 'quiz', 'assignment', 'video'
  quiz_data JSONB,                 -- For quiz lessons: {question, options, correct_answer, explanation}
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE training_lessons ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_training_lessons_account ON training_lessons(account_id);
CREATE INDEX IF NOT EXISTS idx_training_lessons_course ON training_lessons(course_id);

-- Training enrollments
CREATE TABLE IF NOT EXISTS training_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',   -- 'active', 'completed', 'dropped'
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  UNIQUE(account_id, course_id, contact_id)
);

ALTER TABLE training_enrollments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_training_enrollments_account ON training_enrollments(account_id);
CREATE INDEX IF NOT EXISTS idx_training_enrollments_contact ON training_enrollments(contact_id);

-- Training progress (one row per lesson completed)
CREATE TABLE IF NOT EXISTS training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES training_enrollments(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score INTEGER,                    -- Quiz score (0-100) if applicable
  answers JSONB,                    -- User's answers for quiz/assignment
  UNIQUE(enrollment_id, lesson_id)
);

ALTER TABLE training_progress ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_training_progress_enrollment ON training_progress(enrollment_id);

-- Training certificates
CREATE TABLE IF NOT EXISTS training_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES training_enrollments(id) ON DELETE CASCADE,
  certificate_number TEXT NOT NULL,
  certificate_url TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, enrollment_id)
);

ALTER TABLE training_certificates ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_training_certificates_account ON training_certificates(account_id);

-- Advisory knowledge base (FAQ, diseases, best practices)
CREATE TABLE IF NOT EXISTS advisory_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category TEXT NOT NULL,           -- 'disease', 'pest', 'best_practice', 'technique', 'faq'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[],                  -- For search: ['maize', 'yellow', 'leaves', 'nitrogen']
  crop_type TEXT,                   -- Optional: 'maize', 'beans', 'tomatoes', etc.
  region TEXT,                      -- Optional: specific region applicability
  media_url TEXT,                   -- Optional image/diagram
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE advisory_topics ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_advisory_topics_account ON advisory_topics(account_id);
CREATE INDEX IF NOT EXISTS idx_advisory_topics_category ON advisory_topics(category);
CREATE INDEX IF NOT EXISTS idx_advisory_topics_crop ON advisory_topics(crop_type);

-- Market prices (NGO updates, AI reads)
CREATE TABLE IF NOT EXISTS market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  crop TEXT NOT NULL,
  location TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'KES',
  unit TEXT DEFAULT 'kg',           -- 'kg', 'bag', 'bunch', etc.
  source TEXT,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_market_prices_account ON market_prices(account_id);
CREATE INDEX IF NOT EXISTS idx_market_prices_crop ON market_prices(crop);
CREATE INDEX IF NOT EXISTS idx_market_prices_date ON market_prices(recorded_date);

-- Planting calendars
CREATE TABLE IF NOT EXISTS planting_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  crop TEXT NOT NULL,
  region TEXT NOT NULL,
  plant_start_month INTEGER,        -- 1-12
  plant_end_month INTEGER,
  harvest_start_month INTEGER,
  harvest_end_month INTEGER,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE planting_calendars ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_planting_calendars_account ON planting_calendars(account_id);
CREATE INDEX IF NOT EXISTS idx_planting_calendars_crop ON planting_calendars(crop);

-- Volunteer signups
CREATE TABLE IF NOT EXISTS ngo_volunteers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  skills TEXT[],
  availability TEXT,                -- 'weekends', 'weekdays', 'flexible'
  status TEXT NOT NULL DEFAULT 'active',   -- 'active', 'inactive', 'on_leave'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ngo_volunteers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ngo_volunteers_account ON ngo_volunteers(account_id);

-- Donations
CREATE TABLE IF NOT EXISTS ngo_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID,
  donor_name TEXT NOT NULL,
  donor_phone TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'KES',
  campaign TEXT,                    -- Optional: which campaign/fund
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'confirmed', 'cancelled'
  payment_reference TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ngo_donations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ngo_donations_account ON ngo_donations(account_id);

-- Field reports (beneficiaries submit photos/issues)
CREATE TABLE IF NOT EXISTS ngo_field_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID,
  reporter_name TEXT,
  photo_url TEXT,
  description TEXT,
  category TEXT,                    -- 'crop_issue', 'weather_damage', 'pest', 'general'
  ai_diagnosis TEXT,
  advisor_response TEXT,
  status TEXT NOT NULL DEFAULT 'new',  -- 'new', 'reviewed', 'resolved'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ngo_field_reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ngo_field_reports_account ON ngo_field_reports(account_id);
