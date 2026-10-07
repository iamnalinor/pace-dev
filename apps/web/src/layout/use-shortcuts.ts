import { useEffect, useRef } from "react";
import { useMatch, useNavigate } from "react-router";

import { useServices } from "#web/app-state.tsx";
import { COMPOSER_INPUT_ID } from "#web/features/composer/composer.tsx";
import { useCompleteTask } from "#web/shared/task/use-complete-task.ts";

/** Typing in a field never triggers a shortcut. */
const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

type Handlers = Readonly<Record<string, () => void>>;

/**
The keyboard on wide screens: `j`/`k` walk the Now list (opening each task in the pane),
`x` marks the open task done, `n` focuses the composer, `Esc` closes the pane, `?` opens
the list of shortcuts.
*/
export const useShortcuts = (onHelp: () => void): void => {
  const navigate = useNavigate();
  const complete = useCompleteTask();
  const rows = useServices().hooks.useNow().rows;
  const taskId = useMatch("/task/:id")?.params.id ?? null;
  const step = (delta: number): void => {
    const index = rows.findIndex((row) => row.id === taskId);
    const next = rows.at(index === -1 ? (delta > 0 ? 0 : -1) : (index + delta) % rows.length);
    if (next !== undefined) {
      void navigate(`/task/${next.id}`);
    }
  };
  const handlers: Handlers = {
    "?": onHelp,
    Escape: () => {
      if (taskId !== null) {
        void navigate("/");
      }
    },
    j: () => {
      step(1);
    },
    k: () => {
      step(-1);
    },
    n: () => {
      const input = document.querySelector<HTMLInputElement>(`#${COMPOSER_INPUT_ID}`);
      if (input === null) {
        void navigate("/add");
      } else {
        input.focus();
      }
    },
    x: () => {
      const row = rows.find((candidate) => candidate.id === taskId);
      if (row !== undefined) {
        void complete({ id: row.id, title: row.title });
      }
    },
  };
  // The listener is added once; it always reads the latest handlers.
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) {
        return;
      }
      const handler = latest.current[event.key];
      if (handler === undefined) {
        return;
      }

      event.preventDefault();
      handler();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
    };
  }, []);
};
