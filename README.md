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

- **Human-authored pull requests**: For a user-facing change, run `npx changeset`, describe the change, and choose a `patch`, `minor`, or `major` bump. Commit the generated changeset with the change. If a pull request should not produce a release, apply the `skip changeset` label instead.
- **Dependabot pull requests**: Dependabot PRs are exempt from the human changeset check. A dedicated workflow adds one deterministic patch changeset when a Dependabot update resolves a security alert or changes the declared range of a direct production dependency in `package.json`.
- **Dependency updates without releases**: Direct development dependency updates, indirect dependency updates, and lockfile-only updates already permitted by the existing `package.json` range do not get changesets unless they resolve a Dependabot security alert.
- **Dependabot automation credentials**: The Dependabot changeset workflow uses the shared Primer GitHub App credentials (`PRIMER_APP_ID_SHARED` and `PRIMER_APP_PRIVATE_KEY_SHARED`). The App needs Contents write, Pull requests read, and Dependabot alerts read permissions so it can look up security-alert metadata and commit the generated changeset to the Dependabot branch without a personal access token.
- **Release pull request**: The [`release` workflow](.github/workflows/release.yml) opens or updates a **Release tracking** pull request using `changesets/action@v2`. Changesets owns release aggregation, versioning, changelog generation, and publishing. Merging that pull request publishes the package to npm and records the new version and changelog in the repository.
- **Manual runs**: Use the **Run workflow** button for the `Release` workflow (`workflow_dispatch`) to refresh release tracking without waiting for another push to `main`.

## License

Distributed under the MIT license. See LICENSE for details.
