import { List, Map, hash } from "immutable";
import { makeFiber } from "../fiber/fiber";
import { createSocket } from "dgram";
import { string } from "prop-types";
import {
  networkInterfaces,
  NetworkInterfaceInfo,
  NetworkInterfaceInfoIPv4
} from "os";
import { createHash } from "crypto";
import { AddressInfo } from "net";

function enqueue(queued: List<string>, hash: string) {
  return queued.push(hash);
}

function acknowledge(windowed: Map<string, number>, hash: string) {
  return windowed.remove(hash);
}

function check(
  queued: List<string>,
  windowed: Map<string, number>,
  windowSize: number,
  timeout: number,
  now: number
) {
  const timedout = List(
    windowed.filter(timestamp => now - timestamp >= timeout).keys()
  );
  const waiting = windowed.filter(timestamp => now - timestamp < timeout);
  const moveable = Math.max(0, windowSize - timedout.size - waiting.size);
  const moved = queued.take(moveable);
  const sending = timedout.concat(moved);
  const newQueued = queued.skip(moveable);
  const newWindowed = waiting.merge(sending.map(hash => [hash, now]));
  return { queued: newQueued, windowed: newWindowed, sending };
}

type Action =
  | { type: "enqueue"; hash: string }
  | { type: "acknoledge"; hash: string }
  | { type: "check"; now: number };
type State = {
  queued: List<string>;
  windowed: Map<string, number>;
  sending: List<string>;
};

const windowSend = (windowSize: number, timeout: number) => (
  { queued, windowed }: State,
  action: Action
): State => {
  switch (action.type) {
    case "enqueue":
      return {
        queued: enqueue(queued, action.hash),
        windowed,
        sending: List()
      };
    case "acknoledge":
      return {
        queued,
        windowed: acknowledge(windowed, action.hash),
        sending: List()
      };
    case "check":
      return check(queued, windowed, windowSize, timeout, action.now);
  }
};

function subjectStateful<T>(initial: T) {
  type Listener = (event: T) => void;
  type Subscription = { listener: Listener };
  const subscriptions = new Set<Subscription>();
  let currentState = initial;
  function subscribe(listener: Listener) {
    const subscription = { listener };
    subscriptions.add(subscription);
    return () => {
      subscriptions.delete(subscription);
    };
  }
  function publish(event: T) {
    currentState = event;
    for (const { listener } of subscriptions) {
      listener(event);
    }
  }
  function state() {
    return currentState;
  }
  return [state, subscribe, publish] as const;
}

function makeStore<State, Action>(
  reducer: (state: State, action: Action) => State,
  initial: State
) {
  const [state, subscribe, publish] = subjectStateful<State>(initial);
  const dispatch = (action: Action) => {
    publish(reducer(state(), action));
  };
  return { state, subscribe, dispatch };
}

function test1() {
  const messages = ["a", "b", "c", "d"];
  const timeout = 10000;
  const windowSize = 2;
  const port = 6654;
  const store = makeStore(windowSend(windowSize, timeout), {
    queued: List<string>(),
    sending: List<string>(),
    windowed: Map<string, number>()
  });
  const socket = createSocket({ type: "udp4", reuseAddr: true });
  socket.on("listening", () => {
    socket.setBroadcast(true);
    // messages.forEach(message => store.dispatch({type: "enqueue", hash: message}))
  });
  setInterval(() => {
    getBroadcastAddresses().forEach(address =>
      socket.send(process.argv[2], port, address)
    );
  }, 10000);
  socket.on("message", (message, info) => {
    console.log(message.toString(), info);
  });
  socket.bind(port);
  // store.subscribe(({sending}) => {
  //   sending.forEach(message => {
  //     socket.send(message, port, "")
  //   })
  // })
  // socket.on("message", (message, info) => {
  //   store.dispatch({type: "acknoledge", hash: message.toString()})
  // })
}

// test1();

function getBroadcastAddresses() {
  const { lo, ...interfaces } = networkInterfaces();
  return Object.values(interfaces)
    .flatMap(addresses => addresses.filter(isIPv4family))
    .map(getIPv4BroadcastAddress);
}

function isIPv4family(
  info: NetworkInterfaceInfo
): info is NetworkInterfaceInfoIPv4 {
  return info.family === "IPv4";
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

const stun = require("stun");

function getAddresses() {
  const { lo, ...interfaces } = networkInterfaces();
  return Object.values(interfaces)
    .flatMap(addresses => addresses.filter(isIPv4family))
    .map(info => info.address);
}

function test2() {
  const googleStun = { address: "66.102.1.127", port: 19302 };
  const listeningSockets = getAddresses().map(address => {
    const socket = createSocket("udp4");
    socket.on("listening", () => {
      console.log("listening socket up on address " + address);
    });
    socket.on("message", (message, info) => {
      console.log(message.toString(), message, info);
    });
    socket.on("error", error => console.error(error));
    socket.bind(0, address);
    return socket;
  });
  const sendingSocket = createSocket("udp4");
  sendingSocket.on("listening", () => {
    console.log("sending socket up");
  });
  sendingSocket.on("error", error => console.error(error));
  listeningSockets.forEach(socket => {
    stun.request(
      "stun.l.google.com:19302",
      { socket },
      (err: any, res: any) => {
        if (err) {
          console.error(err);
        } else {
          const publicAddress = res.getXorAddress();
          const localAddress = socket.address() as AddressInfo;
          console.log("mapping", localAddress, publicAddress);
          sendingSocket.send(
            "local message",
            localAddress.port,
            localAddress.address,
            (error, bytes) => {
              console.log("sent", error, bytes);
            }
          );
          // let t = 8;
          // while (t--) {
          //   sendingSocket.send(
          //     "stunned message",
          //     publicAddress.port,
          //     publicAddress.address,
          //     (error, bytes) => {
          //       console.log("sent", error, bytes);
          //     }
          //   );
          // }
        }
      }
    );
  });
}

test2();
