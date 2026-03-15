import { join } from 'path'

export const OPENCODE_DATA_DIR = join(process.env.HOME || '', '.local/share/opencode')
export const OPENCODE_DATABASE_PATH = join(OPENCODE_DATA_DIR, 'opencode.db')
export const OPENCODE_STORAGE = join(process.env.HOME || '', '.local/share/opencode/storage')
export const SESSION_STORAGE = join(OPENCODE_STORAGE, 'session')
export const MESSAGE_STORAGE = join(OPENCODE_STORAGE, 'message')
