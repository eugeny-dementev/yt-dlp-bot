import { Action, QueueContext } from 'async-queue-runner';
import { deleteAsync } from 'del';
import expendTilda from 'expand-tilde';
import fsPromises from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import shelljs from 'shelljs';
import { homeDir, swapDir } from './config.js';
import { USER_LIMITS } from './constants.js';
import { omit } from './helpers.js';
import {
  BotContext,
  CommandContext,
  FContextMessage,
  LastFileContext,
  VideoDimensions,
  VideoDimensionsContext,
} from './types.js';

export class Notification<C> extends Action<BotContext> {
  message: string | FContextMessage<C & BotContext>;
  silent: boolean;

  constructor(message: string | FContextMessage<C & BotContext>, silent: boolean = true) {
    super();

    this.message = message;
    this.silent = silent;
  }

  async execute(context: C & BotContext & QueueContext): Promise<void> {
    const { chatId, bot } = context;

    const msg: string = typeof this.message === 'function'
      ? await this.message(context)
      : this.message;

    bot.telegram.sendMessage(chatId, msg, { disable_notification: this.silent });
  }
}

export class CalcTimeLeft extends Action<BotContext> {
  async execute(context: BotContext & QueueContext): Promise<void> {
    const { userId, role, limitsStatus, extend } = context;

    const currentUserLimit = USER_LIMITS[role];

    let timeLimitLeft = 0;

    if (limitsStatus[userId]) {
      timeLimitLeft = Math.max(timeLimitLeft, currentUserLimit - (Date.now() - limitsStatus[userId]));
    }

    if (timeLimitLeft <= 1000) timeLimitLeft = 0;

    extend({ timeLimitLeft });
  }
}

export class SetLimitStatus extends Action<BotContext> {
  async execute(context: BotContext & QueueContext): Promise<void> {
    const { userId, limitsStatus } = context;

    limitsStatus[userId] = Date.now();
  }
}

export class DeleteLimitStatus extends Action<BotContext> {
  async execute(context: BotContext & QueueContext): Promise<void> {
    const { userId, limitsStatus } = context;

    delete limitsStatus[userId];
  }
}

export class Log extends Action<any> {
  async execute(context: any): Promise<void> {
    console.log(`Log(${context.name()}) context:`, omit(context, 'bot', 'push', 'stop', 'extend', 'name', 'stdout'));
  }
}

export class CleanUpUrl extends Action<BotContext> {
  async execute({ url, extend }: BotContext & QueueContext): Promise<void> {
    const l = new URL(url);

    const cleanUrl = `${l.origin}${l.pathname}`;

    extend({ url: cleanUrl })
  }
}

export class PrepareYtDlpCommand extends Action<BotContext> {
  async execute({ url, title, cookiesPath, extend, userId, destFileName }: BotContext & QueueContext & { title: boolean }): Promise<void> {
    if (!homeDir) throw Error('No HOME_DIR specified');

    const userHomeDir = path.join(homeDir, String(userId));

    const commandArr: string[] = [];

    commandArr.push(`yt-dlp -S "res:480" --paths home:${userHomeDir} --paths temp:${swapDir}`);
    commandArr.push(`--cookies ${cookiesPath}`);
    if (title === false) commandArr.push(`--output "${destFileName}.%(ext)s"`);
    commandArr.push(url);

    const command = commandArr.join(' ');

    extend({ command });
  }
}

export class FindFile extends Action<BotContext> {
  async execute({ userId, extend, destFileName }: BotContext & QueueContext): Promise<void> {

    if (!homeDir) throw new Error('No home dir found');

    let homePath = homeDir;

    if (homePath.includes('~')) homePath = expendTilda(homePath);

    const pattern = path.join(homePath, String(userId), `${destFileName}.*`);
    const files = await glob.glob(pattern, { windowsPathsNoEscape: true });

    if (files.length === 0) {
      return;
    }

    const lastFile = files[0];

    extend({ globPattern: pattern, globFiles: files, lastFile });
  }
}

export class PrepareConvertCommand extends Action<LastFileContext> {
  async execute({ lastFile, extend }: LastFileContext & QueueContext): Promise<void> {
    const fileData = path.parse(lastFile);
    const newFileName = `new_${fileData.name}`;
    const newFilePath = path.join(fileData.dir, `${newFileName}.mp4`);
    // ffmpeg -i ./YKUNMpHk_cs.any ./new_YKUNMpHk_cs.mp4
    const command = `ffmpeg -i ${lastFile} -c:v libx264 -crf 28 -preset veryslow -c:a copy ${newFilePath}`;

    extend({ command, destFileName: newFileName });
  }
}

export class PreapreVideoDimentionsCommand extends Action<LastFileContext> {
  async execute({ lastFile, extend }: LastFileContext & QueueContext): Promise<void> {
    // command
    // ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 .\YKUNMpHk_cs.mp4
    //
    // stdout
    // width=720
    // height=1280
    const command = `ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 ${lastFile}`

    extend({ command });
  }
}

export class ExtractVideoDimentions extends Action<CommandContext> {
  async execute({ stdout, extend }: CommandContext & QueueContext): Promise<void> {
    const { width, height } = stdout
      .trim()
      .split('\n').map(s => s.trim())
      .map((str: string): string[] => str.split('=').map(s => s.trim()))
      .reduce<VideoDimensions>((obj: VideoDimensions, pair: string[]): VideoDimensions => {
        const [field, value] = pair;
        obj[field] = Number(value);

        return obj;
      }, {} as VideoDimensions);

    extend({ width, height });
  }
}

export class ExecuteCommand extends Action<CommandContext> {
  delay: number = 1000;

  async execute(context: CommandContext & QueueContext): Promise<void> {
    return new Promise((res, rej) => {
      if (!context.command) {
        rej('Command not found in the context');

        return;
      }

      shelljs.exec(context.command!, { async: true }, (code, stdout, stderr) => {
        delete context.command;

        if (code === 0) {
          res();

          context.extend({ stdout });

          return;
        }

        rej(stderr.toString());
      });
    });
  }
}

export class DeleteFile extends Action<LastFileContext> {
  async execute({ lastFile }: LastFileContext): Promise<void> {
    await deleteAsync(lastFile, { force: true });
  }
}

export class UploadVideo extends Action<BotContext & VideoDimensionsContext & LastFileContext> {
  async execute({ lastFile, bot, width, height, channelId }: VideoDimensionsContext & BotContext & LastFileContext & QueueContext): Promise<void> {
    const videoBuffer = await fsPromises.readFile(lastFile);

    await bot.telegram.sendVideo(channelId!, { source: videoBuffer }, { width, height });
  }
}

export class SetChatIdToChannelId extends Action<BotContext> {
  async execute({ chatId, extend }: BotContext & QueueContext): Promise<void> {
    extend({ channelId: chatId });
  }
}
