import { test, expect, describe } from 'bun:test'
import { updateEvents } from '../src/update/events'

describe('UpdateEvents', () => {
  test('should call listener when event is emitted', () => {
    let called = false
    let receivedEvent: any = null

    const listener = (event: any) => {
      called = true
      receivedEvent = event
    }

    const unsubscribe = updateEvents.on(listener)
    updateEvents.emit({ version: '2.0.0' })

    expect(called).toBe(true)
    expect(receivedEvent).toEqual({ version: '2.0.0' })

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

    updateEvents.emit({ version: '2.0.0' })

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
    updateEvents.emit({ version: '2.0.0' })
    expect(callCount).toBe(1)

    unsubscribe()
    updateEvents.emit({ version: '3.0.0' })
    expect(callCount).toBe(1)
  })

  test('should handle listener errors gracefully', () => {
    let errorListenerCalled = false
    let normalListenerCalled = false

    const errorListener = () => {
      errorListenerCalled = true
      throw new Error('Test error')
    }

    const normalListener = () => {
      normalListenerCalled = true
    }

    const unsubscribe1 = updateEvents.on(errorListener)
    const unsubscribe2 = updateEvents.on(normalListener)

    updateEvents.emit({ version: '2.0.0' })

    expect(errorListenerCalled).toBe(true)
    expect(normalListenerCalled).toBe(true)

    unsubscribe1()
    unsubscribe2()
  })

  test('should handle multiple unsubscribes', () => {
    const listener = () => {}

    const unsubscribe = updateEvents.on(listener)
    unsubscribe()
    unsubscribe() // Should not throw
  })

  test('should pass correct event data to listeners', () => {
    const testEvent = { version: '4.5.6' }
    let receivedEvent: any = null

    const listener = (event: any) => {
      receivedEvent = event
    }

    const unsubscribe = updateEvents.on(listener)
    updateEvents.emit(testEvent)

    expect(receivedEvent).toEqual(testEvent)
    expect(receivedEvent.version).toBe('4.5.6')

    unsubscribe()
  })
})
