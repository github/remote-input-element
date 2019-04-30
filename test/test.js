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
      document.body.innerHTML = '<filterable-input></filterable-input>'
    })

    afterEach(function() {
      document.body.innerHTML = ''
    })

    it('initiates', function() {
      const ce = document.querySelector('filterable-input')
      assert.equal(ce.textContent, ':wave:')
    })
  })
})
