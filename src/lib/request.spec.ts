import 'mocha'
import { expect } from 'chai'
import * as bot from '..'

describe('[request]', () => {
  before(() => {
    bot.server.load()
    bot.server.router!.get('/pass', (ctx, next) => {
      ctx.body = 'success'
      next()
    })
    bot.server.router!.post('/pass', (ctx, next) => {
      ctx.body = 'success'
      next()
    })
    bot.server.router!.get('/json', (ctx, next) => {
      ctx.body = { id: '1' }
      next()
    })
    bot.server.router!.get('/data', (ctx, next) => {
      ctx.body = { data: ctx.query }
      next()
    })
    bot.server.router!.post('/data', (ctx, next) => {
      ctx.body = { data: ctx.request.body }
      next()
    })
    bot.server.router!.post('/empty', (ctx, next) => {
      ctx.body = ''
      next()
    })
    bot.server.router!.get('/fail', (ctx, next) => {
      ctx.throw('failure')
      next()
    })
    return bot.server.start()
  })
  after(() => bot.server.shutdown())
  describe('Request', () => {
    describe('.make', () => {
      it('rejects bad request URL', () => {
        return bot.request.make({
          method: 'GET',
          uri: `${bot.server.url()}/fail`
        })
          .then(() => expect(true).to.equal(false))
          .catch((err) => expect(err).to.be.an('error'))
      })
      it('rejects non JSON response body or timeout', () => {
        bot.settings.set('request-timeout', 200)
        return bot.request.make({
          method: 'GET',
          uri: `${bot.server.url()}/pass`
        })
          .then(() => expect(true).to.equal(false))
          .catch((err) => expect(err).to.be.an('error'))
          .then(() => bot.settings.unset('request-timeout'))
      })
      it('handles GET request without data', async () => {
        const result = await bot.request.make({
          method: 'GET',
          uri: `${bot.server.url()}/json`
        })
        expect(result).to.include({ id: '1' })
      })
      it('handles GET request with data', async () => {
        const result = await bot.request.make({
          method: 'GET',
          uri: `${bot.server.url()}/data`,
          qs: { userId: '1' }
        })
        expect(result.data).to.include({ userId: '1' })
      })
      it('handles POST request with data', async () => {
        const result = await bot.request.make({
          method: 'POST',
          uri: `${bot.server.url()}/data`,
          json: true,
          body: { userId: '1' }
        })
        expect(result.data).to.include({ userId: '1' })
      })
      it('handles POST with string body', async () => {
        const result = await bot.request.make({
          method: 'POST',
          uri: `${bot.server.url()}/pass`,
          json: true,
          body: { userId: '1' }
        })
        expect(result).to.equal('success')
        expect(typeof result.data).to.equal('undefined')
      })
      it('handles POST request without data', async () => {
        const result = await bot.request.make({
          method: 'POST',
          uri: `${bot.server.url()}/empty`,
          json: true,
          body: { userId: '1' }
        })
        expect(typeof result).to.equal('undefined')
      })
    })
    describe('.get', () => {
      it('handles request without data', async () => {
        const result = await bot.request.get(`${bot.server.url()}/json`)
        expect(result).to.include({ id: '1' })
      })
      it('handles request with data', async () => {
        const result = await bot.request.get(`${bot.server.url()}/data`, { userId: '1' })
        expect(result.data).to.include({ userId: '1' })
      })
    })
    describe('.post', () => {
      it('handles request with data', async () => {
        const result = await bot.request.post(`${bot.server.url()}/data`, { userId: '1' })
        expect(result.data).to.include({ userId: '1' })
      })
    })
  })
})
