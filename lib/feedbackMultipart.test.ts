import { describe, expect, it } from 'vitest'
import { parseMultipartFeedbackBody } from './feedbackMultipart'

describe('parseMultipartFeedbackBody errors', () => {
  it('requires payload field', () => {
    const boundary = 'b'
    const body = Buffer.from(`--${boundary}--\r\n`)
    const r = parseMultipartFeedbackBody(body, `multipart/form-data; boundary=${boundary}`)
    expect(r).toEqual({ error: 'Missing payload field' })
  })
})
