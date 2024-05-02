import { Action, QueueAction, QueueContext } from "async-queue-runner";
import { Notification } from "./actions.js";
import { FContextMessage } from "./types.js";

export const shortcut = {
  notify<C = null>(message: string | FContextMessage<C>): Notification<C> {
    return new Notification<C>(message);
  },
  extend(object: object): QueueAction {
    class Extend extends Action<QueueContext> {
      async execute({ extend }: QueueContext): Promise<void> {
        extend(object);
      }
    }

    return new Extend();
  }
}
