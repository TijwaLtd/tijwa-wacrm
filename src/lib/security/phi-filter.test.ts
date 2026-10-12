import { describe, it, expect } from 'vitest'
import { screenOutboundForPhi } from './phi-filter'

const BOOKING_URL = 'https://app.example.com/jane-c/c/123e4567-e89b-12d3-a456-426614174000'

describe('screenOutboundForPhi', () => {
  it('passes ordinary scheduling text through', () => {
    expect(screenOutboundForPhi('Great — I have you booked for Tuesday at 10am.').blocked).toBe(false)
    expect(screenOutboundForPhi('Our clinic is open 8am–6pm weekdays.').blocked).toBe(false)
    expect(screenOutboundForPhi('Thatll be 1,500 KES for the consultation.').blocked).toBe(false)
  })

  it('blocks severe clinical terms (symptoms, diagnosis, medication)', () => {
    expect(screenOutboundForPhi('Your symptoms suggest a bacterial infection.').blocked).toBe(true)
    expect(screenOutboundForPhi('I would diagnose that as dermatitis.').blocked).toBe(true)
    expect(screenOutboundForPhi('Take the medication twice daily with food.').blocked).toBe(true)
    expect(screenOutboundForPhi('Your pregnancy is progressing normally.').blocked).toBe(true)
    expect(screenOutboundForPhi('The test results came back negative.').blocked).toBe(true)
    expect(screenOutboundForPhi('That could be a sign of diabetes.').blocked).toBe(true)
  })

  it('returns a redirect replacement that never contains the original PHI', () => {
    const res = screenOutboundForPhi('Your symptoms suggest pneumonia.', BOOKING_URL)
    expect(res.blocked).toBe(true)
    expect(res.replacement).toBeTruthy()
    expect(res.replacement).not.toContain('pneumonia')
    expect(res.replacement).not.toContain('symptoms')
    expect(res.replacement).toContain(BOOKING_URL)
  })

  it('omits the booking link when none is supplied', () => {
    const res = screenOutboundForPhi('I would diagnose that as eczema.')
    expect(res.blocked).toBe(true)
    expect(res.replacement).not.toContain('http')
  })

  it('lets pure scheduling text with a medium-severity word through', () => {
    // "pain" appears but the message is clearly just booking logistics.
    expect(
      screenOutboundForPhi('I can book you in for a pain clinic slot on Thursday.').blocked,
    ).toBe(false)
  })

  it('blocks medium-severity terms when the text is not scheduling context', () => {
    expect(screenOutboundForPhi('The swelling should go down in a few days.').blocked).toBe(true)
    expect(screenOutboundForPhi('Some bleeding afterward is normal.').blocked).toBe(true)
    expect(screenOutboundForPhi('Physiotherapy may help with the ache.').blocked).toBe(true)
  })

  it('is a no-op on empty text', () => {
    expect(screenOutboundForPhi('').blocked).toBe(false)
    expect(screenOutboundForPhi('   ').blocked).toBe(false)
  })
})
