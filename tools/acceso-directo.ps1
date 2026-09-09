# Crea el acceso directo de Flow en el Escritorio.
#
#   powershell -ExecutionPolicy Bypass -File tools\acceso-directo.ps1
#
# Vuelve a correrlo si mueves la carpeta del proyecto: el acceso directo
# guarda rutas absolutas y deja de funcionar al moverla.
#
# Apunta a electron.exe directamente en vez de a "npm start" a proposito:
# npm abriria una ventana de consola detras de la app. electron.exe es un
# ejecutable de interfaz grafica y arranca sin consola.

$app = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $app "node_modules\electron\dist\electron.exe"
$icono = Join-Path $app "app\assets\flow.ico"

if (-not (Test-Path $electron)) {
    Write-Output "Falta electron.exe. Corre 'npm install' primero."
    exit 1
}
if (-not (Test-Path $icono)) {
    Write-Output "Falta app\assets\flow.ico. Corre 'electron tools/logos.js' primero."
    exit 1
}

$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) "Flow.lnk"

$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = $electron
$s.Arguments = '"' + $app + '"'
$s.WorkingDirectory = $app
$s.IconLocation = $icono + ",0"
$s.Description = "Flow - centro de mando de poker"
$s.WindowStyle = 1
$s.Save()

if (Test-Path $lnk) {
    Write-Output "Listo: $lnk"
} else {
    Write-Output "No se pudo crear el acceso directo."
    exit 1
}
