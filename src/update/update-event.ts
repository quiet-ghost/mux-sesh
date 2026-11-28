export type InstallMethod = 'npm' | 'bun' | 'brew' | 'mise' | 'source' | 'unknown'

export type UpdateEvent =
  | {
      kind: 'updated'
      currentVersion: string
      version: string
      installMethod: InstallMethod
    }
  | {
      kind: 'available'
      currentVersion: string
      version: string
      installMethod: InstallMethod
    }
  | {
      kind: 'failed'
      currentVersion: string
      version: string
      installMethod: InstallMethod
    }

export type UpdateEventListener = (event: UpdateEvent) => void
