import { QueueAction, util } from "async-queue-runner";
import {
  CalcTimeLeft,
  CleanUpUrl,
  DeleteLastFile,
  DeleteLimitStatus,
  ExecuteCommand,
  ExtractVideoDimentions,
  FindLastFile,
  Log,
  PreapreVideoDimentionsCommand,
  PrepareWebmToMp4Command,
  PrepareYtDlpCommand,
  SetChatIdToChannelId,
  SetLimitStatus,
  UploadVideo,
} from "./actions.js";
import { formatTime } from "./helpers.js";
import { shortcut } from "./shortcuts.js";
import { BotContext, LastFileContext, TimeLimitContext } from "./types.js";
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
          PrepareYtDlpCommand,
          Log,
          ExecuteCommand,
          FindLastFile,
          Log,
          util.if<LastFileContext>(({ lastFile }) => /webm$/.test(lastFile), {
            then: [
              PrepareWebmToMp4Command,
              Log,
              DeleteLastFile,
              FindLastFile,
              Log,
            ],
          }),
          PreapreVideoDimentionsCommand,
          Log,
          ExecuteCommand,
          ExtractVideoDimentions,
          Log,
          shortcut.notify('Message processed'),
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
          DeleteLastFile,
        ],
        else: [
          DeleteLimitStatus,
          shortcut.notify('Invalid URL: only YouTube shorts and Reddit videos links'),
        ],
      }),
    ],
    else: [
      DeleteLimitStatus,
      shortcut.notify<TimeLimitContext>(({ timeLimitLeft }) => `${formatTime(timeLimitLeft)} left until next post`)
    ],
  }),
];
