/** Terminal appearance detection and runtime state for light/dark theming. */

import process from "node:process";
import { $ } from "./signals.ts";
import type { Appearance, AppearanceMode } from "./types.ts";

const ENABLE_COLOR_SCHEME_UPDATES = "\x1b[?2031h";
const DISABLE_COLOR_SCHEME_UPDATES = "\x1b[?2031l";
const REQUEST_COLOR_SCHEME = "\x1b[?996n";
const COLOR_SCHEME_DARK = "\x1b[?997;1n";
const COLOR_SCHEME_LIGHT = "\x1b[?997;2n";
const OSC_QUERY_TERMINATOR = "\x07";
const OSC_STRING_TERMINATOR = "\x1b\\";
const OSC_BACKGROUND_QUERY = "\x1b]11;?\x07";
const OSC_BACKGROUND_RESPONSE_PREFIX = "\x1b]11;";
const APPEARANCE_QUERY_TIMEOUT_MS = 200;

type AppearanceRequest = {
  resolve: (appearance: Appearance) => void;
  timer: ReturnType<typeof setTimeout>;
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
  process.stdout.write(REQUEST_COLOR_SCHEME + OSC_BACKGROUND_QUERY);

  return promise;
}

export function configureAppearanceSession(mode: AppearanceMode): void {
  sessionActive = true;
  appearanceOverride = mode;
  disableColorSchemeUpdates();
  cancelAppearanceRequest();

  if (mode === "auto") {
    setAppearance("unknown");
    enableColorSchemeUpdates();
    return;
  }

  setAppearance(mode);
}

export function cleanupAppearanceSession(): void {
  sessionActive = false;
  disableColorSchemeUpdates();
  cancelAppearanceRequest();
}

export function stripAppearanceResponses(data: string): string {
  if (data.length === 0) return data;

  const chunk = appearanceInputBuffer + data;
  appearanceInputBuffer = "";

  let cursor = 0;
  let passthrough = "";

  while (cursor < chunk.length) {
    const escapeIndex = chunk.indexOf("\x1b", cursor);
    if (escapeIndex === -1) {
      passthrough += chunk.slice(cursor);
      break;
    }

    passthrough += chunk.slice(cursor, escapeIndex);
    const remainder = chunk.slice(escapeIndex);

    if (remainder.startsWith(COLOR_SCHEME_DARK)) {
      handleDetectedAppearance("dark");
      cursor = escapeIndex + COLOR_SCHEME_DARK.length;
      continue;
    }

    if (remainder.startsWith(COLOR_SCHEME_LIGHT)) {
      handleDetectedAppearance("light");
      cursor = escapeIndex + COLOR_SCHEME_LIGHT.length;
      continue;
    }

    if (remainder.startsWith(OSC_BACKGROUND_RESPONSE_PREFIX)) {
      const responseEnd = findOscTerminator(
        chunk,
        escapeIndex + OSC_BACKGROUND_RESPONSE_PREFIX.length,
      );
      if (responseEnd === -1) {
        appearanceInputBuffer = remainder;
        return passthrough;
      }

      const detected = parseAppearanceResponse(chunk.slice(escapeIndex, responseEnd));
      if (detected) {
        handleStartupFallbackAppearance(detected);
      }
      cursor = responseEnd;
      continue;
    }

    if (
      COLOR_SCHEME_DARK.startsWith(remainder) ||
      COLOR_SCHEME_LIGHT.startsWith(remainder) ||
      OSC_BACKGROUND_RESPONSE_PREFIX.startsWith(remainder)
    ) {
      appearanceInputBuffer = remainder;
      return passthrough;
    }

    passthrough += chunk[escapeIndex];
    cursor = escapeIndex + 1;
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

function enableColorSchemeUpdates(): void {
  if (!process.stdout.isTTY || colorSchemeUpdatesEnabled) return;
  process.stdout.write(ENABLE_COLOR_SCHEME_UPDATES);
  colorSchemeUpdatesEnabled = true;
}

function disableColorSchemeUpdates(): void {
  if (!process.stdout.isTTY || !colorSchemeUpdatesEnabled) return;
  process.stdout.write(DISABLE_COLOR_SCHEME_UPDATES);
  colorSchemeUpdatesEnabled = false;
}

function handleDetectedAppearance(next: Extract<Appearance, "dark" | "light">): void {
  if (appearanceRequest) {
    finishAppearanceRequest(next);
    return;
  }

  if (appearanceOverride === "auto") {
    setAppearance(next);
  }
}

function handleStartupFallbackAppearance(next: Extract<Appearance, "dark" | "light">): void {
  if (!appearanceRequest) return;
  finishAppearanceRequest(next);
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

function parseAppearanceResponse(response: string): Extract<Appearance, "dark" | "light"> | null {
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

function classifyAppearance([red, green, blue]: [number, number, number]): Extract<
  Appearance,
  "dark" | "light"
> {
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
let colorSchemeUpdatesEnabled = false;
let sessionActive = false;
