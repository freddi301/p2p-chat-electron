import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect
} from "react";
import "./App.css";
import { mainLoop } from "./core/main";
import Immutable from "immutable";

const App = () => {
  const reachablePeers = useFiberLoopValue(s => s.reachablePeers);
  const messageQueueByRecipient = useFiberLoopValue(
    s => s.messageQueueByRecipient
  );
  return (
    <div>
      <SendMessage />
      <ul>
        {Array.from(reachablePeers, id => (
          <li key={id}>{id}</li>
        ))}
      </ul>
      <ul>
        {Array.from(messageQueueByRecipient.keys(), recipient => (
          <React.Fragment key={recipient}>
            {recipient}
            <ol>
              {Array.from(
                messageQueueByRecipient.get(
                  recipient,
                  Immutable.List<string>()
                ),
                (message, index) => (
                  <li key={index}>{message}</li>
                )
              )}
            </ol>
          </React.Fragment>
        ))}
      </ul>
      <Log />
    </div>
  );
};

export default App;

function SendMessage() {
  const looper = useContext(MainContext);
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const send = useCallback(() => {
    looper.dispatch({ type: "message.enqueue", recipient, message });
    setMessage("");
  }, [looper, recipient, message]);
  return (
    <div>
      recipient{" "}
      <input value={recipient} onChange={e => setRecipient(e.target.value)} />
      message{" "}
      <input value={message} onChange={e => setMessage(e.target.value)} />
      <button onClick={send}>send</button>
    </div>
  );
}

function Log() {
  const logs = useLog();
  const element = useRef<HTMLDivElement | null>(null);
  const isAtBottom = useRef(false);
  useEffect(() => {
    if (element.current) {
      isAtBottom.current =
        element.current.scrollHeight - element.current.scrollTop ===
          element.current.clientHeight ||
        element.current.offsetHeight + element.current.scrollTop ===
          element.current.scrollHeight;
    }
  }, [logs]);
  useLayoutEffect(() => {
    if (element.current && isAtBottom.current) {
      element.current.scrollTo({
        top: element.current.scrollHeight
      });
    }
  }, [logs]);
  return (
    <div ref={element} style={{ height: "300px", overflowY: "scroll" }}>
      {logs.map((entry, index) => (
        <div key={index}>{entry}</div>
      ))}
    </div>
  );
}

const MainContext = React.createContext(mainLoop);

function useLog() {
  const looper = useContext(MainContext);
  const [logs, setLogs] = useState([] as string[]);
  useEffect(
    () =>
      looper.subscribe(([action]) => {
        setLogs(logs => logs.concat(JSON.stringify(action)));
      }),
    [looper]
  );
  return logs;
}

function useFiberLoopValue<T>(
  selector: (state: ReturnType<typeof mainLoop["state"]>[1]) => T
) {
  const looper = useContext(MainContext);
  const last = useRef(selector(looper.state()[1]));
  const [data, setData] = useState(selector(looper.state()[1]));
  useEffect(
    () =>
      looper.subscribe(([action, state]) => {
        const selection = selector(state);
        if (selection !== last.current) {
          setData(selection);
          last.current = selection;
        } else {
          return last.current;
        }
      }),
    [looper]
  );
  return data;
}
