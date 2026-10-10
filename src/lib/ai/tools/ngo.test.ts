import { describe, it, expect } from 'vitest'
import {
  ngoToolHandlers,
  ngoTools,
  enrollContactInCourse,
} from './ngo'
import type { ToolContext, ToolHandler } from './types'

type Row = Record<string, unknown>

function makeCtx(db: unknown, conversationId: string | null = 'conv-1'): ToolContext {
  return {
    db,
    accountId: 'acct-1',
    conversationId: conversationId || '',
    contactId: 'contact-1',
    contactPhone: '+254700000000',
    contactName: 'Jane',
    businessType: 'ngo_nonprofit',
    userId: 'user-1',
  }
}

describe('search_courses tool', () => {
  it('is registered in the NGO tool definitions', () => {
    const def = ngoTools.find((t) => t.function.name === 'search_courses')
    expect(def).toBeDefined()
  })

  it('returns list rows and persists search params for the More button', async () => {
    const state: { meta: Row } = { meta: {} }
    const db = {
      from: (table: string) => {
        if (table === 'training_courses') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  or: () => ({
                    order: () => ({
                      range: async () => ({
                        data: [
                          {
                            id: 'c1',
                            name: 'Farming 101',
                            description: 'Basics of farming',
                            short_description: 'Learn farming',
                            category: 'agriculture',
                            duration_weeks: 4,
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'conversations') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { metadata: state.meta } }),
              }),
            }),
            update: (payload: { metadata?: Row }) => ({
              eq: async () => {
                state.meta = (payload.metadata as Row) || {}
                return { error: null }
              },
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }

    const handler = ngoToolHandlers.search_courses as ToolHandler
    const result = (await handler({ query: 'maize' }, makeCtx(db))) as {
      courses: Array<{ id: string }>
      list_section?: { rows: Array<{ id: string; title: string }> }
    }

    expect(result.courses).toHaveLength(1)
    expect(result.list_section?.rows[0]?.id).toBe('ngo_course_select_c1')
    expect(result.list_section?.rows[0]?.title).toBe('Farming 101')
    expect((state.meta.ngo_course_search_params as { query?: string })?.query).toBe('maize')
  })
})

describe('apply_to_program', () => {
  it('falls back to the program remembered from the Apply Now tap', async () => {
    const state: { meta: Row; inserted: Row | null; enrollments: number | null } = {
      meta: { pending_ngo_program_id: 'p1', pending_ngo_program_name: 'Farm Support' },
      inserted: null,
      enrollments: null,
    }
    const db = {
      from: (table: string) => {
        if (table === 'conversations') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { metadata: state.meta } }),
              }),
            }),
            update: (payload: { metadata?: Row }) => ({
              eq: async () => {
                state.meta = (payload.metadata as Row) || {}
                return { error: null }
              },
            }),
          }
        }
        if (table === 'ngo_programs') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'p1', name: 'Farm Support', max_enrollments: null, current_enrollments: 3 },
                  }),
                }),
              }),
            }),
            update: (payload: { current_enrollments?: number }) => ({
              eq: async () => {
                state.enrollments = payload.current_enrollments ?? null
                return { error: null }
              },
            }),
          }
        }
        if (table === 'ngo_applications') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: async () => ({ data: null }) }),
                }),
              }),
            }),
            insert: (payload: Row) => {
              state.inserted = payload
              return {
                select: () => ({
                  single: async () => ({ data: { id: 'abcd1234-efgh' }, error: null }),
                }),
              }
            },
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }

    const handler = ngoToolHandlers.apply_to_program as ToolHandler
    // No program_id arg — remembered from the tap
    const result = (await handler({ applicant_name: 'Jane Doe' }, makeCtx(db))) as {
      success: boolean
      response?: string
    }

    expect(result.success).toBe(true)
    expect(state.inserted?.program_id).toBe('p1')
    expect(state.inserted?.applicant_name).toBe('Jane Doe')
    expect(state.enrollments).toBe(4)
    expect(state.meta.pending_ngo_program_id).toBeUndefined()
    expect(result.response).toContain('Application Submitted')
  })

  it('reports a full program honestly — no waiting-list claim', async () => {
    const db = {
      from: (table: string) => {
        if (table === 'conversations') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { metadata: {} } }),
              }),
            }),
          }
        }
        if (table === 'ngo_programs') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'p1', name: 'Farm Support', max_enrollments: 5, current_enrollments: 5 },
                  }),
                }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }

    const handler = ngoToolHandlers.apply_to_program as ToolHandler
    const result = (await handler({ program_id: 'p1', applicant_name: 'Jane' }, makeCtx(db))) as {
      success: boolean
      error?: string
    }

    expect(result.success).toBe(false)
    expect(result.error).toContain('full')
    expect(result.error).not.toContain('waiting list')
  })

  it('needs a program when none is given or remembered', async () => {
    const db = {
      from: (table: string) => {
        if (table === 'conversations') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { metadata: {} } }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }
    const handler = ngoToolHandlers.apply_to_program as ToolHandler
    const result = (await handler({ applicant_name: 'Jane' }, makeCtx(db))) as {
      success: boolean
      error?: string
    }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Which program')
  })
})

