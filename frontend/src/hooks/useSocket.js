import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

let socket;

export function useSocket(handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!socket) {
      socket = io({ path: "/socket.io" });
    }

    const events = Object.keys(handlersRef.current);
    events.forEach((ev) => socket.on(ev, (...args) => handlersRef.current[ev]?.(...args)));

    return () => {
      events.forEach((ev) => socket.off(ev));
    };
  }, []);

  return socket;
}
