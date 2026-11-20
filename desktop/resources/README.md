# Desktop resources

Packaging resources for the Electron app (`build.directories.buildResources` in `desktop/package.json`).

| File or folder | Used for |
|---|---|
| `icon.png` | Linux icon and window icon (512x512). The source for the other icons. |
| `icon.ico` | Windows icon. |
| `icon.icns` | macOS icon. |
| `icon.svg` | Vector version of the logo. |
| `generate-icon.ps1` | Old script that draws a placeholder icon; not needed for the current icons. |
| `entitlements.mac.plist` | macOS hardened-runtime entitlements used when signing. |
| `tools/<os>/<arch>/` | Pandoc and Tectonic binaries bundled into the app (stored with Git LFS). |

## Icon Generation

`icon.png` (512x512) is the source of truth. `icon.icns` must be a real ICNS
container, not a renamed PNG. Regenerate it after changing `icon.png`:

```bash
python3 -c "from PIL import Image; Image.open('icon.png').save('icon.icns')"
file icon.icns   # should report: Mac OS X icon
```

`icon.ico` can be regenerated the same way:

```bash
python3 -c "from PIL import Image; Image.open('icon.png').save('icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])"
```

On Linux, packaged builds also copy `icon.png` into the app's resources directory
(`extraResources` in `desktop/package.json`) for the window icon. The .desktop entry is
named after `desktopName` (`verbweaver.desktop`), which keeps the Wayland app_id and the
desktop entry in sync.
