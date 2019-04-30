/* @flow strict */

class FilterableInputElement extends HTMLElement {
  constructor() {
    super()
  }

  connectedCallback() {
    this.textContent = ':wave:'
  }

  disconnectedCallback() {}
}

export default FilterableInputElement

if (!window.customElements.get('filterable-input')) {
  window.FilterableInputElement = FilterableInputElement
  window.customElements.define('filterable-input', FilterableInputElement)
}
