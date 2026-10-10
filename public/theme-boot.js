(function () {
  var d = document.documentElement;

  try {
    // Keep these values synchronized with @/lib/themes.
    var THEME_KEY = 'tijwa-theme';
    var THEME_DEFAULT = 'default';
    var THEMES = ['default'];

    var savedTheme = localStorage.getItem(THEME_KEY);

    d.dataset.theme =
      THEMES.indexOf(savedTheme) !== -1 ? savedTheme : THEME_DEFAULT;

    var MODE_KEY = 'tijwa-mode';
    var MODE_DEFAULT = 'system';
    var MODES = ['light', 'dark', 'system'];

    var savedMode = localStorage.getItem(MODE_KEY);

    d.dataset.mode = MODES.indexOf(savedMode) !== -1 ? savedMode : MODE_DEFAULT;
  } catch (_e) {
    d.dataset.theme = 'default';
    d.dataset.mode = 'system';
  }
})();
