import { expect, test } from 'bun:test'
import { ActionOwner } from '../src/app/action-owner'
import { ActionRefused } from '../src/app/action-outcome'
import { settleTicks } from './fixtures/wait'

function recordingOwner() {
  const reports: Error[] = []
  const defects: unknown[] = []

  const owner = ActionOwner.create({
    report: cause => reports.push(cause),
    onDefect: cause => defects.push(cause),
  })

  return { owner, reports, defects }
}

test('a task that throws before returning a promise reaches crash recovery', () => {
  const { owner, reports, defects } = recordingOwner()
  const defect = new TypeError('synchronous defect')

  owner.run(() => {
    throw defect
  })

  expect(defects).toEqual([defect])
  expect(reports).toEqual([])
})

test('a rejected task reaches crash recovery, and an expected failure is reported instead', async () => {
  const { owner, reports, defects } = recordingOwner()
  const defect = new TypeError('asynchronous defect')
  const refused = new ActionRefused({ reason: 'Select a session first' })

  owner.run(async () => {
    throw defect
  })
  owner.run(async () => {
    throw refused
  })
  await settleTicks(2)

  expect(defects).toEqual([defect])
  expect(reports).toEqual([refused])
})
