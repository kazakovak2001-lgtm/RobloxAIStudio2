param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('ListWindows', 'Status', 'Capture', 'Click', 'TypeText', 'PressKey')]
    [string]$Action,
    [int]$TargetPid = 0,
    [string]$OutputPath,
    [int]$MaxWidth = 1024,
    [int]$MaxHeight = 768,
    [int]$X,
    [int]$Y,
    [int]$ScreenshotWidth,
    [int]$ScreenshotHeight,
    [int]$ExpectedLeft,
    [int]$ExpectedTop,
    [int]$ExpectedWidth,
    [int]$ExpectedHeight,
    [ValidateSet('left', 'double_left')]
    [string]$Button = 'left',
    [string]$Text,
    [ValidateSet('TAB', 'SHIFT_TAB', 'ENTER', 'ESCAPE', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'F5', 'SHIFT_F5', 'CTRL_F')]
    [string]$Key
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class StudioDesktopNative {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint Type;
        public InputUnion Data;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT Mouse;
        [FieldOffset(0)] public KEYBDINPUT Keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int Dx;
        public int Dy;
        public uint MouseData;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint attachThread, uint attachToThread, bool attach);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maximumCount);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint count, INPUT[] inputs, int size);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr deviceContext, uint flags);

    public static void SendUnicode(string value) {
        var inputs = new List<INPUT>();
        foreach (char character in value) {
            inputs.Add(new INPUT {
                Type = 1,
                Data = new InputUnion {
                    Keyboard = new KEYBDINPUT { ScanCode = character, Flags = 0x0004 }
                }
            });
            inputs.Add(new INPUT {
                Type = 1,
                Data = new InputUnion {
                    Keyboard = new KEYBDINPUT { ScanCode = character, Flags = 0x0004 | 0x0002 }
                }
            });
        }
        if (inputs.Count > 0 && SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT))) != inputs.Count) {
            throw new InvalidOperationException("Windows did not accept the complete text input sequence.");
        }
    }

    public static void SendLeftClick() {
        var inputs = new[] {
            new INPUT {
                Type = 0,
                Data = new InputUnion { Mouse = new MOUSEINPUT { Flags = 0x0002 } }
            },
            new INPUT {
                Type = 0,
                Data = new InputUnion { Mouse = new MOUSEINPUT { Flags = 0x0004 } }
            }
        };
        if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) != inputs.Length) {
            throw new InvalidOperationException("Windows did not accept the complete mouse input sequence.");
        }
    }

    public static void EnableDpiAwareness() {
        try {
            if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return;
        } catch (EntryPointNotFoundException) {
        }
        SetProcessDPIAware();
    }
}
'@

[StudioDesktopNative]::EnableDpiAwareness()

