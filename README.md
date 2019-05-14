# &lt;remote-input&gt; element

An input element that sends its value to a server endpoint and renders the response body.

## Installation

```
$ npm install @github/remote-input-element
```

## Usage

```js
import '@github/remote-input-element'
```

```html
<!-- Filter a list of items from the server -->
<remote-input src="/query" aria-owns="results">
  <input>
</remote-input>
<ul id="results"></ul>
```

A GET request will be sent to `/query?q=${input.value}`.

The parameter name (`q`) is customizable with the `[param]` attribute:

```html
<!-- Live preview of Markdown -->
<remote-input src="/preview" aria-owns="md-preview" param="body">
  <textarea></textarea>
</remote-input>
<div id="md-preview"></div>
```

### Styling loading state

A boolean `[loading]` attribute is added to `<remote-input>` when a network request begins and removed when it ends.

```css
.loading-icon { display: none; }
remote-input[loading] .loading-icon { display: inline; }
```

### Events

```js
const remoteInput = document.querySelector('remote-input')

// Network request lifecycle events.
remoteInput.addEventListener('loadstart', function(event) {
  console.log('Network request started', event)
})
remoteInput.addEventListener('loadend', function(event) {
  console.log('Network request complete', event)
})
remoteInput.addEventListener('load', function(event) {
  console.log('Network request succeeded', event)
})
remoteInput.addEventListener('error', function(event) {
  console.log('Network request failed', event)
})
```

## Browser support

Browsers without native [custom element support][support] require a [polyfill][].

- Chrome
- Firefox
- Safari
- Microsoft Edge

[support]: https://caniuse.com/#feat=custom-elementsv1
[polyfill]: https://github.com/webcomponents/custom-elements

## Development

```
npm install
npm test
```

## License

Distributed under the MIT license. See LICENSE for details.
