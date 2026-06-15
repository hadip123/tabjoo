browser.commands.onCommand.addListener((command) => {
  if (command === "_execute_action") {
    browser.action.openPopup();
  }
});
