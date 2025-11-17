import type { UpdateEventListener, UpdateCompletedEvent } from '../types'

class UpdateEvents {
  private listeners: UpdateEventListener[] = []

  on(listener: UpdateEventListener) {
    this.listeners.push(listener)

    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  emit(event: UpdateCompletedEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('Update event listener error:', error)
      }
    })
  }
}

export const updateEvents = new UpdateEvents()
