import {
  networkInterfaces,
  NetworkInterfaceInfoIPv4,
  NetworkInterfaceInfo,
  hostname
} from "os";
import { createSocket, Socket } from "dgram";
import { isEqual } from "lodash";
import Immutable from "immutable";
import { fiberLoop } from "../fiber/fiberLoop";
import { ref } from "../fiber/fiberCell";
import { Action } from "./actions";

const IPv4_UDP_BROADCAST_PORT = 6663;
const IPv4_UDP_RECEIVE_PORT = 6664;

export const mainLoop = fiberLoop(
  (action: Action, cell, dispatch) => {
    if (action.type === "start") {
      dispatch({ type: "network.interface.poll" });
    }
    const networkInterfacesList = cell<string[]>(
      networkInterfacesList => {
        switch (action.type) {
          case "network.interface.added":
            return networkInterfacesList.concat(action.name);
          case "network.interface.removed":
            return networkInterfacesList.filter(name => name !== action.name);
          default:
            return networkInterfacesList;
        }
      },
      () => []
    );
    const networkInterfaceInfoMap = cell<
      Record<string, NetworkInterfaceInfoIPv4[]>
    >(
      networkInterfaceInfoMap => {
        switch (action.type) {
          case "network.interface.removed": {
            const { [action.name]: removed, ...rest } = networkInterfaceInfoMap;
            return rest;
          }
          case "network.interface.added": {
            return { ...networkInterfaceInfoMap, [action.name]: [] };
          }
          case "network.interface.changed.infos": {
            return { ...networkInterfaceInfoMap, [action.name]: action.infos };
          }
          default:
            return networkInterfaceInfoMap;
        }
      },
      () => ({})
    );
    if (action.type === "network.interface.poll") {
      const nis = networkInterfaces();
      const list = Object.keys(nis).filter(name => name !== "lo");
      const added = list.filter(name => !networkInterfacesList.includes(name));
      const removed = networkInterfacesList.filter(
        name => !list.includes(name)
      );
      const changed = Object.entries(nis)
        .filter(([name]) => name !== "lo")
        .map(([name, infos]) => [name, infos.filter(isIPv4family)] as const)
        .filter(
          ([name, infos]) => !isEqual(networkInterfaceInfoMap[name], infos)
        );
      added.forEach(name =>
        dispatch({ type: "network.interface.added", name })
      );
      removed.forEach(name =>
        dispatch({ type: "network.interface.removed", name })
      );
      changed.forEach(([name, infos]) => {
        dispatch({ type: "network.interface.changed.infos", name, infos });
      });
      setTimeout(() => dispatch({ type: "network.interface.poll" }), 5000);
    }
    const broadcastSocket = ref(cell, () => {
      const udpBroadcastSocket = createSocket("udp4");
      udpBroadcastSocket.on("listening", () => {
        udpBroadcastSocket.setBroadcast(true);
      });
      udpBroadcastSocket.on("error", error => {
        console.error(error);
      });
      return udpBroadcastSocket;
    });
    if (action.type === "network.interface.changed.infos") {
      dispatch({ type: "network.local.broadcast.announce" });
    }
    if (action.type === "network.local.broadcast.announce") {
      Object.entries(networkInterfaceInfoMap).forEach(
        ([networkInterface, infos]) =>
          infos.forEach(info =>
            sendBroadcastAnnounce(broadcastSocket, info, error => {
              if (error) {
                console.error(error);
              } else {
                dispatch({
                  type: "network.local.broadcast.announce.sent",
                  networkInterface,
                  address: getIPv4BroadcastAddress(info)
                });
              }
            })
          )
      );
      setTimeout(
        () => dispatch({ type: "network.local.broadcast.announce" }),
        5000
      );
    }
    const listeningSocket = ref(cell, () => {
      const listeningSocket = createSocket("udp4");
      listeningSocket.bind(IPv4_UDP_BROADCAST_PORT);
      listeningSocket.on("message", (message, info) => {
        dispatch({
          type: "network.local.broadcast.announce.received",
          id: message.toString(),
          address: info.address,
          timestamp: Date.now()
        });
      });
      listeningSocket.on("error", error => {
        console.error(error);
      });
      return listeningSocket;
    });
    const localNetworkPeersHeartbeat = cell(
      (
        localNetworkPeersHeartbeat: Immutable.Map<
          string,
          Immutable.Map<string, number>
        >
      ) => {
        if (action.type === "network.local.broadcast.announce.received") {
          const { address, id, timestamp } = action;
          const peerAddresses = localNetworkPeersHeartbeat.get(
            id,
            Immutable.Map<string, number>()
          );
          return localNetworkPeersHeartbeat.set(
            id,
            peerAddresses.set(address, timestamp)
          );
        }
        return localNetworkPeersHeartbeat;
      },
      () => Immutable.Map()
    );
    const peersLastSeen = cell(
      (peersLastSeen: Map<string, number>) => {
        if (action.type === "network.local.broadcast.announce.received") {
          peersLastSeen.set(action.id, action.timestamp);
        }
        return peersLastSeen;
      },
      () => new Map()
    );
    const reachablePeers = cell(
      (reachablePeers: Set<string>) => {
        if (
          action.type === "network.local.broadcast.announce.received" &&
          !reachablePeers.has(action.id)
        ) {
          return new Set(reachablePeers).add(action.id);
        }
        const now = Date.now();
        const reachable = [...reachablePeers].filter(
          peerId => (peersLastSeen.get(peerId) || 0) > now - 20 * 1000
        );
        if (reachable.length !== reachablePeers.size) {
          return new Set(...reachable);
        }
        return reachablePeers;
      },
      () => new Set()
    );
    const messageQueueByRecipient = cell(
      (
        messageQueueByRecipient: Immutable.Map<string, Immutable.List<string>>
      ) => {
        switch (action.type) {
          case "message.enqueue": {
            const { recipient, message } = action;
            return messageQueueByRecipient.set(
              recipient,
              messageQueueByRecipient
                .get(recipient, Immutable.List<string>())
                .push(message)
            );
          }
          default:
            return messageQueueByRecipient;
        }
      },
      () => Immutable.Map()
    );
    const receiveSocket = ref(cell, () => {
      const receiveSocket = createSocket("udp4");
      receiveSocket.on("message", (message, info) => {
        console.log(message.toString(), info);
      });
      receiveSocket.bind(IPv4_UDP_RECEIVE_PORT);
      return receiveSocket;
    });
    if (action.type === "message.enqueue") {
      const minuteAgo = Date.now() - 60 * 1000;
      const address = localNetworkPeersHeartbeat
        .get(action.recipient, Immutable.Map<string, number>())
        .findKey(value => value > minuteAgo);
      if (address) {
        receiveSocket.send(
          action.message,
          IPv4_UDP_RECEIVE_PORT,
          address,
          error => {
            if (error) console.error(error);
          }
        );
      }
    }
    return { reachablePeers, messageQueueByRecipient };
  },
  { type: "start" } as const
);

function isIPv4family(
  info: NetworkInterfaceInfo
): info is NetworkInterfaceInfoIPv4 {
  return info.family === "IPv4";
}

function sendBroadcastAnnounce(
  broadcastSocket: Socket,
  networkInterfaceInfo: NetworkInterfaceInfoIPv4,
  callback?: (error: Error | null, bytes: number) => void
) {
  var message = Buffer.from(hostname());
  const broadcastAddress = getIPv4BroadcastAddress(networkInterfaceInfo);
  broadcastSocket.send(
    message,
    0,
    message.length,
    IPv4_UDP_BROADCAST_PORT,
    broadcastAddress,
    callback
  );
}

function getIPv4BroadcastAddress({
  address,
  netmask
}: NetworkInterfaceInfoIPv4) {
  const address_splitted = address.split(".");
  const netmask_splitted = netmask.split(".");
  return address_splitted
    .map((e, i) => (~netmask_splitted[i] & 0xff) | (e as any))
    .join(".");
}

/*
  if (there are messages waiting for ack longer than timeout) {
    put them back to queued messages
  }
  if (peer is up and there are enqueued messages and messages waiting for ack are less than limit) {
    send N enqueued messages and move them to the waiting for ack queue
  }
*/
