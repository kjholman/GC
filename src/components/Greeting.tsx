"use client";

import { useSyncExternalStore } from "react";

const greetingFor = (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

// Re-check every minute so the greeting changes if the page is left open.
const subscribe = (notify: () => void) => {
  const t = setInterval(notify, 60_000);
  return () => clearInterval(t);
};

/** "Good morning, Jane" using the viewer's own clock; the server's Toronto-time version shows until the page loads. */
export function Greeting({ name, serverGreeting }: { name: string; serverGreeting: string }) {
  const greeting = useSyncExternalStore(subscribe, () => greetingFor(new Date().getHours()), () => serverGreeting);
  return <>{`${greeting}, ${name}`}</>;
}
