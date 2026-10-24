#requires -Version 7.0
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$checker = Join-Path $PSScriptRoot 'check.ps1'
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$fixture = Join-Path $tempBase ('jarvis-check-' + [guid]::NewGuid().ToString('N'))
$engine = (Get-Process -Id $PID).Path
$passed = 0

function Assert-Check([string]$Name, [int]$Expected, [string]$Diagnostic = '') {
    $output = & $engine -NoProfile -File $checker -Root $fixture 2>&1
    if ($LASTEXITCODE -ne $Expected -or
        ($Diagnostic -and ($output -join "`n") -notmatch [regex]::Escape($Diagnostic))) {
        throw "${Name}: expected exit $Expected and '$Diagnostic'; got $LASTEXITCODE`: $output"
    }
    $script:passed++
    Write-Output "PASS: $Name"
}

try {
    $null = New-Item -ItemType Directory -Path $fixture
    $null = New-Item -ItemType Directory -Path (Join-Path $fixture 'docs')
    $null = New-Item -ItemType Directory -Path (Join-Path $fixture 'scripts')
    $null = New-Item -ItemType Directory -Path (Join-Path $fixture '.codex')
    foreach ($relative in @('README.md', 'PRODUCT.md', 'AGENTS.md', 'CLAUDE.md',
        'docs/architecture.md', 'docs/design.md', 'docs/onboarding.md', 'docs/quality.md', 'docs/setup.md')) {
        [IO.File]::WriteAllText((Join-Path $fixture $relative), "# Synthetic document`n")
    }
    $config = Join-Path $fixture '.codex/config.toml'
    $definition = "[mcp_servers.context7]`n" + 'url = "https://mcp.context7.com/mcp"' + "`n"
    [IO.File]::WriteAllText($config, $definition)
    $readme = Join-Path $fixture 'README.md'
    $custom = "# Custom content`n`n[Product](PRODUCT.md)`n"
    [IO.File]::WriteAllText($readme, $custom)
    Assert-Check 'valid foundation' 0
    Assert-Check 'repeat preserves custom content' 0
    if ([IO.File]::ReadAllText($readme) -cne $custom) { throw 'Checker mutated custom content' }

    $product = Join-Path $fixture 'PRODUCT.md'
    Remove-Item -LiteralPath $product
    Assert-Check 'missing document rejected' 1 'Missing document'
    [IO.File]::WriteAllText($product, '')
    Assert-Check 'empty document rejected' 1 'Empty document'
    [IO.File]::WriteAllText($product, "# Product`n")

    foreach ($case in @(
        @{ Name = 'template marker'; Content = "# TBD`n"; Diagnostic = 'Template marker' },
        @{ Name = 'broken link'; Content = "[Missing](missing.md)`n"; Diagnostic = 'Broken local link' },
        @{ Name = 'escaping link'; Content = "[Outside](../outside.md)`n"; Diagnostic = 'Link leaves repository' },
        @{ Name = 'trailing whitespace'; Content = "# Document `n"; Diagnostic = 'Trailing whitespace' }
    )) {
        [IO.File]::WriteAllText($readme, $case.Content)
        Assert-Check ($case.Name + ' rejected') 1 $case.Diagnostic
    }
    [IO.File]::WriteAllText($readme, "[Product](<PRODUCT.md>)`n[Remote](https://example.invalid)`n[Anchor](#scope)`n")
    Assert-Check 'angle links and excluded remote/anchor targets' 0
    $scriptFile = Join-Path $fixture 'scripts/sample.ps1'
    [IO.File]::WriteAllText($scriptFile, 'function Broken {')
    Assert-Check 'PowerShell syntax rejected' 1 'PowerShell syntax'
    [IO.File]::WriteAllText($scriptFile, "Write-Output 'valid'`n")
    [IO.File]::WriteAllText($config, $definition + $definition)
    Assert-Check 'duplicate MCP definition rejected' 1 'Context7 configuration differs'
    [IO.File]::WriteAllText($config, ($definition -replace '/mcp"', '/other"'))
    Assert-Check 'changed MCP endpoint rejected' 1 'Context7 configuration differs'
    [IO.File]::WriteAllText($config, $definition)
    Assert-Check 'restored foundation' 0
    Write-Output "PASS: $passed checker self-tests."
} finally {
    # Delete only the unique owned directory after verifying its resolved parent/name.
    if (Test-Path -LiteralPath $fixture) {
        $resolved = (Resolve-Path -LiteralPath $fixture).Path
        if ([IO.Path]::GetDirectoryName($resolved).TrimEnd('\', '/') -cne $tempBase.TrimEnd('\', '/') -or
            [IO.Path]::GetFileName($resolved) -notmatch '^jarvis-check-[a-f0-9]{32}$') {
            throw 'Refusing cleanup outside the owned temporary fixture'
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
