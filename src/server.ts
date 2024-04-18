import path from 'path';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import shelljs from 'shelljs';
import { glob } from 'glob';
import fs from 'fs';
import { log } from 'console';

const swapDir = process.env.SWAP_DIR;
const homeDir = process.env.HOME_DIR;

if (!homeDir || !swapDir) throw new Error('SWAP_DIR and HOME_DIR must be specified');

const bot = new Telegraf(process.env.BOT_TOKEN as string);

bot.start((ctx) => ctx.reply('Welcome to Shorts Saver Bot'));
bot.help((ctx) => ctx.reply('Send me a short video and I\'ll public it '));

const publishersIds = String(process.env.PUBLISHERS_IDS)
  .split(',')
  .map((id: string): number => parseInt(id))

const adminId = Number(process.env.ADMIN_ID);

const allowedUsers = new Set([
  ...publishersIds,
  adminId,
]);

bot.use(async (ctx, next) => {
  const userId = ctx.message?.from.id || 0;

  if (allowedUsers.has(userId)) await next();
  else console.log('blocked user: ', {
    userId,
    user: ctx.message?.from.username,
  });
});

bot.on(message('text'), async (ctx) => {
  const message = ctx.message;
  const userId = message.from.id;

  console.log('message', message);

  if (!isValidShortURL(message.text)) {
    ctx.reply('only a link to the short youtube video');

    return;
  }

  const command = prepareYTDLCommand(userId, message.text);

  shelljs.exec(command);


  const pattern = path.join(homeDir, String(userId), '*');
  console.log('pattern:', pattern);
  const files = glob.sync(pattern, { windowsPathsNoEscape: true });
  console.log('files:', files);

  const newestFile = files
    .map(name => ({ name, ctime: fs.statSync(name).ctime }))
    .sort((a: { ctime: Date }, b: { ctime: Date }): number => b.ctime.getTime() - a.ctime.getTime())[0].name

  log('newestFile:', newestFile);


  ctx.reply('short downloaded')
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

function isValidShortURL(url: string) {
  try {
    const l = new URL(url);

    console.log('new link:', l);

    if (!/shorts\/[a-zA-Z0-9\-_]{11}/.test(url)) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

function prepareYTDLCommand(userId: number, url: string): string {
  if (!homeDir) throw Error('No HOME_DIR specified');

  const userHomeDir = path.join(homeDir, String(userId));

  return `yt-dlp --paths home:${userHomeDir} --paths temp:/${swapDir} ${url}`
}

/*
URL {
  href: 'https://youtube.com/shorts/23owdgVAV5k?si=fSGa2TFVepKT7gia',
  origin: 'https://youtube.com',
  protocol: 'https:',
  username: '',
  password: '',
  host: 'youtube.com',
  hostname: 'youtube.com',
  port: '',
  pathname: '/shorts/23owdgVAV5k',
  search: '?si=fSGa2TFVepKT7gia',
  searchParams: URLSearchParams { 'si' => 'fSGa2TFVepKT7gia' },
  hash: ''
}
*/
