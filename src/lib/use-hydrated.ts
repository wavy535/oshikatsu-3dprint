"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Controls that need JavaScript must not silently lose pre-hydration input. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
