import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
  useMemo,
  ComponentType,
  useReducer,
  Reducer
} from "react";
import { Set, Map, List, Seq, Collection } from "immutable";
import sodium from "libsodium-wrappers";
import { Database } from "sqlite3";
import { createSocket } from "dgram";
import {
  networkInterfaces,
  NetworkInterfaceInfo,
  NetworkInterfaceInfoIPv4
} from "os";
import { subjectStateful } from "./fiber/fiberLoop";

const App = () => {
  const identities = useIdentities();
  const contacts = useContacts();
  const [currentIdentity, setCurrentIdentity] = useState<string | null>(null);
  const [currentContact, setCurrentContact] = useState<string | null>(null);
  return (
    <DesktopLayout
      left={
        <>
          <CreateIdentity create={identities.create} />
          <Identities
            keyPairs={identities.keypairs}
            onSelect={setCurrentIdentity}
          />
          <AddContact add={contacts.add} />
          <Contacts contacts={contacts.list} onSelect={setCurrentContact} />
          <LocalPeers />
        </>
      }
      right={
        currentContact &&
        currentIdentity && <Chat from={currentIdentity} to={currentContact} />
      }
    />
  );
};

export default App;

function Identities({
  keyPairs,
  onSelect
}: {
  keyPairs: Map<string, string>;
  onSelect(publicKey: string): void;
}) {
  return (
    <div>
      {Array.from(keyPairs, ([publicKey, privateKey]) => (
        <div
          key={publicKey}
          style={{ borderBottom: "1px solid black" }}
          onClick={() => onSelect(publicKey)}
        >
          <div
            style={{
              width: "100px",
              overflowX: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            {publicKey}
          </div>
          <div
            style={{
              width: "100px",
              overflowX: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            {privateKey}
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateIdentity({ create }: { create(): void }) {
  return (
    <div>
      <button onClick={create}>create identity</button>
    </div>
  );
}

function Contacts({
  contacts,
  onSelect
}: {
  contacts: Set<string>;
  onSelect(publicKey: string): void;
}) {
  return (
    <div>
      {Array.from(contacts, contact => (
        <div
          key={contact}
          style={{
            width: "100px",
            overflowX: "hidden",
            textOverflow: "ellipsis"
          }}
          onClick={() => onSelect(contact)}
        >
          {contact}
        </div>
      ))}
    </div>
  );
}

function Chat({ from, to }: { from: string; to: string }) {
  const messages = useMessages(from, to);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div>
        <span
          style={{
            width: "100px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "inline-block"
          }}
        >
          {from}
        </span>
        ->
        <span
          style={{
            width: "100px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "inline-block"
          }}
        >
          {to}
        </span>
      </div>
      <div
        style={{
          flexGrow: 1,
          overflowY: "scroll",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {Array.from(messages.list, ({ message, from: _from }, index) => {
          const isFromMe = from === _from;
          return (
            <div
              key={index}
              style={
                isFromMe
                  ? {
                      borderLeft: "4px solid black",
                      paddingLeft: "4px",
                      paddingRight: "16px",
                      alignSelf: "flex-start"
                    }
                  : {
                      borderRight: "4px solid black",
                      paddingLeft: "16px",
                      paddingRight: "4px",
                      alignSelf: "flex-end"
                    }
              }
            >
              {message}
            </div>
          );
        })}
      </div>
      <div>
        <ComposeMessage onSend={messages.add} />
      </div>
    </div>
  );
}

function ComposeMessage({ onSend }: { onSend(text: string): void }) {
  const [text, setText] = useState("");
  return (
    <>
      <input value={text} onChange={e => setText(e.target.value)} />
      <button
        onClick={() => {
          onSend(text);
          setText("");
        }}
      >
        send
      </button>
    </>
  );
}

function getReachablePeers(heartbeat: any): Seq.Indexed<string> {
  return heartbeat.keySeq();
}

function LocalPeers() {
  const peers = useStore(heartbeatStore, getReachablePeers);
  return (
    <div>
      -----------
      <br />
      local peers:
      {Array.from(peers, peer => (
        <div
          key={peer}
          style={{
            width: "100px",
            overflowX: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {peer}
        </div>
      ))}
    </div>
  );
}

function DesktopLayout({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          height: "100%",
          width: "300px",
          borderRight: "1px solid black",
          overflowY: "scroll"
        }}
      >
        {left}
      </div>
      <div style={{ flexGrow: 1, width: "100%" }}>{right}</div>
    </div>
  );
}

function AddContact({ add }: { add(contact: string): void }) {
  const [text, setText] = useState("");
  const addContact = useCallback(() => {
    add(text);
    setText("");
  }, [add, text]);
  return (
    <div>
      <input value={text} onChange={e => setText(e.target.value)} />
      <button onClick={addContact}>add contact</button>
    </div>
  );
}

function useContacts() {
  const [list, setList] = useState(Set<string>());
  const add = useCallback((contact: string) => {
    setList(list => list.add(contact));
    insertContact(contact);
  }, []);
  useEffect(() => {
    loadContacts().then(contacts => setList(list => list.merge(contacts)));
  }, []);
  return { list, add };
}

function useIdentities() {
  const [keypairs, setKeypairs] = useState(Map<string, string>());
  const create = useCallback(() => {
    const { privateKey, publicKey } = generateIdentity();
    setKeypairs(keypairs => keypairs.set(publicKey, privateKey));
    insertIdentity(publicKey, privateKey);
  }, []);
  useEffect(() => {
    loadIdentities().then(identities =>
      setKeypairs(keypairs => keypairs.merge(identities))
    );
  }, []);
  useEffect(() => {
    identitiesStore.dispatch(keypairs);
  }, [keypairs]);
  return { keypairs, create };
}

function generateIdentity() {
  const { privateKey, publicKey } = sodium.crypto_sign_keypair("hex");
  return { privateKey, publicKey };
}

function useMessages(from: string, to: string) {
  const [list, setList] = useState(
    List<{ from: string; to: string; message: string }>()
  );
  const add = useCallback(
    (message: string) => {
      setList(list => list.push({ from, to, message }));
      insertMessage(
        from,
        to,
        message,
        false,
        sodium.crypto_generichash(32, from + to + message, undefined, "hex")
      );
    },
    [from, to]
  );
  useEffect(() => {
    loadMessages().then(messages =>
      setList(list =>
        messages
          .filter(
            message =>
              (message.from === from && message.to === to) ||
              (message.from === to && message.to === from)
          )
          .concat(list)
      )
    );
  }, [from, to]);
  return { list, add };
}

const db = new Database("chats.sqlite");

function dropDatabaseTables() {
  db.run("DROP TABLE identities");
  db.run("DROP TABLE contacts");
  db.run("DROP TABLE messages");
}

// dropDatabaseTables();

const dbReady = Promise.all([
  new Promise((resolve, reject) =>
    db.run(
      "CREATE TABLE IF NOT EXISTS identities (public_key TEXT PRIMARY KEY, private_key TEXT NOT NULL)",
      error => (error ? reject(error) : resolve())
    )
  ),
  new Promise((resolve, reject) =>
    db.run(
      "CREATE TABLE IF NOT EXISTS contacts (public_key TEXT PRIMARY KEY)",
      error => (error ? reject(error) : resolve())
    )
  ),
  new Promise((resolve, reject) =>
    db.run(
      "CREATE TABLE IF NOT EXISTS messages (from_public_key TEXT NOT NULL, to_public_key TEXT NOT NULL, message TEXT NOT NULL, delivered BOOLEAN NOT NULL, ack_hash TEXT PRIMARY KEY)",
      error => (error ? reject(error) : resolve())
    )
  )
]);

async function loadIdentities() {
  await dbReady;
  return new Promise<Map<string, string>>((resolve, reject) => {
    db.all("SELECT public_key, private_key FROM identities", (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(
          Map(
            rows.map(({ public_key, private_key }) => [public_key, private_key])
          )
        );
      }
    });
  });
}

async function insertIdentity(publicKey: string, privateKey: string) {
  await dbReady;
  db.run(
    "INSERT INTO identities (public_key, private_key) VALUES ($publicKey, $privateKey)",
    {
      $publicKey: publicKey,
      $privateKey: privateKey
    }
  );
}

async function loadContacts() {
  await dbReady;
  return new Promise<Set<string>>((resolve, reject) => {
    db.all("SELECT public_key FROM contacts", (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(Set(rows.map(({ public_key }) => public_key)));
      }
    });
  });
}

async function insertContact(publicKey: string) {
  await dbReady;
  db.run("INSERT INTO contacts (public_key) VALUES ($publicKey)", {
    $publicKey: publicKey
  });
}

async function insertMessage(
  fromPublicKey: string,
  toPublicKey: string,
  message: string,
  delivered: boolean,
  ackHash: string
) {
  await dbReady;
  db.run(
    "INSERT INTO messages (from_public_key, to_public_key, message, delivered, ack_hash) VALUES ($fromPublicKey, $toPublicKey, $message, $delivered, $ackHash)",
    {
      $fromPublicKey: fromPublicKey,
      $toPublicKey: toPublicKey,
      $message: message,
      $delivered: delivered,
      $ackHash: ackHash
    }
  );
}

async function updateMessageDelivered(delivered: boolean, ackHash: string) {
  await dbReady;
  db.run(
    "UPDATE messages SET delivered = $delivered WHERE ack_hash = $ackHash",
    {
      $delivered: delivered,
      $ackHash: ackHash
    }
  );
}

async function loadMessages() {
  await dbReady;
  return new Promise<
    List<{ from: string; to: string; message: string; delivered: boolean }>
  >((resolve, reject) => {
    db.all(
      "SELECT from_public_key, to_public_key, message FROM messages",
      (error, rows) => {
        if (error) {
          reject(error);
        } else {
          resolve(
            List(
              rows.map(
                ({ from_public_key, to_public_key, message, delivered }) => ({
                  from: from_public_key,
                  to: to_public_key,
                  message,
                  delivered
                })
              )
            )
          );
        }
      }
    );
  });
}

const heartbeatStore = makeStore(
  (
    heartbeat: Map<string, { address: string; timestamp: number }>,
    action:
      | { type: "beat"; publicKey: string; address: string; timestamp: number }
      | { type: "check" }
  ) => {
    const updatedHeartbeat =
      action.type === "beat"
        ? heartbeat.set(action.publicKey, {
            address: action.address,
            timestamp: action.timestamp
          })
        : heartbeat;
    const now = Date.now();
    return updatedHeartbeat.filter(
      ({ timestamp }) => now - timestamp < 10 * 1000
    );
  },
  Map<string, { address: string; timestamp: number }>()
);

const identitiesStore = makeStore<Map<string, string>, Map<string, string>>(
  (s, a) => a,
  Map<string, string>()
);

const broadcastPort = 5782;

const broadcastSocket = createSocket("udp4");
broadcastSocket.on("listening", () => {
  broadcastSocket.setBroadcast(true);
});
broadcastSocket.bind(broadcastPort, "0.0.0.0");
broadcastSocket.on("message", (message, info) => {
  const { publicKey, addressSignature, timestamp } = JSON.parse(
    message.toString()
  );
  const isTimedOut = Date.now() - timestamp > 10 * 1000;
  const isValid =
    !isTimedOut &&
    sodium.crypto_sign_verify_detached(
      sodium.from_hex(addressSignature),
      info.address + timestamp,
      sodium.from_hex(publicKey)
    );
  if (isValid) {
    heartbeatStore.dispatch({
      type: "beat",
      address: info.address,
      publicKey,
      timestamp
    });
  }
});
function broadcastHeartbeat() {
  const timestamp = Date.now();
  getAddresses().forEach(({ address, broadcast }) => {
    identitiesStore.state().forEach((privateKey, publicKey) => {
      const message = JSON.stringify({
        publicKey,
        addressSignature: sodium.crypto_sign_detached(
          address + timestamp,
          sodium.from_hex(privateKey),
          "hex"
        ),
        timestamp
      });
      broadcastSocket.send(message, broadcastPort, broadcast);
    });
  });
}
setInterval(broadcastHeartbeat, 1000);

function getAddresses() {
  const { lo, ...interfaces } = networkInterfaces();
  return Object.values(interfaces)
    .flatMap(addresses => addresses.filter(isIPv4family))
    .map(info => ({
      address: info.address,
      broadcast: getIPv4BroadcastAddress(info)
    }));
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

function useStore<State, Projection>(
  store: {
    state(): State;
    subscribe(listener: (state: State) => void): () => void;
  },
  projection: (state: State) => Projection
) {
  const [value, setValue] = useState(() => projection(store.state()));
  const listener = useMemo(() => {
    let last = projection(store.state());
    return (state: State) => {
      const next = projection(state);
      if (next !== last) {
        last = next;
        setValue(next);
      }
    };
  }, [store, projection]);
  useEffect(() => store.subscribe(listener), [listener, store]);
  return value;
}

const dataPort = 5783;
const dataSocket = createSocket("udp4");
dataSocket.bind(dataPort, "0.0.0.0");
dataSocket.on("message", (message, info) => {
  const action: DataMessage = JSON.parse(message.toString());
  switch (action.type) {
    case "msg": {
      const privateKey = identitiesStore.state().get(action.to);
      if (privateKey) {
        const decrypted = sodium.crypto_box_open_easy(
          sodium.from_hex(action.message),
          sodium.from_hex(action.nonce),
          sodium.crypto_sign_ed25519_pk_to_curve25519(
            sodium.from_hex(action.from)
          ),
          sodium.crypto_sign_ed25519_sk_to_curve25519(
            sodium.from_hex(privateKey)
          ),
          "text"
        );
        const ackHash = sodium.crypto_generichash(
          32,
          action.from + action.to + decrypted,
          undefined,
          "hex"
        );
        insertMessage(action.from, action.to, decrypted, true, ackHash);
        dataSocket.send(
          JSON.stringify({ type: "ack", hash: ackHash }),
          info.port,
          info.address
        );
      }
      break;
    }
    case "ack": {
      updateMessageDelivered(true, action.hash);
    }
  }
});

type DataMessage =
  | {
      type: "msg";
      from: string;
      to: string;
      message: string;
      nonce: string;
    }
  | { type: "ack"; hash: string };

async function trySend() {
  (await loadMessages())
    .filter(message => !message.delivered)
    .filter(message => identitiesStore.state().has(message.from))
    .filter(message => heartbeatStore.state().has(message.to))
    .groupBy(message => message.to)
    .map(messages => messages.take(4))
    .forEach((messages, to) =>
      messages.forEach(message => {
        const destination = heartbeatStore.state().get(to);
        const privateKey = identitiesStore.state().get(message.from);
        if (destination && privateKey) {
          const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
          const packet = {
            type: "msg",
            from: message.from,
            to: message.to,
            nonce: sodium.to_hex(nonce),
            message: sodium.crypto_box_easy(
              message.message,
              nonce,
              sodium.crypto_sign_ed25519_pk_to_curve25519(
                sodium.from_hex(message.to)
              ),
              sodium.crypto_sign_ed25519_sk_to_curve25519(
                sodium.from_hex(privateKey)
              ),
              "hex"
            )
          };
          dataSocket.send(
            JSON.stringify(packet),
            dataPort,
            destination.address
          );
        }
      })
    );
  setTimeout(trySend, 10000);
}

trySend();
