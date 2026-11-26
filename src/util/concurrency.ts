export async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  limit: number,
  map: (input: Input) => Promise<Output>
): Promise<Output[]> {
  const outputs: Output[] = []
  const pending = inputs.entries()

  async function work(): Promise<void> {
    for (let next = pending.next(); !next.done; next = pending.next()) {
      const [index, input] = next.value
      outputs[index] = await map(input)
    }
  }

  const workerCount = Math.max(1, Math.min(limit, inputs.length))
  await Promise.all(Array.from({ length: workerCount }, work))

  return outputs
}
