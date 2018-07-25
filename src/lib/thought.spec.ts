import 'mocha'
import sinon from 'sinon'
import { expect } from 'chai'
import * as bot from '..'

const now = Date.now()
const delay = (ms) => new Promise((resolve, reject) => setTimeout(resolve, ms))
let message: bot.TextMessage
class MockMessenger extends bot.MessageAdapter {
  name = 'mock-messenger'
  async dispatch () { return }
  async start () { return }
  async shutdown () { return }
}
class MockLanguage extends bot.LanguageAdapter {
  name = 'mock-language'
  async process (message: bot.TextMessage) {
    return {
      intent: [{ id: 'test', score: 1 }],
      entities: [{ id: 'testing' }],
      language: [{ id: 'en' }]
    }
  }
  async start () { return }
  async shutdown () { return }
}
class MockStorage extends bot.StorageAdapter {
  name = 'mock-storage'
  async start () { return }
  async shutdown () { return }
  async saveMemory () { return }
  async loadMemory () { return }
  async keep () { return }
  async find () { return }
  async findOne () { return }
  async lose () { return }
}
describe('thought', () => {
  before(() => {
    message = new bot.TextMessage(new bot.User({ id: 'test-user' }), 'foo')
  })
  beforeEach(async () => {
    await bot.reset()
    await bot.load()
    bot.adapters.message = sinon.createStubInstance(MockMessenger)
  })
  describe('Thought', () => {
    describe('constructor', () => {
      it('fails without corresponding middleware', async () => {
        const b = new bot.State({ message })
        const name = 'test'
        expect(() => new bot.Thought({ name, b }).process()).to.throw()
      })
    })
    describe('.process', () => {
      it('runs provided middleware', async () => {
        const b = new bot.State({ message })
        const name = 'test'
        const middleware = new bot.Middleware('test')
        const middlewarePiece = sinon.spy()
        middleware.register(middlewarePiece)
        await new bot.Thought({ name, b, middleware }).process()
        sinon.assert.calledOnce(middlewarePiece)
      })
      it('calls validate, then middleware, then action', async () => {
        const b = new bot.State({ message })
        const name = 'test'
        const validate = sinon.stub().returns(true)
        const action = sinon.spy()
        const middlewarePiece = sinon.spy()
        const middleware = new bot.Middleware('test')
        middleware.register(middlewarePiece)
        await new bot.Thought({ name, b, validate, middleware, action }).process()
        sinon.assert.callOrder(validate, middlewarePiece, action)
      })
      it('false from validate gives false to action', async () => {
        const b = new bot.State({ message })
        const name = 'test'
        const validate = async () => false
        const action = sinon.spy()
        const middlewarePiece = sinon.spy()
        const middleware = new bot.Middleware('test')
        middleware.register(middlewarePiece)
        await new bot.Thought({ name, b, validate, middleware, action }).process()
        sinon.assert.notCalled(middlewarePiece)
        sinon.assert.calledWithExactly(action, false)
      })
      it('adds timestamp if middleware complete', async () => {
        const b = new bot.State({ message })
        const name = 'test'
        const middlewarePiece = (_, next, __) => next()
        const middleware = new bot.Middleware('test')
        middleware.register(middlewarePiece)
        await new bot.Thought({ name, b, middleware }).process()
        expect(b.processed).to.include.keys('test')
      })
      it('action called only once with interrupted middleware', async () => {
        const action = sinon.spy()
        const b = new bot.State({ message })
        const name = 'test'
        const middlewarePiece = (_, next, __) => next()
        const middleware = new bot.Middleware('test')
        middleware.register(middlewarePiece)
        await new bot.Thought({ name, b, middleware, action }).process()
        sinon.assert.calledOnce(action)
      })
      it('no timestamp if middleware incomplete', async () => {
        const b = new bot.State({ message })
        const name = 'test'
        const middlewarePiece = (_, __, done) => done()
        const middleware = new bot.Middleware('test')
        middleware.register(middlewarePiece)
        await new bot.Thought({ name, b, middleware }).process()
        expect(b.processed).to.not.include.keys('test')
      })
      it('with listeners, calls validate, then middleware, then listener callback, then action', async () => {
        const b = new bot.State({ message })
        const name = 'test'
        const validate = sinon.stub().returns(true)
        const action = sinon.spy()
        const middlewarePiece = sinon.spy()
        const listenerCallback = sinon.spy()
        const listeners = {
          test: new bot.CustomListener(() => true, () => listenerCallback())
        }
        const middleware = new bot.Middleware('test')
        middleware.register(middlewarePiece)
        await new bot.Thought({ name, b, validate, middleware, listeners, action }).process()
        sinon.assert.callOrder(validate, middlewarePiece, listenerCallback, action)
      })
      it('with listeners, exits if empty listeners collection', async () => {
        const b = new bot.State({ message })
        const name = 'test'
        const action = sinon.spy()
        const middlewarePiece = sinon.spy()
        const middleware = new bot.Middleware('test')
        const listeners = {}
        middleware.register(middlewarePiece)
        await new bot.Thought({ name, b, middleware, listeners, action }).process()
        sinon.assert.notCalled(middlewarePiece)
        sinon.assert.calledWithExactly(action, false)
      })
      it('with listeners, no timestamp if state already done', async () => {
        const b = new bot.State({ message, done: true })
        const name = 'test'
        const middleware = new bot.Middleware('test')
        const listeners = {
          test: new bot.CustomListener(() => true, () => null)
        }
        await new bot.Thought({ name, b, middleware, listeners }).process()
        expect(typeof b.processed.test).to.equal('undefined')
      })
      it('with listeners, calls consecutive listeners if forced', async () => {
        const b = new bot.State({ message })
        const name = 'test'
        const middleware = new bot.Middleware('test')
        const callback = sinon.spy()
        const listeners = {
          'A': new bot.CustomListener(() => true, callback),
          'B': new bot.CustomListener(() => true, callback, { force: true })
        }
        await new bot.Thought({ name, b, middleware, listeners }).process()
        sinon.assert.calledTwice(callback)
      })
      it('with listeners, stops processing when state done', async () => {
        const b = new bot.State({ message })
        const name = 'test'
        const middleware = new bot.Middleware('test')
        const callback = sinon.spy()
        const listeners = {
          'A': new bot.CustomListener(() => true, (b) => b.finish()),
          'B': new bot.CustomListener(() => true, callback, { force: true })
        }
        await new bot.Thought({ name, b, middleware, listeners }).process()
        sinon.assert.notCalled(callback)
      })
      it('named hear, processes hear middleware', async () => {
        bot.hearMiddleware((b, _, __) => b.hearTest = true)
        const b = new bot.State({ message })
        await new bot.Thought({ name: 'hear', b }).process()
        expect(b.hearTest).to.equal(true)
      })
      it('named listen, processes listen middleware', async () => {
        bot.listenMiddleware((b, _, __) => b.listenTest = true)
        const b = new bot.State({ message })
        await new bot.Thought({ name: 'listen', b }).process()
        expect(b.listenTest).to.equal(true)
      })
      it('named understand, processes understand middleware', async () => {
        bot.understandMiddleware((b, _, __) => b.understandTest = true)
        const b = new bot.State({ message })
        await new bot.Thought({ name: 'understand', b }).process()
        expect(b.understandTest).to.equal(true)
      })
      it('named act, processes act middleware', async () => {
        bot.actMiddleware((b, _, __) => b.actTest = true)
        const b = new bot.State({ message })
        await new bot.Thought({ name: 'act', b }).process()
        expect(b.actTest).to.equal(true)
      })
      it('named respond, processes respond middleware', async () => {
        bot.respondMiddleware((b, _, __) => b.respondTest = true)
        const b = new bot.State({ message })
        await new bot.Thought({ name: 'respond', b }).process()
        expect(b.respondTest).to.equal(true)
      })
      it('named remember, processes remember middleware', async () => {
        bot.rememberMiddleware((b, _, __) => b.rememberTest = true)
        const b = new bot.State({ message })
        await new bot.Thought({ name: 'remember', b }).process()
        expect(b.rememberTest).to.equal(true)
      })
    })
  })
  describe('Thoughts.start', () => {
    beforeEach(() => {
      bot.adapters.language = new MockLanguage(bot)
      bot.adapters.storage = sinon.createStubInstance(MockStorage)
    })
    afterEach(() => {
      delete bot.adapters.language
      delete bot.adapters.storage
    })
    it('with listeners, processes listeners', async () => {
      const listeners = new bot.Listeners()
      let listens = []
      listeners.custom(() => true, () => listens.push('A'), { force: true })
      listeners.custom(() => true, () => listens.push('B'), { force: true })
      await new bot.Thoughts(new bot.State({ message }), listeners).start('receive')
      expect(listens).to.eql(['A', 'B'])
    })
    it('with listeners, ignores global listeners', async () => {
      const listeners = new bot.Listeners()
      let listens = []
      bot.listenCustom(() => true, () => listens.push('A'), { force: true })
      listeners.custom(() => true, () => listens.push('B'), { force: true })
      listeners.custom(() => true, () => listens.push('C'), { force: true })
      await new bot.Thoughts(new bot.State({ message }), listeners).start('receive')
      expect(listens).to.eql(['B', 'C'])
    })
    it('continues to following listeners after listener responds', async () => {
      const listeners = new bot.Listeners()
      let processed = false
      listeners.custom(() => true, (b) => b.respond('foo'))
      listeners.custom(() => true, (b) => (processed = true), { force: true })
      await new bot.Thoughts(new bot.State({ message }), listeners).start('receive')
      expect(processed).to.equal(true)
    })
    it('continues to following listeners after async callback', async () => {
      const listeners = new bot.Listeners()
      let processed = false
      listeners.custom(() => true, (b) => delay(50))
      listeners.custom(() => true, (b) => (processed = true), { force: true })
      await new bot.Thoughts(new bot.State({ message }), listeners).start('receive')
      expect(processed).to.equal(true)
    })
    it('continues to following listeners after async matcher', async () => {
      const listeners = new bot.Listeners()
      let processed = false
      listeners.custom(() => delay(50).then(() => true), (b) => null)
      listeners.custom(() => true, (b) => (processed = true), { force: true })
      await new bot.Thoughts(new bot.State({ message }), listeners).start('receive')
      expect(processed).to.equal(true)
    })
    it('without listeners, uses global listeners', async () => {
      const listeners = new bot.Listeners()
      let listens = []
      bot.listenCustom(() => true, () => listens.push('A'), { force: true })
      listeners.custom(() => true, () => listens.push('B'), { force: true })
      listeners.custom(() => true, () => listens.push('C'), { force: true })
      await new bot.Thoughts(new bot.State({ message })).start('receive')
      expect(listens).to.eql(['A'])
    })
    it('does hear', async () => {
      bot.hearMiddleware((b, _, __) => b.hearTest = true)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b).to.have.property('hearTest', true)
    })
    it('does listen when hear uninterrupted', async () => {
      bot.listenCustom(() => true, () => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.include.keys('listen')
    })
    it('does not listen when hear interrupted', async () => {
      bot.listenCustom(() => true, () => null)
      bot.hearMiddleware((_, __, done) => done())
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('listen')
    })
    it('does understand when listeners unmatched', async () => {
      bot.listenCustom(() => false, () => null)
      bot.understandCustom(() => true, () => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.include.keys('understand')
    })
    it('understand passes message to language adapter', async () => {
      bot.adapters.language.process = sinon.spy()
      bot.understandCustom(() => true, () => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      sinon.assert.calledWithExactly((bot.adapters.language.process as sinon.SinonSpy), message)
    })
    it('understand listeners include NLU results from adapter', async () => {
      bot.adapters.language.process = async () => {
        return { intent: new bot.NaturalLanguageResult().add({ id: 'test' }) }
      }
      bot.understandCustom(() => true, () => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.message.nlu.results.intent).to.eql([{ id: 'test' }])
    })
    it('does not understand without adapter', async () => {
      bot.listenCustom(() => false, () => null)
      bot.understandCustom(() => true, () => null)
      delete bot.adapters.language
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('understand')
    })
    it('does not understand when listeners matched', async () => {
      bot.listenCustom(() => true, () => null)
      bot.understandCustom(() => true, () => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('understand')
    })
    it('does not understand when message text is empty', async () => {
      bot.adapters.language.process = sinon.spy()
      bot.understandCustom(() => true, () => null)
      const empty = new bot.TextMessage(new bot.User(), '                   ')
      const b = new bot.State({ message: empty })
      await new bot.Thoughts(b).start('receive')
      sinon.assert.notCalled((bot.adapters.language.process as sinon.SinonSpy))
    })
    it('does not understand when hear interrupted', async () => {
      bot.understandCustom(() => true, () => null)
      bot.hearMiddleware((_, __, done) => done())
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('understand')
    })
    it('does not understand non-text messages', async () => {
      bot.understandCustom(() => true, () => null)
      const b = new bot.State({ message: new bot.EnterMessage(new bot.User()) })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('understand')
    })
    it('does act when listeners unmatched', async () => {
      bot.listenCustom(() => false, () => null)
      bot.understandCustom(() => false, () => null)
      bot.listenCatchAll(() => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.include.keys('act')
    })
    it('act replaces message with catch all', async () => {
      bot.listenCatchAll(() => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.message instanceof bot.CatchAllMessage).to.equal(true)
    })
    it('does not act when text listener matched', async () => {
      bot.listenCustom(() => true, () => null)
      bot.listenCatchAll(() => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('act')
    })
    it('does not act when NLU listener matched', async () => {
      bot.understandCustom(() => true, () => null)
      bot.listenCatchAll(() => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('act')
    })
    it('does respond if listener responds', async () => {
      bot.listenCustom(() => true, (b) => b.respond('test'))
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.include.keys('respond')
    })
    it('does not respond without adapter', async () => {
      delete bot.adapters.message
      bot.listenCustom(() => true, (b) => b.respond('test'))
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('respond')
    })
    it('respond updates envelope with matched listener ID', async () => {
      bot.listenCustom(() => true, (b) => b.respond('test'), { id: 'test' })
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.envelopes[0].listenerId).to.equal('test')
    })
    it('respond passes message to language adapter', async () => {
      bot.listenCustom(() => true, (b) => b.respond('test'))
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      const envelope = b.envelopes[0]
      sinon.assert.calledWithExactly((bot.adapters.message.dispatch as sinon.SinonStub), envelope)
    })
    it('does remember when listeners matched', async () => {
      bot.listenCustom(() => true, () => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.include.keys('remember')
    })
    it('does not remember without adapter', async () => {
      bot.listenCustom(() => true, () => null)
      delete bot.adapters.storage
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('remember')
    })
    it('does not remember when listeners unmatched', async () => {
      bot.listenCustom(() => false, () => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('remember')
    })
    it('does remember on dispatch, without listener', async () => {
      const b = new bot.State({ message })
      b.respondEnvelope().write('ping')
      await new bot.Thoughts(b).start('dispatch')
      expect(b.processed).to.include.keys('remember')
    })
    it('does not remember on respond', async () => {
      bot.listenCustom(() => true, () => null)
      const b = new bot.State({ message })
      b.respondEnvelope().write('ping')
      await new bot.Thoughts(b).start('respond')
      expect(b.processed).to.not.include.keys('remember')
    })
    it('does not remember dispatch without envelope', async () => {
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('dispatch')
      expect(b.processed).to.not.include.keys('remember')
    })
    it('does not remember when hear interrupted', async () => {
      bot.hearMiddleware((_, __, done) => done())
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.processed).to.not.include.keys('remember')
    })
    it('remember passes state to storage adapter', async () => {
      bot.listenCustom(() => true, () => null)
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      sinon.assert.calledWithExactly((bot.adapters.storage.keep as sinon.SinonStub), 'states', sinon.match({ message }))
    })
    it('remember only once with multiple responses', async () => {
      bot.listenCustom(() => true, (b) => b.respond('A'))
      bot.listenCustom(() => true, (b) => b.respond('B'), { force: true })
      const b = new bot.State({ message })
      await new bot.Thoughts(b).start('receive')
      expect(b.envelopes.map((envelope) => envelope.strings)).to.eql([
        ['A'], ['B']
      ])
      sinon.assert.calledOnce((bot.adapters.storage.keep as sinon.SinonStub))
    })
    describe('receive', () => {
      it('timestamps all actioned processes', async () => {
        bot.listenCustom(() => true, (b) => b.respond('ping'))
        const now = Date.now()
        const b = await bot.receive(message)
        expect(b.processed).to.have.all.keys('hear', 'listen', 'respond', 'remember')
        expect(b.processed.hear, 'heard gte now').to.be.gte(now)
        expect(b.processed.listen, 'listened gte heard').to.be.gte(b.processed.hear)
        expect(b.processed.respond, 'responded gte listened').to.be.gte(b.processed.listen)
        expect(b.processed.remember, 'remembered gte responded').to.be.gte(b.processed.respond)
      })
    })
    describe('respond', () => {
      it('timestamps all actioned processes', async () => {
        const now = Date.now()
        const b = new bot.State({ message })
        b.respondEnvelope().write('ping')
        await bot.respond(b)
        expect(b.processed).to.have.all.keys('respond')
      })
    })
    describe('dispatch', () => {
      it('timestamps all actioned processes', async () => {
        const now = Date.now()
        const envelope = new bot.Envelope({ user: new bot.User() }).write('hello')
        const b = await bot.dispatch(envelope)
        expect(b.processed).to.have.all.keys('respond', 'remember')
        expect(b.processed.respond, 'responded gte now').to.be.gte(now)
        expect(b.processed.remember, 'remembered gte responded').to.be.gte(b.processed.respond)
      })
    })
  })
})
