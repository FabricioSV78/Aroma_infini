/** Bound public-read concurrency and drain a failed wave before propagating it.
 * Results keep input order; this never caches responses or changes their scope.
 */
export async function readPublicBatches<Input, Output>(
  inputs: readonly Input[],
  read: (input: Input) => Promise<Output>,
): Promise<Output[]> {
  const output: Output[] = []
  for (let offset = 0; offset < inputs.length; offset += 4) {
    const settled = await Promise.allSettled(
      inputs.slice(offset, offset + 4).map(async (input) => read(input)),
    )
    const failure = settled.find((result) => result.status === 'rejected')
    if (failure) throw failure.reason
    for (const result of settled) {
      if (result.status === 'fulfilled') output.push(result.value)
    }
  }
  return output
}
