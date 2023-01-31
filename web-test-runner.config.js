import {esbuildPlugin} from '@web/dev-server-esbuild'
import {playwrightLauncher} from '@web/test-runner-playwright'
const browser = product =>
  playwrightLauncher({
    product,
    createPage: async ({context}) => {
      const page = await context.newPage()
      await page.route('**/results*', route =>
        route.fulfill({
          // eslint-disable-next-line github/unescaped-html-literal
          body: `<ol data-src="${route.request().url().pathname() + route.request().url().search()}">
              <li>item</li>
              <li>item</li>
              <li>item</li>
            </ol>`,
        }),
      )
      await page.route('**/500*', route => route.fulfill({status: 500}))
      await page.route('**/network-error*', route => route.abort())
      return page
    },
  })

export default {
  files: ['test/*'],
  nodeResolve: true,
  plugins: [esbuildPlugin({ts: true, target: 'es2020'})],
  browsers: [browser('chromium')],
  testFramework: {
    config: {
      ui: 'tdd',
      timeout: 500,
    },
  },
}
