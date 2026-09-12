// ============================================================
// NGO AI Tools — Programs, Training, Advisory, Donations, Volunteers
//
// Public-facing tools for beneficiaries, donors, volunteers.
// Internal operations stay in the dashboard.
//
// Categories:
// - Programs: search_programs, apply_to_program, get_application_status
// - Training: enroll_in_training, get_my_training, start_lesson,
//             submit_quiz_answer, get_training_progress
// - Advisory: ask_advisor, get_market_prices, get_planting_calendar,
//             get_best_practices, submit_field_photo
// - Donations: make_donation, get_impact_report
// - Volunteers: sign_up_volunteer, get_my_schedule
// ============================================================

import type { ToolDefinition, ToolHandler, ToolContext } from './types'

// ============================================================
// Tool Definitions
// ============================================================

export const ngoTools: ToolDefinition[] = [
  // ── PROGRAMS ──────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_programs',
      description: 'Search available NGO programs and services. Returns programs by category, eligibility, and status.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (e.g. "farming training", "health checkup", "scholarship")' },
          category: { type: 'string', description: 'Filter by category: health, education, agriculture, livelihoods, emergency' },
          limit: { type: 'number', description: 'Max programs to return (default 10)' },
          offset: { type: 'number', description: 'Offset for pagination (default 0)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_to_program',
      description: 'Submit an application to a program. Collects applicant info conversationally.',
      parameters: {
        type: 'object',
        properties: {
          program_id: { type: 'string', description: 'Program ID to apply to' },
          applicant_name: { type: 'string', description: 'Applicant full name' },
          answers: { type: 'string', description: 'JSON string of application answers (e.g. {"location":"Nakuru","farm_size":"2 acres","crop":"maize"})' },
          notes: { type: 'string', description: 'Additional notes from applicant' },
        },
        required: ['program_id', 'applicant_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_application_status',
      description: "Get the status of the user's program applications.",
      parameters: {
        type: 'object',
        properties: {
          program_name: { type: 'string', description: 'Filter by program name (optional)' },
        },
      },
    },
  },

  // ── TRAINING ──────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'enroll_in_training',
      description: 'Enroll in a training course. Returns enrollment confirmation and first lesson.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID to enroll in' },
        },
        required: ['course_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_training',
      description: "Get the user's enrolled training courses and overall progress.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_lesson',
      description: 'Start or resume the current lesson in an enrolled course.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
        },
        required: ['course_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_quiz_answer',
      description: 'Submit an answer to a quiz question. Returns score and explanation.',
      parameters: {
        type: 'object',
        properties: {
          lesson_id: { type: 'string', description: 'Lesson ID of the quiz' },
          answer: { type: 'string', description: 'The user answer (letter like "A" or full text)' },
        },
        required: ['lesson_id', 'answer'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_training_progress',
      description: 'Get detailed progress for a specific training course.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
        },
        required: ['course_id'],
      },
    },
  },

  // ── ADVISORY / EXTENSION ──────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'ask_advisor',
      description: 'Ask an agricultural/health/livelihoods question. Searches knowledge base for relevant answers.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask' },
          crop_type: { type: 'string', description: 'Optional: specific crop (e.g. "maize", "beans")' },
          region: { type: 'string', description: 'Optional: user region for localized advice' },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_prices',
      description: 'Get current market prices for crops in a location.',
      parameters: {
        type: 'object',
        properties: {
          crop: { type: 'string', description: 'Crop name (e.g. "maize", "beans", "tomatoes")' },
          location: { type: 'string', description: 'Market/location (e.g. "Nakuru", "Nairobi")' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_planting_calendar',
      description: 'Get planting and harvesting calendar for a crop in a region.',
      parameters: {
        type: 'object',
        properties: {
          crop: { type: 'string', description: 'Crop name' },
          region: { type: 'string', description: 'Region/location' },
        },
        required: ['crop'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_best_practices',
      description: 'Get best practices for a farming technique or activity.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic (e.g. "maize storage", "composting", "irrigation")' },
          crop_type: { type: 'string', description: 'Optional: specific crop' },
        },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_field_photo',
      description: 'Submit a field photo for expert review. Records the report and returns initial AI assessment.',
      parameters: {
        type: 'object',
        properties: {
          photo_url: { type: 'string', description: 'URL of the photo' },
          description: { type: 'string', description: 'Description of the issue observed' },
          crop_type: { type: 'string', description: 'Optional: crop being affected' },
        },
        required: ['photo_url', 'description'],
      },
    },
  },

  // ── DONATIONS ─────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'make_donation',
      description: 'Initiate a donation. Returns payment details and confirmation.',
      parameters: {
        type: 'object',
        properties: {
          donor_name: { type: 'string', description: 'Donor name' },
          amount: { type: 'number', description: 'Donation amount' },
          currency: { type: 'string', description: 'Currency (default KES)' },
          campaign: { type: 'string', description: 'Optional: specific campaign/fund to donate to' },
        },
        required: ['donor_name', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_impact_report',
      description: 'Get impact report showing what donations have achieved.',
      parameters: {
        type: 'object',
        properties: {
          campaign: { type: 'string', description: 'Optional: specific campaign' },
        },
      },
    },
  },

  // ── VOLUNTEERS ────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'sign_up_volunteer',
      description: 'Register as a volunteer. Collects info conversationally.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Volunteer name' },
          skills: { type: 'string', description: 'Comma-separated skills (e.g. "farming, teaching, first aid")' },
          availability: { type: 'string', description: 'Availability: weekdays, weekends, flexible' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_schedule',
      description: "Get the volunteer's assigned tasks and upcoming events.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

// ============================================================
// Standalone Search Functions (used by tool handlers + button handlers)
// ============================================================

export interface ProgramSearchParams {
  query?: string
  category?: string
  limit?: number
  offset?: number
}

export interface ProgramSearchResult {
  programs: Array<{
    id: string
    name: string
    description: string | null
    short_description: string | null
    category: string | null
    status: string
    current_enrollments: number
    max_enrollments: number | null
  }>
  count: number
  has_more: boolean
  offset: number
  buttons?: Array<{ id: string; title: string }>
  list_section?: {
    title: string
    rows: Array<{ id: string; title: string; description?: string }>
  }
}

export async function searchPrograms(
  db: any,
  accountId: string,
  params: ProgramSearchParams,
): Promise<ProgramSearchResult> {
  const limit = Math.min(params.limit || 10, 10)
  const offset = params.offset || 0

  let q = db
    .from('ngo_programs')
    .select('id, name, description, short_description, category, status, current_enrollments, max_enrollments')
    .eq('account_id', accountId)
    .eq('status', 'active')

  if (params.query) {
    q = q.or(`name.ilike.%${params.query}%,description.ilike.%${params.query}%,short_description.ilike.%${params.query}%`)
  }

  if (params.category) {
    q = q.eq('category', params.category)
  }

  const { data: programs, error } = await q
    .order('name')
    .range(offset, offset + limit - 1)

  if (error) {
    return { programs: [], count: 0, has_more: false, offset }
  }

  const resultItems = (programs || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    short_description: p.short_description,
    category: p.category,
    status: p.status,
    current_enrollments: p.current_enrollments || 0,
    max_enrollments: p.max_enrollments,
  }))

  const has_more = (programs || []).length === limit
  const nextOffset = offset + limit

  const result: ProgramSearchResult = {
    programs: resultItems,
    count: resultItems.length,
    has_more,
    offset,
  }

  if (has_more) {
    result.buttons = [{ id: `ngo_program_more_${nextOffset}`, title: 'See More →' }]
  }

  result.list_section = {
    title: 'Programs',
    rows: resultItems.map((item: { id: string; name: string; short_description: string | null; description: string | null }) => ({
      id: `ngo_program_select_${item.id}`,
      title: item.name,
      description: item.short_description || item.description || undefined,
    })),
  }

  return result
}

