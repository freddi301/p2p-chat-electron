import { NetworkInterfaceInfoIPv4 } from "os";

export type NetworkAction =
  | { type: "network.interface.added"; name: string }
  | { type: "network.interface.removed"; name: string }
  | {
      type: "network.interface.changed.infos";
      name: string;
      infos: NetworkInterfaceInfoIPv4[];
    }
  | { type: "network.interface.poll" }
  | { type: "network.local.broadcast.announce" }
  | {
      type: "network.local.broadcast.announce.sent";
      networkInterface: string;
      address: string;
    }
  | {
      type: "network.local.broadcast.announce.received";
      id: string;
      address: string;
      timestamp: number;
    };
