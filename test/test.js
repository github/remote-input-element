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

    it('emits network events in order', async function() {
      const remoteInput = document.querySelector('remote-input')
      const input = document.querySelector('input')

      const events = []
      const track = event => events.push(event.type)

      remoteInput.addEventListener('loadstart', track)
      remoteInput.addEventListener('load', track)
      remoteInput.addEventListener('loadend', track)

      const completed = Promise.all([
        once(remoteInput, 'loadstart'),
        once(remoteInput, 'load'),
        once(remoteInput, 'loadend')
      ])
      input.value = 'test'
      input.focus()
      await completed

      assert.deepEqual(['loadstart', 'load', 'loadend'], events)
    })

    it('loads content', async function() {
      const remoteInput = document.querySelector('remote-input')
      const input = document.querySelector('input')
      const results = document.querySelector('#results')
      assert.equal(results.innerHTML, '')

      const success = once(remoteInput, 'remote-input-success')
      const loadend = once(remoteInput, 'loadend')

      input.value = 'test'
      input.focus()

      await success
      await loadend
      assert.equal(results.querySelector('ol').getAttribute('data-src'), '/results?q=test')
    })

    it('handles not ok responses', async function() {
      const remoteInput = document.querySelector('remote-input')
      const input = document.querySelector('input')
      const results = document.querySelector('#results')
      remoteInput.src = '/500'
      assert.equal(results.innerHTML, '')

      const error = once(remoteInput, 'remote-input-error')
      const loadend = once(remoteInput, 'loadend')

      input.value = 'test'
      input.focus()

      await loadend
      await error

      assert.equal(results.innerHTML, '', 'nothing was appended')
    })

    it('handles network error', async function() {
      const remoteInput = document.querySelector('remote-input')
      const input = remoteInput.querySelector('input')
      const results = document.querySelector('#results')
      remoteInput.src = '/network-error'
      assert.equal(results.innerHTML, '')

      const result = once(remoteInput, 'error')

      input.value = 'test'
      input.focus()
      assert.ok(remoteInput.hasAttribute('loading'), 'loading attribute should have been added')

      await result
      await nextTick()
      assert.equal(results.innerHTML, '', 'nothing was appended')
      assert.notOk(remoteInput.hasAttribute('loading'), 'loading attribute should have been removed')
    })

    it('repects param attribute', async function() {
      const remoteInput = document.querySelector('remote-input')
      const input = document.querySelector('input')
      const results = document.querySelector('#results')
      remoteInput.setAttribute('param', 'robot')
      assert.equal(results.innerHTML, '')

      const result = once(remoteInput, 'remote-input-success')

      input.value = 'test'
      input.focus()

      await result
      assert.equal(results.querySelector('ol').getAttribute('data-src'), '/results?robot=test')
    })

    it('loads content again after src is changed', async function() {
      const remoteInput = document.querySelector('remote-input')
      const input = document.querySelector('input')
      const results = document.querySelector('#results')

      const result1 = once(remoteInput, 'remote-input-success')
      input.value = 'test'
      input.focus()

      await result1
      assert.equal(results.querySelector('ol').getAttribute('data-src'), '/results?q=test')

      const result2 = once(remoteInput, 'remote-input-success')
      remoteInput.src = '/srcChanged'

      await result2
      assert.equal(results.querySelector('ol').getAttribute('data-src'), '/srcChanged?q=test')
    })
  })
})

function nextTick() {
  return Promise.resolve()
}

function once(element, eventName) {
  return new Promise(resolve => {
    element.addEventListener(eventName, resolve, {once: true})
  })
}
