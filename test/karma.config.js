function reply(request, response, next) {
  if (request.method === 'GET') {
    if (request.url.startsWith('/500')) {
      response.writeHead(500)
      response.ok = false
      response.end('Server error')
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
    files: ['bootstrap.js', '../dist/umd/index.js', 'test.js'],
    reporters: ['mocha'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    browsers: ['ChromeHeadless'],
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