export interface CourseSearchParams {
  query?: string
  category?: string
  limit?: number
  offset?: number
}

export interface CourseSearchResult {
  courses: Array<{
    id: string
    name: string
    description: string | null
    short_description: string | null
    category: string | null
    duration_weeks: number
  }>
  count: number
  has_more: boolean
  offset: number
  buttons?: Array<{ id: string; title: string }>
  list_section?: {
    title: string
    rows: Array<{ id: string; title: string; description?: string }>
  }
}

export async function searchCourses(
  db: any,
  accountId: string,
  params: CourseSearchParams,
): Promise<CourseSearchResult> {
  const limit = Math.min(params.limit || 10, 10)
  const offset = params.offset || 0

  let q = db
    .from('training_courses')
    .select('id, name, description, short_description, category, duration_weeks')
    .eq('account_id', accountId)
    .eq('is_active', true)

  if (params.query) {
    q = q.or(`name.ilike.%${params.query}%,description.ilike.%${params.query}%`)
  }

  if (params.category) {
    q = q.eq('category', params.category)
  }

  const { data: courses, error } = await q
    .order('name')
    .range(offset, offset + limit - 1)

  if (error) {
    return { courses: [], count: 0, has_more: false, offset }
  }

  const resultItems = (courses || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    short_description: c.short_description,
    category: c.category,
    duration_weeks: c.duration_weeks || 4,
  }))

  const has_more = (courses || []).length === limit
  const nextOffset = offset + limit

  const result: CourseSearchResult = {
    courses: resultItems,
    count: resultItems.length,
    has_more,
    offset,
  }

  if (has_more) {
    result.buttons = [{ id: `ngo_course_more_${nextOffset}`, title: 'See More →' }]
  }

  result.list_section = {
    title: 'Training Courses',
    rows: resultItems.map((item: { id: string; name: string; duration_weeks: number; category: string | null }) => ({
      id: `ngo_course_select_${item.id}`,
      title: item.name,
      description: `${item.duration_weeks} weeks · ${item.category || 'general'}`,
    })),
  }

  return result
}

