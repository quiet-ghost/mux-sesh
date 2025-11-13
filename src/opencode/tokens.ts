import { spawn } from 'bun'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { MESSAGE_STORAGE } from './constants'

export async function getModelContextLimit(modelID: string, providerID: string): Promise<number> {
  try {
    const proc = spawn(['opencode', 'models', providerID, '--verbose'])
    const output = await new Response(proc.stdout).text()

    const lines = output.split('\n')
    let inTargetModel = false
    let jsonBuffer = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line === `${providerID}/${modelID}`) {
        inTargetModel = true
        jsonBuffer = ''
        continue
      }

      if (inTargetModel) {
        if (line.match(/^[a-z]+\//)) {
          break
        }
        jsonBuffer += line + '\n'
      }
    }

    if (jsonBuffer) {
      const modelData = JSON.parse(jsonBuffer)
      if (modelData.limit?.context) {
        return modelData.limit.context
      }
    }

    if (modelID.includes('claude-sonnet-4')) return 1000000 // Sonnet 4.x has 1M
    if (modelID.includes('claude-opus-4')) return 200000
    if (modelID.includes('claude-3')) return 200000
    if (modelID.includes('gpt-4o')) return 128000
    if (modelID.includes('gpt-4')) return 128000

    return 200000
  } catch (error) {
    console.error('Failed to get model context limit:', error)

    if (modelID.includes('claude-sonnet-4')) return 1000000
    if (modelID.includes('claude')) return 200000
    if (modelID.includes('gpt-4')) return 128000
    return 200000
  }
}

export async function getLastMessageTokens(sessionID: string): Promise<{
  lastMessageTokens: number
  contextLimit: number
  totalCost: number
  modelID?: string
  providerID?: string
} | null> {
  try {
    if (!sessionID) return null

    const messageDir = join(MESSAGE_STORAGE, sessionID)
    const messageFiles = await readdir(messageDir).catch(() => [])

    const messagesWithTime: Array<{ file: string; message: any; created: number }> = []

    for (const file of messageFiles) {
      if (!file.endsWith('.json')) continue

      try {
        const content = await readFile(join(messageDir, file), 'utf-8')
        const message = JSON.parse(content)
        messagesWithTime.push({
          file,
          message,
          created: message.time?.created || 0,
        })
      } catch (err) {
        continue
      }
    }

    // Sort by time.created (chronological order)
    messagesWithTime.sort((a, b) => a.created - b.created)

    let totalCost = 0
    let lastAssistantMessage: any = null

    // Find last assistant message and calculate cumulative cost
    for (const item of messagesWithTime) {
      const message = item.message

      if (message.role === 'assistant') {
        totalCost += message.cost || 0

        // Keep track of last assistant message with output > 0
        if (message.tokens && message.tokens.output > 0) {
          lastAssistantMessage = message
        }
      }
    }

    if (!lastAssistantMessage || !lastAssistantMessage.tokens) return null

    const tokens = lastAssistantMessage.tokens
    const lastMessageTotal =
      (tokens.input || 0) +
      (tokens.output || 0) +
      (tokens.reasoning || 0) +
      (tokens.cache?.read || 0) +
      (tokens.cache?.write || 0)

    // Get model context limit dynamically
    const contextLimit = await getModelContextLimit(
      lastAssistantMessage.modelID,
      lastAssistantMessage.providerID
    )

    return {
      lastMessageTokens: lastMessageTotal,
      contextLimit,
      totalCost,
      modelID: lastAssistantMessage.modelID,
      providerID: lastAssistantMessage.providerID,
    }
  } catch (error) {
    console.error('Failed to get last message tokens:', error)
    return null
  }
}

export function estimateSessionCost(inputTokens: number, outputTokens: number): string {
  const inputCost = (inputTokens / 1_000_000) * 3
  const outputCost = (outputTokens / 1_000_000) * 15
  const total = inputCost + outputCost

  if (total < 0.01) return '<$0.01'
  return `$${total.toFixed(2)}`
}
