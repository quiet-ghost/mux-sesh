export function getBrowserCommand(
  url: string,
  targetPlatform: NodeJS.Platform
): string[] | undefined {
  if (targetPlatform === 'darwin') return ['open', url]
  if (targetPlatform === 'linux') return ['xdg-open', url]
  if (targetPlatform === 'win32') return ['rundll32.exe', 'url.dll,FileProtocolHandler', url]
  return undefined
}

export async function openBrowser(
  input: URL | string,
  targetPlatform: NodeJS.Platform = process.platform
): Promise<boolean> {
  let url: URL
  try {
    url = input instanceof URL ? input : new URL(input)
  } catch {
    return false
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  const command = getBrowserCommand(url.toString(), targetPlatform)
  if (!command) return false

  try {
    const proc = Bun.spawn(command, {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    })
    await proc.exited
    return proc.exitCode === 0
  } catch {
    return false
  }
}
