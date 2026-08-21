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

- `loadstart` - The server fetch has started.
- `load` - The network request completed successfully.
- `error` - The network request failed.
- `loadend` - The network request has completed.
- `remote-input-success` – Received a successful response (status code 200-299), and response HTML has been set. Bubbles.
- `remote-input-error` – Received a not successful response. Bubbles.

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

## Releasing

This project uses [Changesets](https://github.com/changesets/changesets) to manage versioning, changelogs, and publishing to npm.

- **Explicit changesets**: For a user-facing change, run `npx changeset`, describe the change, and choose a `patch`, `minor`, or `major` bump. Commit the generated changeset with the change. Explicit changesets take precedence over automatic release entries and are released immediately.
- **Automatic patch changesets**: On pushes to `main`, the [`release` workflow](.github/workflows/release.yml) runs `scripts/prepare-release.mjs`. When there is no explicit changeset, it creates one deterministic patch changeset per unreleased PR or commit. Each release-note entry links the PR (when available) and commit, followed by the change description.
- **Dependency-only releases**: Non-security dependency updates wait until the current release is at least 30 days old. Dependency updates identified as security fixes are released immediately. Substantive non-dependency changes are also released immediately.
- **Release pull request**: The workflow opens or updates a **Release tracking** pull request using the unmodified `changesets/action@v2`. Merging that pull request publishes the package to npm and records the new version and changelog in the repository.
- **Manual runs**: Use the **Run workflow** button for the `Release` workflow (`workflow_dispatch`) to regenerate or refresh release tracking without waiting for another push to `main`.

## License

Distributed under the MIT license. See LICENSE for details.
