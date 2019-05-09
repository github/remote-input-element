/* @flow strict */

class RemoteInputElement extends HTMLElement {
  currentQuery: ?string
  debounceInputChange: Event => void
  boundFetchResults: Event => mixed

  connectedCallback() {
    const input = this.input
    if (!input) return

    input.setAttribute('autocomplete', 'off')
    input.setAttribute('spellcheck', 'false')

    this.debounceInputChange = debounce(this.fetchResults.bind(this))
    this.boundFetchResults = this.fetchResults.bind(this)
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

  get input(): ?HTMLInputElement {
    const input = this.querySelector('input, textarea')
    return input instanceof HTMLInputElement ? input : null
  }

  get resultsContainer(): ?HTMLElement {
    return document.getElementById(this.getAttribute('aria-owns') || '')
  }

  get src(): string {
    return this.getAttribute('src') || ''
  }

  set src(url: string) {
    this.setAttribute('src', url)
  }

  get name(): string {
    return this.getAttribute('name') || 'q'
  }

  set name(name: string) {
    this.setAttribute('name', name)
  }

  async fetchResults() {
    if (!this.input) return
    const query = this.input.value.trim()
    if (this.currentQuery === query) return
    this.currentQuery = query
    const src = this.src
    if (!src) return
    const resultsContainer = this.resultsContainer
    if (!resultsContainer) return

    const url = new URL(src, window.location.origin)
    const params = new URLSearchParams(url.search)
    params.append(this.name, query)
    url.search = params.toString()

    this.dispatchEvent(new CustomEvent('loadstart'))
    this.setAttribute('loading', '')
    try {
      const html = await fetch(url).then(data => data.text())
      this.dispatchEvent(new CustomEvent('load'))
      resultsContainer.innerHTML = html
    } catch (err) {
      this.dispatchEvent(new CustomEvent('error'))
    }
    this.removeAttribute('loading')
    this.dispatchEvent(new CustomEvent('loadend'))
  }
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
