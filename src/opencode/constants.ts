import { join } from 'path'

export const OPENCODE_STORAGE = join(process.env.HOME || '', '.local/share/opencode/storage')
export const SESSION_STORAGE = join(OPENCODE_STORAGE, 'session')
export const MESSAGE_STORAGE = join(OPENCODE_STORAGE, 'message')
