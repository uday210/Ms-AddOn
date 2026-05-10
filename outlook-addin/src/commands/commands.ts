/* global Office */

Office.onReady(() => {
  // ribbon command handlers go here
});

function openTaskpane(event: Office.AddinCommands.Event) {
  Office.addin.showAsTaskpane();
  event.completed();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).openTaskpane = openTaskpane;
