/** App-wide input guards, installed once.
 *
 *  - Phone fields (type="tel") accept only digits, spaces, + - ( ).
 *  - Number fields that have min >= 0 never accept a minus sign or "e".
 *  - Fields marked data-digits take digits only (bank account numbers).
 *  - Fields marked data-pan are upper-cased, letters and digits only, 10 long.
 *
 * Values are rewritten with the native setter so React still sees the change
 * and updates its own state with the cleaned text. */
const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

function rewrite(el: HTMLInputElement, next: string) {
  if (el.value === next) return
  nativeSet.call(el, next)
}

function onInput(e: Event) {
  const el = e.target
  if (!(el instanceof HTMLInputElement)) return
  if (el.type === 'tel') {
    rewrite(el, el.value.replace(/[^0-9+\-()\s]/g, '').replace(/(?!^)\+/g, ''))
  } else if (el.dataset.digits !== undefined) {
    rewrite(el, el.value.replace(/\D/g, ''))
  } else if (el.dataset.pan !== undefined) {
    rewrite(el, el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))
  } else if (el.type === 'number' && el.min !== '' && Number(el.min) >= 0 && el.value.startsWith('-')) {
    rewrite(el, el.value.replace(/^-+/, ''))
  }
}

function onKeyDown(e: KeyboardEvent) {
  const el = e.target
  if (!(el instanceof HTMLInputElement) || el.type !== 'number') return
  if (el.min !== '' && Number(el.min) >= 0 && (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+')) {
    e.preventDefault()
  }
}

export function installInputGuards() {
  document.addEventListener('input', onInput, true)
  document.addEventListener('keydown', onKeyDown, true)
}
