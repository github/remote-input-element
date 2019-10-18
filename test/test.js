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
    let remoteInput
    let input
    let results

    beforeEach(function() {
      document.body.innerHTML = `
        <remote-input aria-owns="results" src="/results">
          <input>
        </remote-input>
        <div id="results"></div>
      `
      remoteInput = document.querySelector('remote-input')
      input = remoteInput.querySelector('input')
      results = document.querySelector('#results')
    })

    afterEach(function() {
      document.body.innerHTML = ''
      remoteInput = null
      input = null
      results = null
    })

    it('emits network events in order', async function() {
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
      changeValue(input, 'test')
      await completed

      assert.deepEqual(['loadstart', 'load', 'loadend'], events)
    })

    it('loads content', async function() {
      assert.equal(results.innerHTML, '')

      const success = once(remoteInput, 'remote-input-success')
      const loadend = once(remoteInput, 'loadend')

      changeValue(input, 'test')

      await success
      await loadend
      assert.equal(results.querySelector('ol').getAttribute('data-src'), '/results?q=test')
    })

    it('handles not ok responses', async function() {
      remoteInput.src = '/500'
      assert.equal(results.innerHTML, '')

      const error = once(remoteInput, 'remote-input-error')
      const loadend = once(remoteInput, 'loadend')

      changeValue(input, 'test')

      await loadend
      await error

      assert.equal(results.innerHTML, '', 'nothing was appended')
    })

    it('handles network error', async function() {
      remoteInput.src = '/network-error'
      assert.equal(results.innerHTML, '')

      const result = once(remoteInput, 'error')

      changeValue(input, 'test')
      assert.ok(remoteInput.hasAttribute('loading'), 'loading attribute should have been added')

      await result
      await nextTick()
      assert.equal(results.innerHTML, '', 'nothing was appended')
      assert.notOk(remoteInput.hasAttribute('loading'), 'loading attribute should have been removed')
    })

    it('repects param attribute', async function() {
      remoteInput.setAttribute('param', 'robot')
      assert.equal(results.innerHTML, '')

      const result = once(remoteInput, 'remote-input-success')

      changeValue(input, 'test')

      await result
      assert.equal(results.querySelector('ol').getAttribute('data-src'), '/results?robot=test')
    })

    it('loads content again after src is changed', async function() {
      const result1 = once(remoteInput, 'remote-input-success')
      changeValue(input, 'test')

      await result1
      assert.equal(results.querySelector('ol').getAttribute('data-src'), '/results?q=test')

      const result2 = once(remoteInput, 'remote-input-success')
      remoteInput.src = '/srcChanged'

      await result2
      assert.equal(results.querySelector('ol').getAttribute('data-src'), '/srcChanged?q=test')
    })
  })
})

function changeValue(input, value) {
  input.value = value
  input.dispatchEvent(new Event('change'))
}

function nextTick() {
  return Promise.resolve()
}

function once(element, eventName) {
  return new Promise(resolve => {
    element.addEventListener(eventName, resolve, {once: true})
  })
}