describe('ask_advisor', () => {
  it('ranks topics by question relevance, not first row', async () => {
    const topics = [
      { id: 't2', category: 'agronomy', title: 'Irrigation basics', content: 'Water management for farms', crop_type: null, region: null, media_url: null },
      { id: 't1', category: 'postharvest', title: 'Maize storage', content: 'Store maize dry to avoid aflatoxin', crop_type: 'maize', region: null, media_url: null },
    ]
    const db = {
      from: (table: string) => {
        if (table === 'advisory_topics') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: async () => ({ data: topics, error: null }),
                }),
              }),
            }),
          }
        }
        if (table === 'ai_knowledge_chunks') {
          return {
            select: () => ({
              eq: async () => ({ count: 0, error: null, data: null }),
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }

    const handler = ngoToolHandlers.ask_advisor as ToolHandler
    const result = (await handler({ question: 'How should I store maize after harvest?' }, makeCtx(db))) as {
      found: boolean
      topic?: { title: string } | null
      knowledge?: string[]
    }

    expect(result.found).toBe(true)
    expect(result.topic?.title).toBe('Maize storage')
    expect(result.knowledge).toEqual([])
  })

  it('reports honestly when neither topics nor documents match', async () => {
    const db = {
      from: (table: string) => {
        if (table === 'advisory_topics') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }
        }
        if (table === 'ai_knowledge_chunks') {
          return {
            select: () => ({
              eq: async () => ({ count: 0, error: null, data: null }),
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }

    const handler = ngoToolHandlers.ask_advisor as ToolHandler
    const result = (await handler({ question: 'quantum blockchain' }, makeCtx(db, null))) as {
      found: boolean
    }
    expect(result.found).toBe(false)
  })
})

describe('enrollContactInCourse', () => {
  it('enrolls an active course and returns the first lesson', async () => {
    const state: { inserted: Row | null } = { inserted: null }
    const db = {
      from: (table: string) => {
        if (table === 'training_courses') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { id: 'c1', name: 'Farming 101', description: '', duration_weeks: 4 },
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'training_enrollments') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: async () => ({ data: null }) }),
                }),
              }),
            }),
            insert: (payload: Row) => {
              state.inserted = payload
              return { select: () => ({ single: async () => ({ data: { id: 'e1' }, error: null }) }) }
            },
          }
        }
        if (table === 'training_lessons') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    order: () => ({
                      limit: async () => ({
                        data: [{ id: 'l1', title: 'Welcome', content: 'Intro content', lesson_type: 'text' }],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }

    const result = await enrollContactInCourse(db, 'acct-1', 'contact-1', 'c1')
    expect(result.ok).toBe(true)
    expect(result.courseName).toBe('Farming 101')
    expect(result.firstLesson?.title).toBe('Welcome')
    expect(state.inserted?.status).toBe('active')
  })

  it('detects an existing enrollment', async () => {
    const db = {
      from: (table: string) => {
        if (table === 'training_courses') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { id: 'c1', name: 'Farming 101', description: '', duration_weeks: 4 },
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'training_enrollments') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: async () => ({ data: { id: 'e9' } }) }),
                }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }

    const result = await enrollContactInCourse(db, 'acct-1', 'contact-1', 'c1')
    expect(result.ok).toBe(false)
    expect(result.alreadyEnrolled).toBe(true)
  })
})

describe('make_donation', () => {
  it('returns real payment instructions, never a fake payment link promise', async () => {
    const db = {
      from: (table: string) => {
        if (table === 'ngo_donations') {
          return {
            insert: (payload: Row) => {
              expect(payload.amount).toBe(500)
              expect(payload.status).toBe('pending')
              return {
                select: () => ({
                  single: async () => ({ data: { id: 'don-uuid-12345678' }, error: null }),
                }),
              }
            },
          }
        }
        if (table === 'tenant_settings') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { payment_methods: [] } }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }

    const handler = ngoToolHandlers.make_donation as ToolHandler
    const result = (await handler({ donor_name: 'John', amount: 500 }, makeCtx(db, null))) as {
      success: boolean
      response?: string
    }

    expect(result.success).toBe(true)
    expect(result.response).toContain('Donation')
    expect(result.response).toContain('payment handler will reach out')
    expect(result.response).not.toContain('payment link that will be sent')
  })
})
