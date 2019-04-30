function request(request, response, next) {
  if (request.method === 'GET' && request.url.startsWith('/results?q=')) {
    response.writeHead(200)
    response.end(`
      <ol>
        <li>item: ${request.url.split('=')[1]}</li>
        <li>item</li>
        <li>item</li>
        <li>item</li>
      </ol>
    `)
    return
  }
  next()
}
module.exports = function(config) {
  config.set({
    frameworks: ['mocha', 'chai'],
    files: ['../dist/index.umd.js', 'test.js'],
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
        'middleware:request': ['value', request]
      }
    ]
  })
}
