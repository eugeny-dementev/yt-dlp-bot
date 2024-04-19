import path from 'path';
import { deleteAsync } from 'del';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import shelljs from 'shelljs';
import { glob } from 'glob';
import fs from 'fs';
import { readFile } from 'fs/promises';

const swapDir = process.env.SWAP_DIR;
const homeDir = process.env.HOME_DIR;

const channelId = Number(process.env.CHANNEL_ID);

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
  const chatId = ctx.message?.chat.id || 0;

  if (allowedUsers.has(userId)) await next();
  else console.log('blocked user: ', {
    user: ctx.message?.from.username,
    userId,
    chatId,
    update: ctx.update,
  });
});

bot.on(message('text'), async (ctx) => {
  const message = ctx.message;
  const userId = message.from.id;

  console.log('message', message);

  let url = '';
  if (isValidShortURL(message.text) || isValidRedditURL(message.text)) {
    url = getCleanURL(message.text);
  } else {
    ctx.reply('only a link to the short youtube video or reddit videos');

    return;
  }

  const command = prepareYTDLCommand(userId, url);

  shelljs.exec(command);

  if (channelId) {
    let lastFileFullPath = getLastFile(userId);

    if (lastFileFullPath === null) {
      console.log('No file was found');
      ctx.reply('No video found');
      return;
    }

    if (/\.webm$/.test(lastFileFullPath)) {
      const toMp4Command = prepareWebmToMp4Command(lastFileFullPath);
      shelljs.exec(toMp4Command);

      await deleteAsync(lastFileFullPath, { force: true });

      console.log('webm files converted successfully');

      lastFileFullPath = getLastFile(userId);
    }

    if (!lastFileFullPath) {
      ctx.reply('No video found');
      return;
    }

    const videoDimensions = getVideoDimensions(lastFileFullPath);

    console.log('VideoDimensions extracted:', videoDimensions);

    const videoFile = await readFile(lastFileFullPath);

    await bot.telegram.sendVideo(channelId, { source: videoFile }, videoDimensions);

    await deleteAsync(lastFileFullPath, { force: true });
  }

  ctx.reply('short downloaded')
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

function isValidShortURL(url: string) {
  try {
    new URL(url);

    if (!/shorts\/[a-zA-Z0-9\-_]{11}/.test(url)) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
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

function isValidRedditURL(url: string) {
  try {
    const l = new URL(url);

    if (!/reddit\.com/.test(l.hostname)) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}
/*
URL {
  href: 'https://www.reddit.com/r/nextfuckinglevel/s/TSLgGuuAbd',
  origin: 'https://www.reddit.com',
  protocol: 'https:',
  username: '',
  password: '',
  host: 'www.reddit.com',
  hostname: 'www.reddit.com',
  port: '',
  pathname: '/r/nextfuckinglevel/s/TSLgGuuAbd',
  search: '',
  searchParams: URLSearchParams {},
  hash: ''
}
URL {
  href: 'https://www.reddit.com/r/ANormalDayInRussia/comments/1c75t2q/russian_spiderman/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button',
  origin: 'https://www.reddit.com',
  protocol: 'https:',
  username: '',
  password: '',
  host: 'www.reddit.com',
  hostname: 'www.reddit.com',
  port: '',
  pathname: '/r/ANormalDayInRussia/comments/1c75t2q/russian_spiderman/',
  search: '?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button',
  searchParams: URLSearchParams {
    'utm_source' => 'share',
    'utm_medium' => 'web3x',
    'utm_name' => 'web3xcss',
    'utm_term' => '1',
    'utm_content' => 'share_button' },
  hash: ''
}
*/
function getCleanURL(url: string) {
  const l = new URL(url);

  return `${l.origin}${l.pathname}`;
}

function prepareYTDLCommand(userId: number, url: string): string {
  if (!homeDir) throw Error('No HOME_DIR specified');

  const userHomeDir = path.join(homeDir, String(userId));

  return `yt-dlp --paths home:${userHomeDir} --paths temp:${swapDir} --output "%(id)s.%(ext)s" ${url}`;
}

function getLastFile(userId: number): string | null {
  if (!homeDir) throw new Error('No home dir found');

  const pattern = path.join(homeDir, String(userId), '*');
  console.log('pattern:', pattern);
  const files = glob.sync(pattern, { windowsPathsNoEscape: true });
  console.log('files:', files);

  if (files.length === 0) {
    return null;
  }

  return files
    .map(name => ({ name, ctime: fs.statSync(name).ctime }))
    .sort((a: { ctime: Date }, b: { ctime: Date }): number => b.ctime.getTime() - a.ctime.getTime())[0].name
}

function prepareWebmToMp4Command(filePath: string) {
  const fileData = path.parse(filePath);
  const newFilePath = path.join(fileData.dir, `${fileData.name}.mp4`);
  // D:\shorts\2843386\gh3dehtc9xuc1.mp4
  // ffmpeg -i ./YKUNMpHk_cs.webm ./YKUNMpHk_cs.mp4
  return `ffmpeg -i ${filePath} ${newFilePath}`;
}

type VideoDimensions = { width: number, height: number };
function getVideoDimensions(filePath: string): VideoDimensions {
  // ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 .\YKUNMpHk_cs.mp4
  // returns two lines:
  // width=720
  // height=1280
  const command = `ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 ${filePath}`

  const response = shelljs.exec(command);

  return response
    .trim()
    .split('\n').map(s => s.trim())
    .map((str: string): string[] => str.split('=').map(s => s.trim()))
    .reduce<VideoDimensions>((obj: VideoDimensions, pair: string[]): VideoDimensions => {
      const [field, value] = pair;
      obj[field] = Number(value);

      return obj;
    }, {} as VideoDimensions);
}
