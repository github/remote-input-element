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

```html
<!-- Live preview of Markdown -->
<remote-input src="/preview" aria-owns="md-preview">
  <textarea></textarea>
</remote-input>
<div id="md-preview"></div>
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
