let redirectTargetHits = 0

function reply(request, response, next) {
  if (request.method === 'GET') { 
    if (request.url.startsWith('/500')) {
      response.writeHead(500)
      response.ok = false
      response.end('Server error')
    } else if (request.url.startsWith('/redirect-hits')) {
      response.writeHead(200)
      response.end(String(redirectTargetHits))
    } else if (request.url.startsWith('/redirect-target')) {
      // CORS-readable, so a regression in request blocking is not masked.
      redirectTargetHits++
      response.writeHead(200, { 'access-control-allow-origin': '*' })
      response.end('<ol><li>cross-origin</li></ol>')
    } else if (request.url.startsWith('/redirect')) {
      redirectTargetHits = 0
      const host = request.headers.host || ''
      const other = host.startsWith('localhost') ? '127.0.0.1' : 'localhost'
      response.writeHead(302, {
        location: `http://${other}:${host.split(':')[1]}/redirect-target`
      })
      response.end()
    } else if (request.url.startsWith('/slow')) {
      setTimeout(() => {
        response.writeHead(200)
        response.end('<ol data-src="slow"><li>stale</li></ol>')
      }, 200)
    } else if (request.url.startsWith('/network-error')) {
      request.destroy(new Error())
      response.end()
    } else {
      response.writeHead(200)
      response.ok = true
      response.end(`
        <ol data-src="${request.url}">
          <li>item</li>
          <li>item</li>
          <li>item</li>
        </ol>
      `)
    }
    return
  }
  next()
}
module.exports = function(config) {
  config.set({
    frameworks: ['mocha', 'chai'],
    files: [
      {
        pattern: '../dist/index.js',
        type: 'module'
      },
      'test.js'
    ],
    reporters: ['mocha'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox']
      }
    },
    autoWatch: false,
    singleRun: true,
    concurrency: Infinity,
    middleware: ['request'],
    plugins: [
      'karma-*',
      {
        'middleware:request': ['value', reply]
      }
    ]
  })
}