// ============================================================
// Tool Handlers
// ============================================================

const searchProgramsHandler: ToolHandler = async (args, ctx) => {
  const result = await searchPrograms(ctx.db, ctx.accountId, {
    query: args.query as string | undefined,
    category: args.category as string | undefined,
    limit: (args.limit as number) || undefined,
    offset: (args.offset as number) || undefined,
  })

  if (ctx.conversationId) {
    const searchParams = {
      query: args.query as string | undefined,
      category: args.category as string | undefined,
    }
    const { data: conv } = await ctx.db
      .from('conversations')
      .select('metadata')
      .eq('id', ctx.conversationId)
      .maybeSingle()

    await ctx.db
      .from('conversations')
      .update({
        metadata: {
          ...(conv?.metadata || {}),
          ngo_program_search_params: searchParams,
        },
      })
      .eq('id', ctx.conversationId)
  }

  return result
}

const applyToProgramHandler: ToolHandler = async (args, ctx) => {
  const programId = args.program_id as string
  const applicantName = (args.applicant_name as string) || ctx.contactName || 'Applicant'
  const answers = args.answers ? JSON.parse(args.answers as string) : {}
  const notes = (args.notes as string) || null

  const { data: program } = await ctx.db
    .from('ngo_programs')
    .select('id, name, max_enrollments, current_enrollments')
    .eq('id', programId)
    .eq('account_id', ctx.accountId)
    .maybeSingle()

  if (!program) {
    return { success: false, error: 'Program not found' }
  }

  if (program.max_enrollments && program.current_enrollments >= program.max_enrollments) {
    return { success: false, error: 'This program is full. You have been added to the waiting list.', waitlisted: true }
  }

  const { data: existing } = await ctx.db
    .from('ngo_applications')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('program_id', programId)
    .eq('contact_id', ctx.contactId)
    .maybeSingle()

  if (existing) {
    return { success: false, error: 'You have already applied to this program.' }
  }

  const { data: application, error } = await ctx.db
    .from('ngo_applications')
    .insert({
      account_id: ctx.accountId,
      program_id: programId,
      contact_id: ctx.contactId,
      conversation_id: ctx.conversationId,
      applicant_name: applicantName,
      applicant_phone: ctx.contactPhone || null,
      answers,
      notes,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !application) {
    console.error('[ngo tool] application error:', error)
    return { success: false, error: 'Failed to submit application' }
  }

  await ctx.db
    .from('ngo_programs')
    .update({ current_enrollments: program.current_enrollments + 1 })
    .eq('id', programId)

  return {
    success: true,
    application_id: application.id,
    program_name: program.name,
    response:
      `📋 *Application Submitted*\n\n` +
      `*Program:* ${program.name}\n` +
      `*Applicant:* ${applicantName}\n` +
      `*Reference:* ${application.id.slice(0, 8).toUpperCase()}\n\n` +
      `Your application is being reviewed. You will be notified of the outcome.`,
  }
}

const getApplicationStatusHandler: ToolHandler = async (args, ctx) => {
  let query = ctx.db
    .from('ngo_applications')
    .select('id, status, created_at, reviewed_at, notes, program:ngo_programs(name)')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', ctx.contactId)
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: applications } = await query

  if (!applications || applications.length === 0) {
    return { applications: [], count: 0, message: 'No applications found. Would you like to browse our programs?' }
  }

  return {
    applications: applications.map((a: any) => ({
      reference: a.id.slice(0, 8).toUpperCase(),
      program: a.program?.name || 'Unknown',
      status: a.status,
      applied: a.created_at,
      reviewed: a.reviewed_at,
    })),
    count: applications.length,
  }
}

