/* @flow strict */

class RemoteInputElement extends HTMLElement {
  currentQuery: ?string
  debounceInputChange: Event => void
  boundFetchResults: Event => mixed

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

    this.debounceInputChange = debounce(() => fetchResults(this))
    this.boundFetchResults = () => fetchResults(this)
    input.addEventListener('focus', this.boundFetchResults)
    input.addEventListener('change', this.boundFetchResults)
    input.addEventListener('input', this.debounceInputChange)
  }

  disconnectedCallback() {
    const input = this.input
    if (!input) return

    input.removeEventListener('focus', this.boundFetchResults)
    input.removeEventListener('change', this.boundFetchResults)
    input.removeEventListener('input', this.debounceInputChange)
  }

  get input(): ?(HTMLInputElement | HTMLTextAreaElement) {
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

async function fetchResults(remoteInput: RemoteInputElement, checkCurrentQuery: boolean = true) {
  const input = remoteInput.input
  if (!input) return
  const query = input.value
  if (checkCurrentQuery && remoteInput.currentQuery === query) return
  remoteInput.currentQuery = query
  const src = remoteInput.src
  if (!src) return
  const resultsContainer = document.getElementById(remoteInput.getAttribute('aria-owns') || '')
  if (!resultsContainer) return

  const url = new URL(src, window.location.origin)
  const params = new URLSearchParams(url.search)
  params.append(remoteInput.getAttribute('param') || 'q', query)
  url.search = params.toString()

  remoteInput.dispatchEvent(new CustomEvent('loadstart'))
  remoteInput.setAttribute('loading', '')
  let response
  let errored = false
  let html = ''
  try {
    response = await fetch(url, {
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

function debounce(callback) {
  let timeout
  return function() {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      clearTimeout(timeout)
      callback()
    }, 300)
  }
}

export default RemoteInputElement

if (!window.customElements.get('remote-input')) {
  window.RemoteInputElement = RemoteInputElement
  window.customElements.define('remote-input', RemoteInputElement)
}
