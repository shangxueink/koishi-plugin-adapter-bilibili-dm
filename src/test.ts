import { Context } from 'koishi'

export function TestPlugin(ctx: Context) {

    ctx.command(`ccc`)
        .action(async ({ session, options }) => {
            const i = await session.send("123456")
            await session.bot.deleteMessage(session.channelId, i[0])
            //   const data = await get()
            //   const output = Object.values(data.bots).map((bot) => {
            //     return bot
            //   })
            //   ctx.logger.info(output)
            //   // await session.bot.getMessage(session.channelId, session.messageId)
            //   // await session.bot.getMessage(session.channelId, i[0])
            //   // await session.bot.deleteMessage(session.channelId, i[0])
            //   // await session.bot.deleteMessage(session.channelId, i)

            //   async function get() {
            //     const bots = {}
            //     for (const bot of ctx.bots) {
            //       bots[bot.sid] = {
            //         ...bot.toJSON(),
            //         paths: ctx.get('loader')?.paths(bot.ctx.scope),
            //         error: bot.error?.message,
            //       }
            //     }
            //     return { bots }
            //   }
        });



    ctx.middleware(async (session, next) => {
        if (session.platform !== 'bilibili') return next()
        if (session.content === 'ping') {
            return 'pong'
        }
        return next()
    })
}
