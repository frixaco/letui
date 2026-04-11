/** Terminal appearance detection and runtime state for light/dark theming. */

import { $ } from "./signals";
import type { Appearance, AppearanceMode } from "./types";

const OSC_QUERY_TERMINATOR = "\x07";
const OSC_STRING_TERMINATOR = "\x1b\\";
const OSC_BACKGROUND_QUERY = "\x1b]11;?\x07";
const OSC_BACKGROUND_RESPONSE_PREFIX = "\x1b]11;";
const APPEARANCE_QUERY_TIMEOUT_MS = 200;

type AppearanceRequest = {
  resolve: (appearance: Appearance) => void;
  timer: Timer;
  promise: Promise<Appearance>;
};

export function appearance(): Appearance {
  return appearanceState();
}

export function refreshAppearance(): Promise<Appearance> {
  if (appearanceOverride !== "auto") {
    return Promise.resolve(setAppearance(appearanceOverride));
  }

  if (!sessionActive || !process.stdout.isTTY) {
    return Promise.resolve(setAppearance("unknown"));
  }

  if (appearanceRequest) {
    return appearanceRequest.promise;
  }

  let resolveRequest!: (appearance: Appearance) => void;
  const timer = setTimeout(() => {
    if (!appearanceRequest || appearanceRequest.promise !== promise) return;
    finishAppearanceRequest("unknown");
  }, APPEARANCE_QUERY_TIMEOUT_MS);
  const promise = new Promise<Appearance>((resolve) => {
    resolveRequest = resolve;
  });

  appearanceRequest = { resolve: resolveRequest, timer, promise };
  appearanceInputBuffer = "";
  process.stdout.write(OSC_BACKGROUND_QUERY);

  return promise;
}

export function configureAppearanceSession(mode: AppearanceMode): void {
  sessionActive = true;
  appearanceOverride = mode;
  appearanceInputBuffer = "";
  cancelAppearanceRequest();

  if (mode === "auto") {
    setAppearance("unknown");
    return;
  }

  setAppearance(mode);
}

export function cleanupAppearanceSession(): void {
  sessionActive = false;
  cancelAppearanceRequest();
}

export function stripAppearanceResponses(data: string): string {
  const chunk = appearanceInputBuffer + data;
  appearanceInputBuffer = "";

  let cursor = 0;
  let passthrough = "";

  while (cursor < chunk.length) {
    const responseStart = chunk.indexOf(OSC_BACKGROUND_RESPONSE_PREFIX, cursor);
    if (responseStart === -1) {
      passthrough += chunk.slice(cursor);
      break;
    }

    passthrough += chunk.slice(cursor, responseStart);

    const responseEnd = findOscTerminator(chunk, responseStart + OSC_BACKGROUND_RESPONSE_PREFIX.length);
    if (responseEnd === -1) {
      appearanceInputBuffer = chunk.slice(responseStart);
      return passthrough;
    }

    const response = chunk.slice(responseStart, responseEnd);
    const detected = parseAppearanceResponse(response);
    if (detected) {
      if (appearanceRequest) {
        finishAppearanceRequest(detected);
      } else if (appearanceOverride === "auto") {
        setAppearance(detected);
      }
    }

    cursor = responseEnd;
  }

  return passthrough;
}

function setAppearance(next: Appearance): Appearance {
  appearanceState(next);
  return next;
}

function finishAppearanceRequest(next: Appearance): Appearance {
  const request = appearanceRequest;
  appearanceRequest = null;
  if (request) {
    clearTimeout(request.timer);
  }

  const resolved = setAppearance(next);
  request?.resolve(resolved);
  return resolved;
}

function cancelAppearanceRequest(): void {
  if (appearanceRequest) {
    finishAppearanceRequest(appearanceState());
  }
  appearanceInputBuffer = "";
}

function findOscTerminator(chunk: string, fromIndex: number): number {
  for (let idx = fromIndex; idx < chunk.length; idx += 1) {
    if (chunk[idx] === OSC_QUERY_TERMINATOR) {
      return idx + OSC_QUERY_TERMINATOR.length;
    }

    if (chunk.startsWith(OSC_STRING_TERMINATOR, idx)) {
      return idx + OSC_STRING_TERMINATOR.length;
    }
  }

  return -1;
}

function parseAppearanceResponse(response: string): Appearance | null {
  const body = response.slice(OSC_BACKGROUND_RESPONSE_PREFIX.length);
  const terminatorLength = body.endsWith(OSC_STRING_TERMINATOR)
    ? OSC_STRING_TERMINATOR.length
    : OSC_QUERY_TERMINATOR.length;
  const colorValue = body.slice(0, body.length - terminatorLength);
  const rgb = parseOscColor(colorValue);
  if (!rgb) return null;
  return classifyAppearance(rgb);
}

function parseOscColor(input: string): [number, number, number] | null {
  if (input.startsWith("rgb:")) {
    const components = input.slice(4).split("/");
    if (components.length !== 3) return null;

    const rgb = components.map(parseOscComponent);
    if (rgb.some((value) => value === null)) return null;
    return rgb as [number, number, number];
  }

  if (input.startsWith("#")) {
    const hex = input.slice(1);
    if (hex.length !== 6) return null;

    const value = Number.parseInt(hex, 16);
    if (Number.isNaN(value)) return null;

    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  }

  return null;
}

function parseOscComponent(component: string): number | null {
  if (!/^[0-9a-fA-F]{1,4}$/.test(component)) return null;

  const value = Number.parseInt(component, 16);
  if (Number.isNaN(value)) return null;

  switch (component.length) {
    case 1:
      return value * 17;
    case 2:
      return value;
    case 3:
      return Math.round((value / 0x0fff) * 255);
    case 4:
      return Math.round((value / 0xffff) * 255);
    default:
      return null;
  }
}

function classifyAppearance([red, green, blue]: [number, number, number]): Appearance {
  const luminance = relativeLuminance(red, green, blue);
  return luminance >= 0.5 ? "light" : "dark";
}

function relativeLuminance(red: number, green: number, blue: number): number {
  const r = toLinearChannel(red);
  const g = toLinearChannel(green);
  const b = toLinearChannel(blue);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toLinearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

let appearanceState = $<Appearance>("unknown");
let appearanceOverride: AppearanceMode = "auto";
let appearanceRequest: AppearanceRequest | null = null;
let appearanceInputBuffer = "";
let sessionActive = false;
