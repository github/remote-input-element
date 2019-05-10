describe('remote-input', function() {
  describe('element creation', function() {
    it('creates from document.createElement', function() {
      const el = document.createElement('remote-input')
      assert.equal('REMOTE-INPUT', el.nodeName)
    })

    it('creates from constructor', function() {
      const el = new window.RemoteInputElement()
      assert.equal('REMOTE-INPUT', el.nodeName)
    })
  })

  describe('after tree insertion', function() {
    beforeEach(function() {
      document.body.innerHTML = `
        <remote-input aria-owns="results" src="/results">
          <input>
        </remote-input>
        <div id="results"></div>
      `
    })

    afterEach(function() {
      document.body.innerHTML = ''
    })

    it('loads content', function(done) {
      const remoteInput = document.querySelector('remote-input')
      const input = document.querySelector('input')
      const results = document.querySelector('#results')
      remoteInput.addEventListener('loadend', function() {
        assert.equal(results.querySelector('ol').getAttribute('data-src'), '/results?q=test')
        done()
      })
      input.value = 'test'
      input.focus()
    })

    it('loads content again after src is changed', function(done) {
      const remoteInput = document.querySelector('remote-input')
      const input = document.querySelector('input')
      const results = document.querySelector('#results')

      function listenOnce(cb) {
        remoteInput.addEventListener('loadend', cb, {once: true})
      }
      listenOnce(function() {
        assert.equal(results.querySelector('ol').getAttribute('data-src'), '/results?q=test')

        listenOnce(function() {
          assert.equal(results.querySelector('ol').getAttribute('data-src'), '/srcChanged?q=test')
          done()
        })

        remoteInput.src = '/srcChanged'
      })
      input.value = 'test'
      input.focus()
    })
  })
})
