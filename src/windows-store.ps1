$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-PlainPath([string] $Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.LinkType) {
                throw 'Redirected path'
            }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
}

$userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
function Protect-Path([string] $Path, [bool] $Directory) {
    if ($Directory) { $acl = [Security.AccessControl.DirectorySecurity]::new() }
    else { $acl = [Security.AccessControl.FileSecurity]::new() }
    $acl.SetOwner($userSid)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @($userSid, $systemSid)) {
        if ($Directory) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        } else { $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'Allow') }
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Assert-Protected([string] $Path, $Stream = $null) {
    Assert-PlainPath $Path
    if ($null -eq $Stream) { $acl = Get-Acl -LiteralPath $Path }
    else { $acl = [IO.FileSystemAclExtensions]::GetAccessControl($Stream) }
    if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $userSid.Value) { throw 'Unsafe owner or inheritance' }
    $seen = @{}
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        $sid = $rule.IdentityReference.Value
        if ($sid -notin @($userSid.Value, $systemSid.Value) -or $rule.AccessControlType -ne 'Allow' -or
            $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or $rule.IsInherited) { throw 'Unsafe ACL' }
        $seen[$sid] = $true
    }
    if (-not $seen.ContainsKey($userSid.Value) -or -not $seen.ContainsKey($systemSid.Value)) { throw 'Incomplete ACL' }
}

try {
    $request = [Console]::In.ReadLine() | ConvertFrom-Json -AsHashtable
    $root = [IO.Path]::GetFullPath([string]$request.root)
    if ($root.StartsWith('\\') -or $root -eq [IO.Path]::GetPathRoot($root)) { throw 'Unsafe root' }
    Assert-PlainPath $root
    if (-not (Test-Path -LiteralPath $root)) {
        [IO.Directory]::CreateDirectory($root) | Out-Null
        Protect-Path $root $true
    }
    Assert-Protected $root
    $name = [string]$request.name
    if ($name -notmatch '^(host|labels|[0-9a-f]{64})\.(json|lock)$') { throw 'Invalid filename' }
    $path = Join-Path $root $name
    Assert-PlainPath $path
    if ($request.operation -eq 'lock') {
        if (-not $name.EndsWith('.lock')) { throw 'Invalid lock filename' }
        if (-not (Test-Path -LiteralPath $path)) {
            $temp = Join-Path $root ([Guid]::NewGuid().ToString('N') + '.tmp')
            try {
                $empty = [IO.File]::Open($temp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
                $empty.Dispose()
                Protect-Path $temp $false
                Assert-Protected $temp
                try { [IO.File]::Move($temp, $path, $false) }
                catch [IO.IOException] { if (-not (Test-Path -LiteralPath $path)) { throw } }
            } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force } }
        }
        $held = $null
        $deadline = [DateTime]::UtcNow.AddSeconds(10)
        while ($null -eq $held) {
            Assert-PlainPath $path
            try { $held = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
            catch [IO.IOException] {
                $win32 = $_.Exception.GetBaseException().HResult -band 0xffff
                if ($win32 -notin @(32, 33) -or [DateTime]::UtcNow -ge $deadline) { throw }
                Start-Sleep -Milliseconds 40
            }
        }
        try {
            Assert-Protected $path $held
            [Console]::Out.WriteLine('{"locked":true}')
            [Console]::Out.Flush()
            # EOF also releases the OS handle when the owning Node process dies.
            $release = [Console]::In.ReadLine()
            if ($null -ne $release -and $release -ne 'release') { throw 'Invalid release' }
        } finally { $held.Dispose() }
    } elseif ($request.operation -eq 'read') {
        if (-not $name.EndsWith('.json')) { throw 'Invalid data filename' }
        if (-not (Test-Path -LiteralPath $path)) { [Console]::Out.Write('null'); exit 0 }
        Assert-Protected $path
        $info = Get-Item -LiteralPath $path
        if ($info.Length -gt 1048576) { throw 'Oversize file' }
        [Console]::Out.Write([IO.File]::ReadAllText($path))
    } elseif ($request.operation -eq 'write') {
        if (-not $name.EndsWith('.json')) { throw 'Invalid data filename' }
        if (Test-Path -LiteralPath $path) { Assert-Protected $path }
        $temp = Join-Path $root ([Guid]::NewGuid().ToString('N') + '.tmp')
        try {
            $stream = [IO.File]::Open($temp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            $stream.Dispose()
            Protect-Path $temp $false
            Assert-Protected $temp
            $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($request.data | ConvertTo-Json -Depth 12 -Compress))
            $stream = [IO.File]::Open($temp, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try { $stream.Write($bytes); $stream.Flush($true) } finally { $stream.Dispose() }
            Assert-PlainPath $path
            if (Test-Path -LiteralPath $path) { Assert-Protected $path }
            [IO.File]::Move($temp, $path, $true)
            Assert-Protected $path
            [Console]::Out.Write('null')
        } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force } }
    } else { throw 'Invalid operation' }
} catch {
    [Console]::Error.Write('Estado Relay recusado: proteção ou operação inválida.')
    exit 1
}
