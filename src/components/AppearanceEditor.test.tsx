import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AppearanceEditor } from './AppearanceEditor'
import { sampleGraph } from '../test/sampleGraph'

it('lets users select and customize furniture with labelled controls', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const onSelect = vi.fn()
  const { rerender } = render(<AppearanceEditor graph={sampleGraph} selectedIds={[]} onSelect={onSelect} onChange={onChange} />)
  await user.selectOptions(screen.getByLabelText('Object'), 'table-1')
  expect(onSelect).toHaveBeenCalledWith('table-1')
  rerender(<AppearanceEditor graph={sampleGraph} selectedIds={['table-1']} onSelect={onSelect} onChange={onChange} />)
  await user.selectOptions(screen.getByLabelText('Shape'), 'oval')
  expect(onChange).toHaveBeenCalledWith('table-1', { shape: 'oval' })
  await user.selectOptions(screen.getByLabelText('Material'), 'fabric')
  expect(onChange).toHaveBeenCalledWith('table-1', { material: 'fabric' })
  await user.click(screen.getByRole('button', { name: 'Use color #467568' }))
  expect(onChange).toHaveBeenCalledWith('table-1', { color: '#467568' })
})
