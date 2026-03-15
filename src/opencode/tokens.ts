import { spawn } from 'bun'
import { getAssistantCostTotalBySession, getLastAssistantMessageData } from './sqlite'

const modelContextLimitCache = new Map<string, number>()

function getModelCacheKey(modelID: string, providerID: string): string {
  return `${providerID}:${modelID}`
}

export async function getModelContextLimit(modelID: string, providerID: string): Promise<number> {
  const cacheKey = getModelCacheKey(modelID, providerID)
  const cachedLimit = modelContextLimitCache.get(cacheKey)
  if (cachedLimit !== undefined) {
    return cachedLimit
  }

  try {
    const proc = spawn(['opencode', 'models', providerID, '--verbose'])
    const output = await new Response(proc.stdout).text()
    await proc.exited

    if (proc.exitCode !== 0) {
      throw new Error(`opencode models exited with code ${proc.exitCode}`)
    }

    const lines = output.split('\n')
    let inTargetModel = false
    let jsonBuffer = ''

    for (const line of lines) {
      if (line === `${providerID}/${modelID}`) {
        inTargetModel = true
        jsonBuffer = ''
        continue
      }

      if (!inTargetModel) {
        continue
      }

      if (/^[a-z0-9-]+\//i.test(line)) {
        break
      }

      jsonBuffer += `${line}\n`
    }

    if (jsonBuffer) {
      const modelData = JSON.parse(jsonBuffer) as { limit?: { context?: number } }
      const contextLimit = modelData.limit?.context
      if (typeof contextLimit === 'number' && Number.isFinite(contextLimit)) {
        modelContextLimitCache.set(cacheKey, contextLimit)
        return contextLimit
      }
    }
  } catch (error) {
    console.error('Failed to get model context limit:', error)
  }

  const fallbackLimit = getFallbackContextLimit(modelID)
  modelContextLimitCache.set(cacheKey, fallbackLimit)
  return fallbackLimit
}

function getFallbackContextLimit(modelID: string): number {
  if (modelID.includes('claude-sonnet-4')) return 1000000
  if (modelID.includes('claude')) return 200000
  if (modelID.includes('gpt-4o')) return 128000
  if (modelID.includes('gpt-4')) return 128000
  return 200000
}

export async function getLastMessageTokens(sessionID: string): Promise<{
  lastMessageTokens: number
  contextLimit: number
  totalCost: number
  modelID?: string
  providerID?: string
} | null> {
  if (!sessionID) {
    return null
  }

  const lastAssistantMessage = await getLastAssistantMessageData(sessionID)
  if (!lastAssistantMessage) {
    return null
  }

  const totalCost = await getAssistantCostTotalBySession(sessionID)
  const contextLimit =
    lastAssistantMessage.modelID && lastAssistantMessage.providerID
      ? await getModelContextLimit(lastAssistantMessage.modelID, lastAssistantMessage.providerID)
      : 200000

  return {
    lastMessageTokens:
      lastAssistantMessage.tokens.input +
      lastAssistantMessage.tokens.output +
      lastAssistantMessage.tokens.reasoning +
      lastAssistantMessage.tokens.cacheRead +
      lastAssistantMessage.tokens.cacheWrite,
    contextLimit,
    totalCost,
    modelID: lastAssistantMessage.modelID,
    providerID: lastAssistantMessage.providerID,
  }
}

export function estimateSessionCost(inputTokens: number, outputTokens: number): string {
  const inputCost = (inputTokens / 1_000_000) * 3
  const outputCost = (outputTokens / 1_000_000) * 15
  const total = inputCost + outputCost

  if (total < 0.01) return '<$0.01'
  return `$${total.toFixed(2)}`
}
