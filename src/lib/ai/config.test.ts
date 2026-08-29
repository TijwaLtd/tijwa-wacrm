import { describe, it, expect, vi } from 'vitest'

// Mock env vars
vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')

import { loadAiConfig } from './config'

describe('loadAiConfig', () => {
  it('returns config when platform key is set', async () => {
    const config = await loadAiConfig()
    expect(config).not.toBeNull()
    expect(config!.provider).toBe('openai')
    expect(config!.apiKey).toBe('test-openai-key')
  })

  it('returns null when provider has no platform key', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const config = await loadAiConfig()
    expect(config).toBeNull()
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
  })
})
