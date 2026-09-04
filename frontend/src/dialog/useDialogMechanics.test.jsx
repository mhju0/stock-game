import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDialogMechanics } from './useDialogMechanics'

function DialogHarness({
  onDismiss,
  dismissible = true,
  visible = true,
  initialFocusRef,
  backdropEvent = 'mouseDown',
}) {
  const dialog = useDialogMechanics({
    onDismiss,
    dismissible,
    hasDescription: true,
    initialFocusRef,
    backdropEvent,
  })

  if (!visible) return null

  return (
    <div data-testid="backdrop" {...dialog.backdropProps}>
      <div data-testid="surface" {...dialog.surfaceProps}>
        <h2 {...dialog.titleProps}>Dialog title</h2>
        <p {...dialog.descriptionProps}>Dialog description</p>
        <input aria-label="First field" data-autofocus="true" />
        <button type="button" onClick={dialog.dismiss}>Close</button>
      </div>
    </div>
  )
}

describe('useDialogMechanics', () => {
  afterEach(() => {
    cleanup()
  })

  it('owns ARIA wiring and initial focus', () => {
    render(<DialogHarness onDismiss={vi.fn()} />)

    const surface = screen.getByTestId('surface')
    const first = screen.getByRole('textbox', { name: 'First field' })
    const title = screen.getByRole('heading', { name: 'Dialog title' })
    const description = screen.getByText('Dialog description')

    expect(surface.getAttribute('role')).toBe('dialog')
    expect(surface.getAttribute('aria-modal')).toBe('true')
    expect(surface.getAttribute('aria-labelledby')).toBe(title.id)
    expect(surface.getAttribute('aria-describedby')).toBe(description.id)
    expect(document.activeElement).toBe(first)
  })

  it('routes Escape, backdrop, and close controls through one dismissal rule', () => {
    const onDismiss = vi.fn()
    const view = render(
      <DialogHarness onDismiss={onDismiss} dismissible={false} />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.mouseDown(screen.getByTestId('backdrop'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onDismiss).not.toHaveBeenCalled()

    view.rerender(<DialogHarness onDismiss={onDismiss} dismissible />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    fireEvent.mouseDown(screen.getByTestId('surface'))
    expect(onDismiss).toHaveBeenCalledTimes(1)

    fireEvent.mouseDown(screen.getByTestId('backdrop'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onDismiss).toHaveBeenCalledTimes(3)
  })

  it('focuses a delayed surface and restores the opener on cleanup', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open dialog'
    document.body.appendChild(opener)
    opener.focus()
    const explicitTarget = createRef()

    function DelayedDialog({ visible }) {
      const dialog = useDialogMechanics({
        onDismiss: vi.fn(),
        initialFocusRef: explicitTarget,
      })

      if (!visible) return null

      return (
        <div {...dialog.backdropProps}>
          <div {...dialog.surfaceProps}>
            <h2 {...dialog.titleProps}>Delayed dialog</h2>
            <button ref={explicitTarget} type="button">Preferred target</button>
          </div>
        </div>
      )
    }

    const view = render(<DelayedDialog visible={false} />)
    expect(document.activeElement).toBe(opener)

    view.rerender(<DelayedDialog visible />)
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Preferred target' }),
    )

    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('restores the opener when the dialog is visible on initial mount', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open dialog'
    document.body.appendChild(opener)
    opener.focus()

    const view = render(<DialogHarness onDismiss={vi.fn()} />)
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'First field' }),
    )

    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('preserves click-phase backdrop dismissal when requested', () => {
    const onDismiss = vi.fn()
    render(
      <DialogHarness
        onDismiss={onDismiss}
        backdropEvent="click"
      />,
    )

    fireEvent.mouseDown(screen.getByTestId('backdrop'))
    expect(onDismiss).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('backdrop'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
