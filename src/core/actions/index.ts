import { NetworkInterfaceInfoIPv4 } from "os";
import { NetworkAction } from "./network";

export type Action =
  | { type: "start" }
  | NetworkAction
  | { type: "message.enqueue"; recipient: string; message: string };
