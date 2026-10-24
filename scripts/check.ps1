#requires -Version 7.0
[CmdletBinding()]
param([string]$Root = (Split-Path -Parent $PSScriptRoot))

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$failures = [System.Collections.Generic.List[string]]::new()
$required = @(
    'README.md', 'PRODUCT.md', 'AGENTS.md', 'CLAUDE.md',
    'docs/architecture.md', 'docs/design.md', 'docs/onboarding.md',
    'docs/quality.md', 'docs/setup.md'
)

foreach ($relative in $required) {
    $file = Join-Path $rootPath $relative
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        $failures.Add("Missing document: $relative")
    } elseif ([string]::IsNullOrWhiteSpace([IO.File]::ReadAllText($file))) {
        $failures.Add("Empty document: $relative")
    }
}

$documents = @(Get-ChildItem -LiteralPath $rootPath -File -Filter '*.md')
$docsPath = Join-Path $rootPath 'docs'
if (Test-Path -LiteralPath $docsPath -PathType Container) {
    $documents += @(Get-ChildItem -LiteralPath $docsPath -Recurse -File -Filter '*.md')
}
$scriptPath = Join-Path $rootPath 'scripts'
$scripts = @()
if (Test-Path -LiteralPath $scriptPath -PathType Container) {
    $scripts = @(Get-ChildItem -LiteralPath $scriptPath -File -Filter '*.ps1')
}

foreach ($file in @($documents) + @($scripts)) {
    $relative = [IO.Path]::GetRelativePath($rootPath, $file.FullName)
    $content = [IO.File]::ReadAllText($file.FullName)
    if ($content -match '(?m)[\t ]+\r?$') {
        $failures.Add("Trailing whitespace: $relative")
    }
    if ($file.Extension -eq '.ps1') {
        $tokens = $null
        $parseErrors = $null
        $null = [System.Management.Automation.Language.Parser]::ParseFile(
            $file.FullName, [ref]$tokens, [ref]$parseErrors
        )
        foreach ($parseError in $parseErrors) {
            $failures.Add("PowerShell syntax: ${relative}: $($parseError.Message)")
        }
        continue
    }
    if ($content -match '(?i)\[Project name\]|\[command\]|\bTODO\b|\bTBD\b|\bPLACEHOLDER\b') {
        $failures.Add("Template marker: $relative")
    }
    # Deliberately limited to inline Markdown links outside fenced code blocks.
    $prose = [regex]::Replace($content, '(?ms)^```[^\r\n]*\r?\n.*?^```[^\r\n]*(?:\r?\n|$)', '')
    foreach ($link in [regex]::Matches($prose, '\[[^\]\r\n]*\]\((?<target><[^>]+>|[^\s)]+)\)')) {
        $target = $link.Groups['target'].Value.Trim('<', '>')
        if ($target -match '^[a-zA-Z][a-zA-Z0-9+.-]*:' -or $target.StartsWith('#')) {
            continue
        }
        $target = [Uri]::UnescapeDataString(($target -split '[?#]', 2)[0])
        if ([string]::IsNullOrEmpty($target)) { continue }
        $destination = [IO.Path]::GetFullPath((Join-Path $file.DirectoryName $target))
        $local = [IO.Path]::GetRelativePath($rootPath, $destination)
        if ($local -eq '..' -or $local -match '^\.\.[/\\]' -or [IO.Path]::IsPathRooted($local)) {
            $failures.Add("Link leaves repository: ${relative}: $target")
        } elseif (!(Test-Path -LiteralPath $destination)) {
            $failures.Add("Broken local link: ${relative}: $target")
        }
    }
}

$config = Join-Path $rootPath '.codex/config.toml'
if (!(Test-Path -LiteralPath $config -PathType Leaf)) {
    $failures.Add('Missing project Context7 configuration')
} else {
    # Exact small template check, not a general TOML parser or MCP loading test.
    $lines = @([IO.File]::ReadAllLines($config) | ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and !$_.StartsWith('#') })
    if ($lines.Count -ne 2 -or $lines[0] -cne '[mcp_servers.context7]' -or
        $lines[1] -cne 'url = "https://mcp.context7.com/mcp"') {
        $failures.Add('Context7 configuration differs from the single credential-free definition; review and adapt the check for intentional changes')
    }
}

if ($failures.Count) {
    foreach ($failure in $failures) { Write-Output "FAIL: $failure" }
    exit 1
}
Write-Output "PASS: $($required.Count) canonical documents; $($documents.Count) Markdown files; $($scripts.Count) PowerShell scripts; one scoped Context7 definition."
exit 0