function Get-EligibleStudioWindows {
    $versionsRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Roblox\Versions'))
    $windows = [System.Collections.Generic.List[object]]::new()
    $callback = [StudioDesktopNative+EnumWindowsProc]{
        param([IntPtr]$handle, [IntPtr]$parameter)
        if (-not [StudioDesktopNative]::IsWindowVisible($handle)) { return $true }
        [uint32]$processId = 0
        [StudioDesktopNative]::GetWindowThreadProcessId($handle, [ref]$processId) | Out-Null
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            if ($process.ProcessName -ne 'RobloxStudioBeta') { return $true }
            if ($process.MainWindowHandle -ne $handle) { return $true }
            $executable = [System.IO.Path]::GetFullPath($process.Path)
            if (-not $executable.StartsWith($versionsRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
            if ([System.IO.Path]::GetFileName($executable) -ne 'RobloxStudioBeta.exe') { return $true }
            $rect = [StudioDesktopNative+RECT]::new()
            if (-not [StudioDesktopNative]::GetWindowRect($handle, [ref]$rect)) { return $true }
            $title = [System.Text.StringBuilder]::new(512)
            [StudioDesktopNative]::GetWindowText($handle, $title, $title.Capacity) | Out-Null
            $windows.Add([pscustomobject]@{
                Handle = $handle
                Pid = [int]$processId
                Title = $title.ToString()
                Executable = $executable
                Minimized = [StudioDesktopNative]::IsIconic($handle)
                Left = $rect.Left
                Top = $rect.Top
                Width = $rect.Right - $rect.Left
                Height = $rect.Bottom - $rect.Top
            })
        } catch {
            return $true
        }
        return $true
    }
    [StudioDesktopNative]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
    return @($windows)
}

function Get-EligibleStudioWindow([int]$requestedPid = 0) {
    $windows = @(Get-EligibleStudioWindows)
    if ($windows.Count -eq 0) { throw 'No eligible Roblox Studio window is open.' }
    if ($requestedPid -gt 0) {
        $pidMatches = @($windows | Where-Object { $_.Pid -eq $requestedPid })
        if ($pidMatches.Count -ne 1) { throw "PID $requestedPid is not an eligible Roblox Studio main window." }
        return $pidMatches[0]
    }
    $foregroundHandle = [StudioDesktopNative]::GetForegroundWindow()
    $foregroundMatches = @($windows | Where-Object { $_.Handle -eq $foregroundHandle })
    if ($foregroundMatches.Count -eq 1) { return $foregroundMatches[0] }
    if ($windows.Count -ne 1) {
        $eligiblePids = ($windows | ForEach-Object { $_.Pid }) -join ', '
        throw "Multiple Roblox Studio windows are open and none is foreground; specify one eligible PID: $eligiblePids."
    }
    return $windows[0]
}

function Focus-StudioWindow([object]$window) {
    if ($window.Minimized) {
        [StudioDesktopNative]::ShowWindowAsync($window.Handle, 9) | Out-Null
        Start-Sleep -Milliseconds 350
    }
    [uint32]$foregroundProcessId = 0
    [uint32]$targetProcessId = 0
    $foregroundThread = [StudioDesktopNative]::GetWindowThreadProcessId([StudioDesktopNative]::GetForegroundWindow(), [ref]$foregroundProcessId)
    $targetThread = [StudioDesktopNative]::GetWindowThreadProcessId($window.Handle, [ref]$targetProcessId)
    $currentThread = [StudioDesktopNative]::GetCurrentThreadId()
    $attachedForeground = $foregroundThread -ne 0 -and $foregroundThread -ne $currentThread -and [StudioDesktopNative]::AttachThreadInput($currentThread, $foregroundThread, $true)
    $attachedTarget = $targetThread -ne 0 -and $targetThread -ne $currentThread -and $targetThread -ne $foregroundThread -and [StudioDesktopNative]::AttachThreadInput($currentThread, $targetThread, $true)
    try {
        [StudioDesktopNative]::BringWindowToTop($window.Handle) | Out-Null
        [StudioDesktopNative]::SetForegroundWindow($window.Handle) | Out-Null
    } finally {
        if ($attachedTarget) { [StudioDesktopNative]::AttachThreadInput($currentThread, $targetThread, $false) | Out-Null }
        if ($attachedForeground) { [StudioDesktopNative]::AttachThreadInput($currentThread, $foregroundThread, $false) | Out-Null }
    }
    Start-Sleep -Milliseconds 250
    if ([StudioDesktopNative]::GetForegroundWindow() -ne $window.Handle) {
        throw 'Roblox Studio could not be made the foreground window; no input or capture was performed.'
    }
    return Get-EligibleStudioWindow $window.Pid
}

function Assert-StudioForeground([object]$window) {
    if ([StudioDesktopNative]::GetForegroundWindow() -ne $window.Handle) {
        throw 'Roblox Studio lost foreground focus; no input was performed.'
    }
}

function Assert-ExpectedWindowBounds([object]$window) {
    if ($ExpectedWidth -lt 1 -or $ExpectedHeight -lt 1) {
        throw 'Input requires bounds from a verified Studio screenshot.'
    }
    if ($window.Left -ne $ExpectedLeft -or $window.Top -ne $ExpectedTop -or $window.Width -ne $ExpectedWidth -or $window.Height -ne $ExpectedHeight) {
        throw 'Roblox Studio window bounds changed after screenshot verification; no input was performed.'
    }
}

function Convert-Status([object]$window) {
    return [ordered]@{
        pid = $window.Pid
        title = $window.Title
        executable = $window.Executable
        minimized = $window.Minimized
        foreground = ([StudioDesktopNative]::GetForegroundWindow() -eq $window.Handle)
        bounds = [ordered]@{
            left = $window.Left
            top = $window.Top
            width = $window.Width
            height = $window.Height
        }
    }
}

if ($Action -eq 'ListWindows') {
    $windows = @(Get-EligibleStudioWindows)
    ConvertTo-Json -InputObject @($windows | ForEach-Object { Convert-Status $_ }) -Compress -Depth 5
    exit 0
}

$window = Get-EligibleStudioWindow $TargetPid

if ($Action -eq 'Status') {
    Convert-Status $window | ConvertTo-Json -Compress -Depth 5
    exit 0
}

if ($Action -eq 'Capture') {
    if ([string]::IsNullOrWhiteSpace($OutputPath)) { throw 'Capture requires OutputPath.' }
    if ($MaxWidth -lt 1 -or $MaxWidth -gt 1024 -or $MaxHeight -lt 1 -or $MaxHeight -gt 768) { throw 'Capture dimensions exceed the 1024x768 safety boundary.' }
    if ($window.Minimized) { throw 'Roblox Studio is minimized; restore it before read-only capture.' }
    if ($window.Width -lt 1 -or $window.Height -lt 1) { throw 'Roblox Studio has invalid window bounds.' }
    $scale = [Math]::Min(1.0, [Math]::Min($MaxWidth / $window.Width, $MaxHeight / $window.Height))
    $targetWidth = [Math]::Max(1, [int][Math]::Round($window.Width * $scale))
    $targetHeight = [Math]::Max(1, [int][Math]::Round($window.Height * $scale))
    $source = [System.Drawing.Bitmap]::new($window.Width, $window.Height)
    $sourceGraphics = [System.Drawing.Graphics]::FromImage($source)
    $target = [System.Drawing.Bitmap]::new($targetWidth, $targetHeight)
    $targetGraphics = [System.Drawing.Graphics]::FromImage($target)
    try {
        $deviceContext = $sourceGraphics.GetHdc()
        try {
            if (-not [StudioDesktopNative]::PrintWindow($window.Handle, $deviceContext, 2)) {
                throw 'Windows could not capture the verified Roblox Studio window.'
            }
        } finally {
            $sourceGraphics.ReleaseHdc($deviceContext)
        }
        $targetGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $targetGraphics.DrawImage($source, 0, 0, $targetWidth, $targetHeight)
        $parent = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($OutputPath))
        [System.IO.Directory]::CreateDirectory($parent) | Out-Null
        $target.Save([System.IO.Path]::GetFullPath($OutputPath), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $targetGraphics.Dispose()
        $target.Dispose()
        $sourceGraphics.Dispose()
        $source.Dispose()
    }
    $result = Convert-Status $window
    $result.imageWidth = $targetWidth
    $result.imageHeight = $targetHeight
    $result.outputPath = [System.IO.Path]::GetFullPath($OutputPath)
    $result | ConvertTo-Json -Compress -Depth 5
    exit 0
}

$window = Focus-StudioWindow $window
Assert-ExpectedWindowBounds $window

if ($Action -eq 'Click') {
    if ($ScreenshotWidth -lt 1 -or $ScreenshotWidth -gt 1024 -or $ScreenshotHeight -lt 1 -or $ScreenshotHeight -gt 768) { throw 'Invalid screenshot dimensions.' }
    if ($X -lt 0 -or $X -ge $ScreenshotWidth -or $Y -lt 0 -or $Y -ge $ScreenshotHeight) { throw 'Click coordinates are outside the referenced screenshot.' }
    $screenX = $window.Left + [int][Math]::Floor(($X + 0.5) * $window.Width / $ScreenshotWidth)
    $screenY = $window.Top + [int][Math]::Floor(($Y + 0.5) * $window.Height / $ScreenshotHeight)
    if ($screenX -lt $window.Left -or $screenX -ge ($window.Left + $window.Width) -or $screenY -lt $window.Top -or $screenY -ge ($window.Top + $window.Height)) { throw 'Mapped click escaped the Roblox Studio window.' }
    Assert-StudioForeground $window
    if (-not [StudioDesktopNative]::SetCursorPos($screenX, $screenY)) {
        throw 'Windows could not position the cursor inside Roblox Studio; no click was performed.'
    }
    Assert-StudioForeground $window
    [StudioDesktopNative]::SendLeftClick()
    if ($Button -eq 'double_left') {
        Start-Sleep -Milliseconds 90
        [StudioDesktopNative]::SendLeftClick()
    }
    Convert-Status (Get-EligibleStudioWindow $window.Pid) | ConvertTo-Json -Compress -Depth 5
    exit 0
}

if ($Action -eq 'TypeText') {
    if ([string]::IsNullOrEmpty($Text) -or $Text.Length -gt 2000) { throw 'Text must contain 1 to 2000 characters.' }
    if ($Text -match '[\x00-\x1F\x7F]') { throw 'Control characters are not accepted.' }
    Assert-StudioForeground $window
    [StudioDesktopNative]::SendUnicode($Text)
    Convert-Status (Get-EligibleStudioWindow $window.Pid) | ConvertTo-Json -Compress -Depth 5
    exit 0
}

if ($Action -eq 'PressKey') {
    $sequences = @{
        TAB = '{TAB}'
        SHIFT_TAB = '+{TAB}'
        ENTER = '{ENTER}'
        ESCAPE = '{ESC}'
        UP = '{UP}'
        DOWN = '{DOWN}'
        LEFT = '{LEFT}'
        RIGHT = '{RIGHT}'
        F5 = '{F5}'
        SHIFT_F5 = '+{F5}'
        CTRL_F = '^f'
    }
    if (-not $sequences.ContainsKey($Key)) { throw 'The requested key is not allowlisted.' }
    Assert-StudioForeground $window
    [System.Windows.Forms.SendKeys]::SendWait($sequences[$Key])
    Convert-Status (Get-EligibleStudioWindow $window.Pid) | ConvertTo-Json -Compress -Depth 5
    exit 0
}

throw 'Unsupported action.'