const enrollInTrainingHandler: ToolHandler = async (args, ctx) => {
  const courseId = args.course_id as string

  const { data: course } = await ctx.db
    .from('training_courses')
    .select('id, name, description, duration_weeks')
    .eq('id', courseId)
    .eq('account_id', ctx.accountId)
    .eq('is_active', true)
    .maybeSingle()

  if (!course) {
    return { success: false, error: 'Course not found' }
  }

  const { data: existing } = await ctx.db
    .from('training_enrollments')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('course_id', courseId)
    .eq('contact_id', ctx.contactId)
    .maybeSingle()

  if (existing) {
    return { success: false, error: 'You are already enrolled in this course. Say "start lesson" to continue.' }
  }

  const { data: enrollment, error } = await ctx.db
    .from('training_enrollments')
    .insert({
      account_id: ctx.accountId,
      course_id: courseId,
      contact_id: ctx.contactId,
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !enrollment) {
    console.error('[ngo tool] enrollment error:', error)
    return { success: false, error: 'Failed to enroll' }
  }

  const { data: lessons } = await ctx.db
    .from('training_lessons')
    .select('id, title, content, lesson_type')
    .eq('course_id', courseId)
    .eq('account_id', ctx.accountId)
    .order('week_number')
    .order('day_number')
    .limit(1)

  const firstLesson = lessons?.[0]

  return {
    success: true,
    enrollment_id: enrollment.id,
    course_name: course.name,
    duration_weeks: course.duration_weeks,
    first_lesson: firstLesson ? {
      id: firstLesson.id,
      title: firstLesson.title,
      content: firstLesson.content,
      type: firstLesson.lesson_type,
    } : null,
    response:
      `🎓 *Enrolled!*\n\n` +
      `*Course:* ${course.name}\n` +
      `*Duration:* ${course.duration_weeks} weeks\n\n` +
      `Let's get started with your first lesson!`,
  }
}

const getMyTrainingHandler: ToolHandler = async (args, ctx) => {
  const { data: enrollments } = await ctx.db
    .from('training_enrollments')
    .select('id, status, enrolled_at, completed_at, course:training_courses(id, name, duration_weeks, category)')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', ctx.contactId)
    .order('enrolled_at', { ascending: false })

  if (!enrollments || enrollments.length === 0) {
    return { enrollments: [], count: 0, message: 'You are not enrolled in any courses yet. Say "show training" to browse courses.' }
  }

  const results = []
  for (const e of enrollments) {
    const { count: completedCount } = await ctx.db
      .from('training_progress')
      .select('*', { count: 'exact', head: true })
      .eq('enrollment_id', e.id)

    const { count: totalLessons } = await ctx.db
      .from('training_lessons')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', e.course?.id)

    results.push({
      enrollment_id: e.id,
      course: e.course?.name || 'Unknown',
      category: e.course?.category,
      status: e.status,
      progress: `${completedCount || 0}/${totalLessons || '?'} lessons`,
      enrolled: e.enrolled_at,
    })
  }

  return { enrollments: results, count: results.length }
}

const startLessonHandler: ToolHandler = async (args, ctx) => {
  const courseId = args.course_id as string

  const { data: enrollment } = await ctx.db
    .from('training_enrollments')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('course_id', courseId)
    .eq('contact_id', ctx.contactId)
    .eq('status', 'active')
    .maybeSingle()

  if (!enrollment) {
    return { success: false, error: 'You are not enrolled in this course.' }
  }

  const { data: completedLessonIds } = await ctx.db
    .from('training_progress')
    .select('lesson_id')
    .eq('enrollment_id', enrollment.id)

  const completedIds = (completedLessonIds || []).map((p: any) => p.lesson_id)

  let query = ctx.db
    .from('training_lessons')
    .select('id, title, content, media_url, lesson_type, quiz_data, week_number, day_number')
    .eq('course_id', courseId)
    .eq('account_id', ctx.accountId)
    .order('week_number')
    .order('day_number')

  const { data: lessons } = await query

  if (!lessons || lessons.length === 0) {
    return { success: false, error: 'No lessons available for this course yet.' }
  }

  const nextLesson = lessons.find((l: any) => !completedIds.includes(l.id))

  if (!nextLesson) {
    return {
      success: true,
      completed: true,
      response: '🎉 Congratulations! You have completed all lessons in this course!',
    }
  }

  return {
    success: true,
    lesson: {
      id: nextLesson.id,
      title: nextLesson.title,
      content: nextLesson.content,
      media_url: nextLesson.media_url,
      type: nextLesson.lesson_type,
      week: nextLesson.week_number,
      day: nextLesson.day_number,
      quiz_data: nextLesson.lesson_type === 'quiz' ? nextLesson.quiz_data : undefined,
    },
  }
}

const submitQuizAnswerHandler: ToolHandler = async (args, ctx) => {
  const lessonId = args.lesson_id as string
  const answer = (args.answer as string).trim()

  const { data: lesson } = await ctx.db
    .from('training_lessons')
    .select('id, quiz_data, course_id')
    .eq('id', lessonId)
    .eq('account_id', ctx.accountId)
    .maybeSingle()

  if (!lesson || !lesson.quiz_data) {
    return { success: false, error: 'Quiz not found' }
  }

  const quiz = lesson.quiz_data as Record<string, unknown>
  const correctAnswer = (quiz.correct_answer as string)?.toUpperCase()
  const userAnswer = answer.toUpperCase()
  const isCorrect = userAnswer === correctAnswer

  const { data: enrollment } = await ctx.db
    .from('training_enrollments')
    .select('id')
    .eq('course_id', lesson.course_id)
    .eq('contact_id', ctx.contactId)
    .eq('status', 'active')
    .maybeSingle()

  if (enrollment) {
    await ctx.db
      .from('training_progress')
      .upsert({
        enrollment_id: enrollment.id,
        lesson_id: lessonId,
        score: isCorrect ? 100 : 0,
        answers: { answer, correct: isCorrect },
      }, { onConflict: 'enrollment_id,lesson_id' })
  }

  return {
    success: true,
    correct: isCorrect,
    correct_answer: correctAnswer,
    explanation: quiz.explanation || null,
    response: isCorrect
      ? `✅ *Correct!*\n\n${quiz.explanation || 'Well done!'}`
      : `❌ *Not quite.* The correct answer is *${correctAnswer}*.\n\n${quiz.explanation || 'Review the lesson and try again.'}`,
  }
}

const getTrainingProgressHandler: ToolHandler = async (args, ctx) => {
  const courseId = args.course_id as string

  const { data: enrollment } = await ctx.db
    .from('training_enrollments')
    .select('id, status, enrolled_at, completed_at')
    .eq('course_id', courseId)
    .eq('contact_id', ctx.contactId)
    .maybeSingle()

  if (!enrollment) {
    return { enrolled: false, message: 'You are not enrolled in this course.' }
  }

  const { data: lessons } = await ctx.db
    .from('training_lessons')
    .select('id, title, week_number, day_number, lesson_type')
    .eq('course_id', courseId)
    .eq('account_id', ctx.accountId)
    .order('week_number')
    .order('day_number')

  const { data: progress } = await ctx.db
    .from('training_progress')
    .select('lesson_id, completed_at, score')
    .eq('enrollment_id', enrollment.id)

  const progressMap = new Map((progress || []).map((p: any) => [p.lesson_id, p]))

  const lessonStatuses = (lessons || []).map((l: any) => {
    const p = progressMap.get(l.id) as { score?: number } | undefined
    return {
      title: l.title,
      week: l.week_number,
      day: l.day_number,
      type: l.lesson_type,
      completed: !!p,
      score: p?.score || null,
    }
  })

  const completedCount = lessonStatuses.filter((ls: { completed: boolean }) => ls.completed).length
  const totalCount = lessonStatuses.length
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return {
    enrolled: true,
    status: enrollment.status,
    progress: `${completedCount}/${totalCount} lessons (${percentage}%)`,
    percentage,
    lessons: lessonStatuses,
    enrolled_at: enrollment.enrolled_at,
    completed_at: enrollment.completed_at,
  }
}

const askAdvisorHandler: ToolHandler = async (args, ctx) => {
  const question = args.question as string
  const cropType = (args.crop_type as string) || null
  const region = (args.region as string) || null

  let query = ctx.db
    .from('advisory_topics')
    .select('id, category, title, content, crop_type, region, media_url')
    .eq('account_id', ctx.accountId)
    .eq('is_active', true)

  if (cropType) {
    query = query.or(`crop_type.ilike.%${cropType}%,crop_type.is.null`)
  }

  const { data: topics } = await query.limit(5)

  if (!topics || topics.length === 0) {
    return {
      found: false,
      message: `I don't have specific information about that in our knowledge base. Let me connect you with our team for personalized advice.`,
    }
  }

  const bestMatch = topics[0]

  return {
    found: true,
    topic: {
      title: bestMatch.title,
      category: bestMatch.category,
      content: bestMatch.content,
      crop: bestMatch.crop_type,
      media_url: bestMatch.media_url,
    },
    other_related: topics.slice(1).map((t: any) => ({
      title: t.title,
      category: t.category,
    })),
  }
}

const getMarketPricesHandler: ToolHandler = async (args, ctx) => {
  const crop = args.crop as string | undefined
  const location = args.location as string | undefined

  let query = ctx.db
    .from('market_prices')
    .select('crop, location, price, currency, unit, source, recorded_date')
    .eq('account_id', ctx.accountId)

  if (crop) {
    query = query.ilike('crop', `%${crop}%`)
  }
  if (location) {
    query = query.ilike('location', `%${location}%`)
  }

  query = query.order('recorded_date', { ascending: false }).limit(10)

  const { data: prices } = await query

  if (!prices || prices.length === 0) {
    return { prices: [], message: 'No price data available right now. Please check back later.' }
  }

  return {
    prices: prices.map((p: any) => ({
      crop: p.crop,
      location: p.location,
      price: p.price,
      currency: p.currency || 'KES',
      unit: p.unit || 'kg',
      source: p.source,
      date: p.recorded_date,
    })),
    count: prices.length,
  }
}

const getPlantingCalendarHandler: ToolHandler = async (args, ctx) => {
  const crop = args.crop as string
  const region = (args.region as string) || null

  let query = ctx.db
    .from('planting_calendars')
    .select('crop, region, plant_start_month, plant_end_month, harvest_start_month, harvest_end_month, notes')
    .eq('account_id', ctx.accountId)
    .ilike('crop', `%${crop}%`)

  if (region) {
    query = query.or(`region.ilike.%${region}%,region.is.null`)
  }

  const { data: calendars } = await query.limit(5)

  if (!calendars || calendars.length === 0) {
    return { calendars: [], message: `No planting calendar found for ${crop}. Please contact our team.` }
  }

  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return {
    calendars: calendars.map((c: any) => ({
      crop: c.crop,
      region: c.region,
      plant_window: `${months[c.plant_start_month]} - ${months[c.plant_end_month]}`,
      harvest_window: `${months[c.harvest_start_month]} - ${months[c.harvest_end_month]}`,
      notes: c.notes,
    })),
  }
}

const getBestPracticesHandler: ToolHandler = async (args, ctx) => {
  const topic = args.topic as string
  const cropType = (args.crop_type as string) || null

  let query = ctx.db
    .from('advisory_topics')
    .select('id, title, content, crop_type, media_url')
    .eq('account_id', ctx.accountId)
    .eq('category', 'best_practice')
    .eq('is_active', true)
    .or(`title.ilike.%${topic}%,content.ilike.%${topic}%`)

  if (cropType) {
    query = query.or(`crop_type.ilike.%${cropType}%,crop_type.is.null`)
  }

  const { data: practices } = await query.limit(3)

  if (!practices || practices.length === 0) {
    return { practices: [], message: `No best practices found for "${topic}". Please contact our team.` }
  }

  return {
    practices: practices.map((p: any) => ({
      title: p.title,
      content: p.content,
      crop: p.crop_type,
      media_url: p.media_url,
    })),
  }
}

const submitFieldPhotoHandler: ToolHandler = async (args, ctx) => {
  const photoUrl = args.photo_url as string
  const description = args.description as string
  const cropType = (args.crop_type as string) || null

  const { data: report, error } = await ctx.db
    .from('ngo_field_reports')
    .insert({
      account_id: ctx.accountId,
      contact_id: ctx.contactId,
      reporter_name: ctx.contactName || 'Farmer',
      photo_url: photoUrl,
      description,
      category: 'crop_issue',
      status: 'new',
    })
    .select('id')
    .single()

  if (error || !report) {
    return { success: false, error: 'Failed to submit report' }
  }

  return {
    success: true,
    report_id: report.id,
    response:
      `📸 *Field Report Submitted*\n\n` +
      `*Description:* ${description}\n` +
      (cropType ? `*Crop:* ${cropType}\n` : '') +
      `*Reference:* ${report.id.slice(0, 8).toUpperCase()}\n\n` +
      `Our team will review your report and get back to you. ` +
      `In the meantime, here are some general tips for common crop issues:\n` +
      `- Check for pests on the undersides of leaves\n` +
      `- Ensure adequate water but avoid overwatering\n` +
      `- Remove affected plant parts to prevent spread`,
  }
}

const makeDonationHandler: ToolHandler = async (args, ctx) => {
  const donorName = (args.donor_name as string) || ctx.contactName || 'Donor'
  const amount = args.amount as number
  const currency = (args.currency as string) || 'KES'
  const campaign = (args.campaign as string) || null

  if (!amount || amount <= 0) {
    return { success: false, error: 'Please specify a valid donation amount.' }
  }

  const { data: donation, error } = await ctx.db
    .from('ngo_donations')
    .insert({
      account_id: ctx.accountId,
      contact_id: ctx.contactId,
      donor_name: donorName,
      donor_phone: ctx.contactPhone || null,
      amount,
      currency,
      campaign,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !donation) {
    return { success: false, error: 'Failed to record donation' }
  }

  return {
    success: true,
    donation_id: donation.id,
    response:
      `💰 *Donation*\n\n` +
      `*Donor:* ${donorName}\n` +
      `*Amount:* ${currency} ${amount.toLocaleString()}\n` +
      (campaign ? `*Campaign:* ${campaign}\n` : '') +
      `\nTo complete your donation, please use the payment link that will be sent to you. ` +
      `Thank you for your generosity!`,
  }
}

const getImpactReportHandler: ToolHandler = async (args, ctx) => {
  const { data: donations } = await ctx.db
    .from('ngo_donations')
    .select('amount, currency, campaign, created_at')
    .eq('account_id', ctx.accountId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(100)

  const { count: beneficiaryCount } = await ctx.db
    .from('ngo_applications')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId)
    .eq('status', 'approved')

  const { count: volunteerCount } = await ctx.db
    .from('ngo_volunteers')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId)
    .eq('status', 'active')

  const { count: trainedCount } = await ctx.db
    .from('training_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId)
    .eq('status', 'completed')

  const totalDonations = (donations || []).reduce((sum: number, d: any) => sum + (d.amount || 0), 0)
  const currency = donations?.[0]?.currency || 'KES'

  return {
    total_donations: totalDonations,
    currency,
    donation_count: (donations || []).length,
    beneficiaries_served: beneficiaryCount || 0,
    active_volunteers: volunteerCount || 0,
    people_trained: trainedCount || 0,
  }
}

const signUpVolunteerHandler: ToolHandler = async (args, ctx) => {
  const name = (args.name as string) || ctx.contactName || 'Volunteer'
  const skills = args.skills ? (args.skills as string).split(',').map((s: string) => s.trim()) : []
  const availability = (args.availability as string) || 'flexible'

  const { data: existing } = await ctx.db
    .from('ngo_volunteers')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', ctx.contactId)
    .maybeSingle()

  if (existing) {
    return { success: false, error: 'You are already registered as a volunteer.' }
  }

  const { data: volunteer, error } = await ctx.db
    .from('ngo_volunteers')
    .insert({
      account_id: ctx.accountId,
      contact_id: ctx.contactId,
      name,
      phone: ctx.contactPhone || null,
      skills,
      availability,
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !volunteer) {
    return { success: false, error: 'Failed to register' }
  }

  return {
    success: true,
    volunteer_id: volunteer.id,
    response:
      `🙋 *Volunteer Registration Confirmed!*\n\n` +
      `*Name:* ${name}\n` +
      (skills.length > 0 ? `*Skills:* ${skills.join(', ')}\n` : '') +
      `*Availability:* ${availability}\n\n` +
      `Thank you for volunteering! Our team will contact you with upcoming opportunities.`,
  }
}

const getMyScheduleHandler: ToolHandler = async (args, ctx) => {
  const { data: volunteer } = await ctx.db
    .from('ngo_volunteers')
    .select('id, name')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', ctx.contactId)
    .maybeSingle()

  if (!volunteer) {
    return { registered: false, message: 'You are not registered as a volunteer yet. Say "volunteer" to sign up.' }
  }

  return {
    registered: true,
    name: volunteer.name,
    message: `Hi ${volunteer.name}! Your upcoming tasks and events will appear here. Our team will assign tasks based on your skills and availability.`,
  }
}

// ============================================================
// Export Handlers
// ============================================================

export const ngoToolHandlers: Partial<Record<string, ToolHandler>> = {
  search_programs: searchProgramsHandler,
  apply_to_program: applyToProgramHandler,
  get_application_status: getApplicationStatusHandler,
  enroll_in_training: enrollInTrainingHandler,
  get_my_training: getMyTrainingHandler,
  start_lesson: startLessonHandler,
  submit_quiz_answer: submitQuizAnswerHandler,
  get_training_progress: getTrainingProgressHandler,
  ask_advisor: askAdvisorHandler,
  get_market_prices: getMarketPricesHandler,
  get_planting_calendar: getPlantingCalendarHandler,
  get_best_practices: getBestPracticesHandler,
  submit_field_photo: submitFieldPhotoHandler,
  make_donation: makeDonationHandler,
  get_impact_report: getImpactReportHandler,
  sign_up_volunteer: signUpVolunteerHandler,
  get_my_schedule: getMyScheduleHandler,
}
