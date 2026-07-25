import { describe, expect, mock, test } from 'bun:test'
import { focusTextarea } from '../src/ui/use-textarea-focus'

describe('textarea focus', () => {
  test('ignores missing and already destroyed renderables', () => {
    const focus = mock(() => {})
    const gotoLineEnd = mock(() => true)

    focusTextarea(null, true)
    focusTextarea({ isDestroyed: true, focus, gotoLineEnd }, true)

    expect(focus).not.toHaveBeenCalled()
    expect(gotoLineEnd).not.toHaveBeenCalled()
  })

  test('does not move the cursor if focus destroyed the renderable', () => {
    const textarea = {
      isDestroyed: false,
      focus: mock(() => {
        textarea.isDestroyed = true
      }),
      gotoLineEnd: mock(() => true),
    }

    focusTextarea(textarea, true)

    expect(textarea.focus).toHaveBeenCalledTimes(1)
    expect(textarea.gotoLineEnd).not.toHaveBeenCalled()
  })
})
