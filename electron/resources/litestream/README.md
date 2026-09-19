# Binarios Litestream

Atrium empaqueta [Litestream](https://litestream.io/) para replicar continuamente el archivo SQLite cifrado del usuario hacia una carpeta local o sincronizada que el usuario elige.

## Descargar binarios

```bash
npm run download:litestream
```

Esto descarga la versión fijada en `scripts/download-litestream.mts` para:

- `win32/litestream.exe`
- `darwin-arm64/litestream`
- `darwin-x64/litestream`
- `linux-x64/litestream`
- `linux-arm64/litestream`

Los binarios no se versionan en git. Ejecuta el script antes de `npm run dist`.

## Empaquetado

`electron-builder` copia esta carpeta a `{resources}/litestream/` mediante `extraResources` en `package.json`.
