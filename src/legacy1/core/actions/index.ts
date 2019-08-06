import { NetworkInterfaceInfoIPv4 } from "os";
import { NetworkAction } from "./network";

export type Action =
  | { type: "start" }
  | NetworkAction
  | { type: "message.enqueue"; recipient: string; message: string }
  | { type: "message.sent"; recipient: string; message: string; hash: string }
  | { type: "message.retry"; recipient: string; message: string }
  | { type: "message.received"; sender: string; message: string }
  | {
      type: "message.acknowledgment.received";
      recipient: string;
      hash: string;
    };
