import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function focusableElements(surface) {
  return Array.from(surface.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => element.getClientRects().length > 0)
}

function containFocus(event, surface) {
  if (event.key !== 'Tab' || !surface) return

  const focusable = focusableElements(surface)
  if (focusable.length === 0) {
    event.preventDefault()
    surface.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement

  if (event.shiftKey && (active === first || !surface.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !surface.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

export function useDialogMechanics({
  onDismiss,
  dismissible = true,
  hasDescription = false,
  initialFocusRef,
  backdropEvent = 'mouseDown',
}) {
  const generatedId = useId()
  const titleId = `dialog-title-${generatedId}`
  const descriptionId = `dialog-description-${generatedId}`
  const surfaceRef = useRef(null)
  const previousFocusRef = useRef(null)
  const hasFocusedRef = useRef(false)
  const onDismissRef = useRef(onDismiss)
  const dismissibleRef = useRef(dismissible)

  useLayoutEffect(() => {
    onDismissRef.current = onDismiss
    dismissibleRef.current = dismissible
  }, [onDismiss, dismissible])

  const dismiss = useCallback(() => {
    if (!dismissibleRef.current) return false
    onDismissRef.current()
    return true
  }, [])

  const setSurface = useCallback((node) => {
    if (surfaceRef.current !== node) hasFocusedRef.current = false
    surfaceRef.current = node
  }, [])

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    return () => {
      const previousFocus = previousFocusRef.current
      if (previousFocus?.isConnected) previousFocus.focus?.()
    }
  }, [])

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || hasFocusedRef.current) return

    const explicitTarget = initialFocusRef?.current
    const authoredTarget = surface.querySelector('[data-autofocus="true"]')
    const target = explicitTarget || authoredTarget || focusableElements(surface)[0] || surface
    target.focus?.()
    hasFocusedRef.current = true
  })

  useLayoutEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') dismiss()
      containFocus(event, surfaceRef.current)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dismiss])

  const requestBackdropDismiss = (event) => {
    if (event.target === event.currentTarget) dismiss()
  }
  const isolateSurfaceEvent = (event) => event.stopPropagation()
  const backdropProps = backdropEvent === 'click'
    ? { onClick: requestBackdropDismiss }
    : { onMouseDown: requestBackdropDismiss }
  const surfaceEventProps = backdropEvent === 'click'
    ? { onClick: isolateSurfaceEvent }
    : { onMouseDown: isolateSurfaceEvent }

  return {
    backdropProps,
    surfaceProps: {
      ref: setSurface,
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': titleId,
      'aria-describedby': hasDescription ? descriptionId : undefined,
      tabIndex: -1,
      ...surfaceEventProps,
    },
    titleProps: { id: titleId },
    descriptionProps: hasDescription ? { id: descriptionId } : null,
    dismiss,
  }
}
