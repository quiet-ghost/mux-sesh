import { test, expect, describe, mock } from 'bun:test'
import { updateEvents } from '../src/update/events'
import type { UpdateEvent } from '../src/types'

describe('UpdateEvents', () => {
  test('should call listener when event is emitted', () => {
    let called = false
    let receivedEvent: unknown = null

    const listener = (event: UpdateEvent) => {
      called = true
      receivedEvent = event
    }

    const unsubscribe = updateEvents.on(listener)
    updateEvents.emit({ kind: 'updated', currentVersion: '1.0.0', version: '2.0.0', installMethod: 'npm' })

    expect(called).toBe(true)
    expect(receivedEvent).not.toBeNull()
    const event = receivedEvent as UpdateEvent
    expect(event.kind).toBe('updated')
    expect(event.currentVersion).toBe('1.0.0')
    expect(event.version).toBe('2.0.0')
    expect(event.installMethod).toBe('npm')

    unsubscribe()
  })

  test('should call multiple listeners', () => {
    let called1 = false
    let called2 = false

    const listener1 = () => {
      called1 = true
    }
    const listener2 = () => {
      called2 = true
    }

    const unsubscribe1 = updateEvents.on(listener1)
    const unsubscribe2 = updateEvents.on(listener2)

    updateEvents.emit({ kind: 'updated', currentVersion: '1.0.0', version: '2.0.0', installMethod: 'npm' })

    expect(called1).toBe(true)
    expect(called2).toBe(true)

    unsubscribe1()
    unsubscribe2()
  })

  test('should not call listener after unsubscribe', () => {
    let callCount = 0

    const listener = () => {
      callCount++
    }

    const unsubscribe = updateEvents.on(listener)
    updateEvents.emit({ kind: 'updated', currentVersion: '1.0.0', version: '2.0.0', installMethod: 'npm' })
    expect(callCount).toBe(1)

    unsubscribe()
    updateEvents.emit({ kind: 'available', currentVersion: '1.0.0', version: '3.0.0', installMethod: 'unknown' })
    expect(callCount).toBe(1)
  })

  test('should handle listener errors gracefully', () => {
    let errorListenerCalled = false
    let normalListenerCalled = false
    const originalConsoleError = console.error
    console.error = mock(() => {})

    const errorListener = () => {
      errorListenerCalled = true
      throw new Error('Test error')
    }

    const normalListener = () => {
      normalListenerCalled = true
    }

    const unsubscribe1 = updateEvents.on(errorListener)
    const unsubscribe2 = updateEvents.on(normalListener)

    updateEvents.emit({ kind: 'failed', currentVersion: '1.0.0', version: '2.0.0', installMethod: 'bun' })

    expect(errorListenerCalled).toBe(true)
    expect(normalListenerCalled).toBe(true)

    unsubscribe1()
    unsubscribe2()
    console.error = originalConsoleError
  })

  test('should handle multiple unsubscribes', () => {
    const listener = () => {}

    const unsubscribe = updateEvents.on(listener)
    unsubscribe()
    unsubscribe() // Should not throw
  })

  test('should pass correct event data to listeners', () => {
    const testEvent: UpdateEvent = { kind: 'available', currentVersion: '4.5.5', version: '4.5.6', installMethod: 'unknown' }
    let receivedEvent: unknown = null

    const listener = (event: UpdateEvent) => {
      receivedEvent = event
    }

    const unsubscribe = updateEvents.on(listener)
    updateEvents.emit(testEvent)

    expect(receivedEvent).not.toBeNull()
    const event = receivedEvent as UpdateEvent
    expect(event.kind).toBe(testEvent.kind)
    expect(event.currentVersion).toBe(testEvent.currentVersion)
    expect(event.version).toBe('4.5.6')
    expect(event.installMethod).toBe(testEvent.installMethod)

    unsubscribe()
  })
})
