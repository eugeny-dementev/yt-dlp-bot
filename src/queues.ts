import { QueueAction, util } from "async-queue-runner";
import {
  CalcTimeLeft,
  CleanUpUrl,
  DeleteFile,
  DeleteLimitStatus,
  ExecuteCommand,
  ExtractVideoDimentions,
  FindFile,
  Log,
  PreapreVideoDimentionsCommand,
  PrepareConvertCommand,
  PrepareYtDlpCommand,
  SetChatIdToChannelId,
  SetLimitStatus,
  UploadVideo,
} from "./actions.js";
import { formatTime } from "./helpers.js";
import { shortcut } from "./shortcuts.js";
import { BotContext, TimeLimitContext } from "./types.js";
import { isValidURL } from "./validators.js";

export const shortHandlerQueue: () => QueueAction[] = () => [
  Log,
  CalcTimeLeft,
  Log,
  SetLimitStatus,
  util.if<TimeLimitContext>(({ timeLimitLeft }) => timeLimitLeft === 0, {
    then: [
      shortcut.notify('Message received'),
      CleanUpUrl,
      util.if<BotContext>(({ url }) => isValidURL(url), {
        then: [
          Log,
          shortcut.extend({ title: true }),
          PrepareYtDlpCommand,
          Log,
          ExecuteCommand,
          shortcut.extend({ title: false }),
          PrepareYtDlpCommand,
          Log,
          ExecuteCommand,
          PrepareYtDlpCommand,
          FindFile,
          Log,
          PrepareConvertCommand,
          Log,
          ExecuteCommand,
          DeleteFile,
          FindFile,
          Log,
          PreapreVideoDimentionsCommand,
          Log,
          ExecuteCommand,
          ExtractVideoDimentions,
          Log,
          util.if<BotContext>(({ channelId }) => Boolean(channelId), {
            then: [
              Log,
              UploadVideo,
              shortcut.notify('Video uploaded to the channel'),
            ],
            else: [
              DeleteLimitStatus,
              SetChatIdToChannelId,
              Log,
              UploadVideo,
            ],
          }),
          DeleteFile,
        ],
        else: [
          DeleteLimitStatus,
          shortcut.notify('Invalid URL'),
        ],
      }),
    ],
    else: [
      shortcut.notify<TimeLimitContext>(({ timeLimitLeft }) => `${formatTime(timeLimitLeft)} left until next post`)
    ],
  }),
];
