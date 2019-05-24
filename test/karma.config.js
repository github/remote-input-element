function reply(request, response, next) {
  if (request.method === 'GET') {
    response.writeHead(200)
    response.end(`
      <ol data-src="${request.url}">
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
        'middleware:request': ['value', reply]
      }
    ]
  })
}
