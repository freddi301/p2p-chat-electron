import React, { useState, useCallback, useEffect, useRef } from "react";
import { Set, Map, List } from "immutable";
import { createHash } from "crypto";
const hyperswarm = require("hyperswarm");

const App = () => {
  const topics = useTopics();
  const messages = useMessages();
  const swarm = useSwarm({ topics: topics.topics, addMessage: messages.add });
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const conversation = currentTopic
    ? messages.messages.get(currentTopic, List<string>())
    : null;
  const send = useCallback(
    (message: string) => {
      if (currentTopic) {
        messages.add(currentTopic, message);
        swarm.send(currentTopic, message);
      }
    },
    [currentTopic, swarm.send, messages.add]
  );
  useEffect(() => {
    topics.add("welcome");
    setCurrentTopic(
      createHash("sha256")
        .update("welcome")
        .digest("hex")
    );
  }, [topics.add]);
  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0
      }}
    >
      <div style={{ width: "200px", borderRight: "1px solid black" }}>
        <Topics
          {...topics}
          onSelect={setCurrentTopic}
          currentTopic={currentTopic}
        />
      </div>
      <div style={{ flexGrow: 1 }}>
        {conversation ? (
          <Chat conversation={conversation} send={send} />
        ) : (
          <>select topic</>
        )}
      </div>
    </div>
  );
};

export default App;

function Topics({
  add,
  remove,
  topics,
  onSelect,
  currentTopic
}: {
  onSelect(topicHash: string): void;
  currentTopic: string | null;
} & ReturnType<typeof useTopics>) {
  const [text, setText] = useState("");
  return (
    <div>
      <div>
        <input value={text} onChange={e => setText(e.target.value)} />
        <button
          onClick={() => {
            if (text) {
              add(text);
              setText("");
            }
          }}
        >
          add
        </button>
      </div>
      <ul>
        {Array.from(topics.entries(), ([topicHash, topic]) => (
          <li key={topicHash} onClick={() => onSelect(topicHash)}>
            {topicHash === currentTopic ? <strong>{topic}</strong> : topic}
            <button onClick={() => remove(topicHash)}>remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chat({
  conversation,
  send
}: {
  conversation: List<string>;
  send(text: string): void;
}) {
  const [text, setText] = useState("");

  return (
    <div style={{ flexGrow: 1, flexDirection: "column" }}>
      <div>
        <input value={text} onChange={e => setText(e.target.value)} />
        <button
          onClick={() => {
            if (text) {
              send(text);
              setText("");
            }
          }}
        >
          send
        </button>
      </div>
      <div style={{ overflowY: "scroll", flexGrow: 1 }}>
        {Array.from(conversation.values(), (message, index) => (
          <div key={index}>{message}</div>
        ))}
      </div>
    </div>
  );
}

function useTopics() {
  const [topics, setTopics] = useState(Map<string, string>());
  const add = useCallback(
    (topic: string) =>
      setTopics(topics => {
        const topicHash = createHash("sha256")
          .update(topic)
          .digest("hex");
        return topics.set(topicHash, topic);
      }),
    []
  );
  const remove = useCallback(
    (topic: string) => setTopics(topics => topics.remove(topic)),
    []
  );
  return { topics, add, remove };
}

function useMessages() {
  const [messages, setMessages] = useState(Map<string, List<string>>());
  const add = useCallback((topic: string, message: string) => {
    setMessages(messages =>
      messages.set(topic, messages.get(topic, List<string>()).push(message))
    );
  }, []);
  return { messages, add };
}

function useSwarm({
  topics,
  addMessage
}: {
  topics: Map<string, string>;
  addMessage(topicHash: string, message: string): void;
}) {
  const [swarm] = useState(() => hyperswarm());
  const sockets = useRef<Map<string, Set<any>>>(Map());
  useEffect(() => {
    topics.forEach(topic =>
      swarm.join(
        createHash("sha256")
          .update(topic)
          .digest(),
        {
          lookup: true,
          announce: true
        }
      )
    );
    return () => {
      topics.forEach(topic =>
        swarm.leave(
          createHash("sha256")
            .update(topic)
            .digest()
        )
      );
    };
  }, [swarm, topics]);
  useEffect(() => {
    swarm.on("connection", (socket: any, details: any) => {
      console.log("new connection", details);
      if (details.peer) {
        const topicHex = details.peer.topic.toString("hex");
        sockets.current = sockets.current.set(
          topicHex,
          sockets.current.get(topicHex, Set<any>()).add(socket)
        );
        socket.on("data", (message: Buffer) => {
          console.log("new message", message, details);
          addMessage(topicHex, message.toString());
        });
      }
    });
  }, [swarm, addMessage]);
  const send = useCallback((topicHash: string, message: string) => {
    sockets.current.get(topicHash, Set<any>()).forEach(socket => {
      socket.write(message);
    });
  }, []);
  return { send };
}
