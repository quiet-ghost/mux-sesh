import type { TextareaRenderable } from '@opentui/core'
import { testRender } from '@opentui/react/test-utils'
import { describe, expect, test } from 'bun:test'
import SearchInput from '../src/ui/SearchInput'
import { AppMode } from '../src/types'

describe('SearchInput', () => {
  test('places the rename cursor at the end of the existing session name', async () => {
    const existingName = 'session-name'
    const textareaRef: { current: TextareaRenderable | null } = { current: null }

    const setup = await testRender(
      <SearchInput
        appMode={AppMode.Rename}
        searchQuery={existingName}
        textareaRef={textareaRef}
        onContentChange={() => {}}
      />,
      {
        width: 80,
        height: 24,
      }
    )

    await setup.renderOnce()
    await Promise.resolve()

    expect(textareaRef.current?.plainText).toBe(existingName)
    expect(textareaRef.current?.cursorOffset).toBe(existingName.length)
  })
})
