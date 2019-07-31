import React, { useContext, useEffect, useRef, useState } from "react";
import "./App.css";
import { mainLoop } from "./main";

const App = () => {
  const reachablePeers = useReachablePeers();
  const logs = useLog();
  return (
    <div>
      <ul>
        {Array.from(reachablePeers, id => (
          <li key={id}>{id}</li>
        ))}
      </ul>
      <div style={{ height: "300px", overflowY: "scroll" }}>
        {logs.map((entry, index) => (
          <div key={index}>{entry}</div>
        ))}
      </div>
    </div>
  );
};

export default App;

const MainContext = React.createContext(mainLoop);

function useReachablePeers() {
  const looper = useContext(MainContext);
  const last = useRef(looper.state()[1].reachablePeers);
  const [data, setData] = useState(looper.state()[1].reachablePeers);
  useEffect(
    () =>
      looper.subscribe(([action, { reachablePeers }]) => {
        if (reachablePeers !== last.current) {
          setData(reachablePeers);
          last.current = reachablePeers;
        } else {
          return last.current;
        }
      }),
    [looper]
  );
  return data;
}

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
