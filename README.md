# &lt;filterable-input&gt; element

Retrieve search results from server.

## Installation

```
$ npm install @github/filterable-input-element
```

## Usage

```js
import '@github/filterable-input-element'
```

```html
<filterable-input src="/results" aria-owns="filtered-list">
  <input type="text">
</filterable-input>
<ul id="filtered-list"></ul>
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
