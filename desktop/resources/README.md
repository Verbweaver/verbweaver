# Desktop Application Icons

This directory should contain the following icon files:

## Required Icons

### Windows
- `icon.ico` - Windows icon file (256x256 recommended)

### macOS  
- `icon.icns` - macOS icon file (512x512 recommended)

### Linux
- `icon.png` - PNG icon (512x512 recommended)

## Icon Generation

You can use tools like:
- [Electron Icon Builder](https://www.npmjs.com/package/electron-icon-builder)
- [Icon Generator](https://www.electronforge.io/guides/create-and-add-icons)

To generate icons from a single source image:

```bash
npm install -g electron-icon-builder
electron-icon-builder --input=icon.png --output=./
```

## Temporary Placeholder

For development, you can create a simple placeholder icon or download one from:
- [Placeholder Icons](https://placeholder.com/)
- [Icon Archive](https://iconarchive.com/)

Make sure to replace with your actual application icon before distribution. 