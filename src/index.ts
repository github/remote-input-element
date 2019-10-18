const states = new WeakMap()

class RemoteInputElement extends HTMLElement {
  constructor() {
    super()
    const fetch = fetchResults.bind(this, this, true)
    const state = {currentQuery: null, oninput: debounce(fetch), fetch}
    states.set(this, state)
  }

  static get observedAttributes() {
    return ['src']
  }

  attributeChangedCallback(name: string, oldValue: string) {
    if (oldValue && name === 'src') {
      fetchResults(this, false)
    }
  }

  connectedCallback() {
    const input = this.input
    if (!input) return

    input.setAttribute('autocomplete', 'off')
    input.setAttribute('spellcheck', 'false')

    const state = states.get(this)
    if (!state) return

    input.addEventListener('focus', state.fetch)
    input.addEventListener('change', state.fetch)
    input.addEventListener('input', state.oninput)
  }

  disconnectedCallback() {
    const input = this.input
    if (!input) return

    const state = states.get(this)
    if (!state) return

    input.removeEventListener('focus', state.fetch)
    input.removeEventListener('change', state.fetch)
    input.removeEventListener('input', state.oninput)
  }

  get input(): HTMLInputElement | HTMLTextAreaElement | null {
    const input = this.querySelector('input, textarea')
    return input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? input : null
  }

  get src(): string {
    return this.getAttribute('src') || ''
  }

  set src(url: string) {
    this.setAttribute('src', url)
  }
}

async function fetchResults(remoteInput: RemoteInputElement, checkCurrentQuery: boolean) {
  const input = remoteInput.input
  if (!input) return

  const state = states.get(remoteInput)
  if (!state) return

  const query = input.value
  if (checkCurrentQuery && state.currentQuery === query) return

  state.currentQuery = query

  const src = remoteInput.src
  if (!src) return

  const resultsContainer = document.getElementById(remoteInput.getAttribute('aria-owns') || '')
  if (!resultsContainer) return

  const url = new URL(src, window.location.href)
  const params = new URLSearchParams(url.search)
  params.append(remoteInput.getAttribute('param') || 'q', query)
  url.search = params.toString()

  remoteInput.dispatchEvent(new CustomEvent('loadstart'))
  remoteInput.setAttribute('loading', '')
  let response
  let errored = false
  let html = ''
  try {
    response = await fetch(url.toString(), {
      credentials: 'same-origin',
      headers: {accept: 'text/html; fragment'}
    })
    html = await response.text()
    remoteInput.dispatchEvent(new CustomEvent('load'))
  } catch {
    errored = true
    remoteInput.dispatchEvent(new CustomEvent('error'))
  }
  remoteInput.removeAttribute('loading')
  if (errored) return

  if (response && response.ok) {
    remoteInput.dispatchEvent(new CustomEvent('remote-input-success', {bubbles: true}))
    resultsContainer.innerHTML = html
  } else {
    remoteInput.dispatchEvent(new CustomEvent('remote-input-error', {bubbles: true}))
  }

  remoteInput.dispatchEvent(new CustomEvent('loadend'))
}

function debounce(callback: () => void) {
  let timeout: number
  return function() {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      clearTimeout(timeout)
      callback()
    }, 300)
  }
}

export default RemoteInputElement

declare global {
  interface Window {
    RemoteInputElement: typeof RemoteInputElement
  }
}

if (!window.customElements.get('remote-input')) {
  window.RemoteInputElement = RemoteInputElement
  window.customElements.define('remote-input', RemoteInputElement)
}
