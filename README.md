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

- **Explicit changesets**: When you make a user-facing change, run `npx changeset` and follow the prompts to describe the change and pick a bump type (`patch`, `minor`, or `major`). Commit the generated file in `.changeset/`. Explicit changesets always take precedence over the automatic behavior described below.
- **Automatic patch releases**: Many merges (for example, Dependabot dependency bumps) don't come with a changeset. The [`release` workflow](.github/workflows/release.yml) runs `scripts/prepare-release.mjs` before invoking `changesets/action`. If no explicit changeset exists, but there are commits merged since the last published release tag, it generates a single synthetic `patch` changeset summarizing those commits (linking pull request numbers when available) so a release PR still gets opened.
- **Release pull request**: On every push to `main` (or a manual run via `workflow_dispatch`), the workflow opens or updates a "Release: version packages" pull request with the version bump and changelog entry. Merging that pull request triggers the same workflow again, which publishes the new version to npm (with [provenance](https://docs.npmjs.com/generating-provenance-statements)) and to GitHub Packages, and creates the matching git tag.
- **Manual runs**: Use the "Run workflow" button on the `Release` workflow in the Actions tab (`workflow_dispatch`) at any time to regenerate or refresh the release pull request without waiting for a push to `main`.

## License

Distributed under the MIT license. See LICENSE for details.
