// utils.js

/**
 * Shorthand for document.getElementById
 * @param {string} id The ID of the element to find.
 * @returns {HTMLElement | null}
 */
export const $ = (id) => document.getElementById(id);

/**
 * Shorthand for document.querySelector
 * @param {string} selector The CSS selector.
 * @returns {HTMLElement | null}
 */
export const sel = (selector) => document.querySelector(selector);

/**
 * Shorthand for document.querySelectorAll
 * @param {string} selector The CSS selector.
 * @returns {NodeListOf<HTMLElement>}
 */
export const selAll = (selector) => document.querySelectorAll(selector);

/**
 * Escapes a string for safe HTML text/attribute insertion.
 * @param {string} value
 * @returns {string}
 */
export const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      (
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[char] || char
      )
  );

/**
 * Checks for control characters that are unsafe for command/path inputs.
 * @param {string} value
 * @returns {boolean}
 */
export const hasControlChars = (value = "") => /[\0\r\n]/.test(String(value));

/**
 * Logs a message to the session log in the Settings modal.
 * @param {string} message The message to log.
 * @param {'INFO'|'ERROR'|'SUCCESS'|'CMD'} type The type of log entry.
 */
export function log(message, type = "INFO") {
  const sessionLog = $("session-log");
  if (!sessionLog) return;
  const entry = document.createElement("div");
  entry.className = `log-entry log-${type.toLowerCase()}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] [${type}] ${message}`;
  sessionLog.appendChild(entry);
  sessionLog.scrollTop = sessionLog.scrollHeight;
}
