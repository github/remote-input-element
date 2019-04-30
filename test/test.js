describe('filterable-input', function() {
  describe('element creation', function() {
    it('creates from document.createElement', function() {
      const el = document.createElement('filterable-input')
      assert.equal('FILTERABLE-INPUT', el.nodeName)
    })

    it('creates from constructor', function() {
      const el = new window.FilterableInputElement()
      assert.equal('FILTERABLE-INPUT', el.nodeName)
    })
  })

  describe('after tree insertion', function() {
    beforeEach(function() {
      document.body.innerHTML = `
        <filterable-input aria-owns="results" src="/results">
          <input>
        </filterable-input>
        <div id="results"></div>
      `
    })

    afterEach(function() {
      document.body.innerHTML = ''
    })

    it('loads content', function(done) {
      const filterable = document.querySelector('filterable-input')
      const input = document.querySelector('input')
      const results = document.querySelector('#results')
      filterable.addEventListener('loadend', function() {
        assert.equal(results.querySelector('li').textContent, 'item: test')
        done()
      })
      input.value = 'test'
      input.focus()
    })
  })
})
