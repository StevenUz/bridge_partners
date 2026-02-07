param(
  [Parameter(Mandatory = $true)]
  [string]$DbUrl,

  [string[]]$Versions = @(
    "20260204150929",
    "20260204150952",
    "20260204151024",
    "20260204151057",
    "20260204151353",
    "20260204152508",
    "20260204152640",
    "20260204152705",
    "20260204152938",
    "20260204153040",
    "20260204153253",
    "20260204153402",
    "20260204162228",
    "20260204162243",
    "20260204162906",
    "20260204162921",
    "20260204164413",
    "20260204193729",
    "20260204193822",
    "20260204194111",
    "20260204194134",
    "20260204200500",
    "20260204200552",
    "20260204201228",
    "20260204201836"
  )
)

$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Error "SUPABASE_ACCESS_TOKEN is not set. Create a token in the Supabase dashboard (Account Settings > Access Tokens) and set it in your environment."
  exit 1
}

if (-not $env:SUPABASE_DB_PASSWORD) {
  Write-Error "SUPABASE_DB_PASSWORD is not set. Use your project's database password (Project Settings > Database) and set it in your environment."
  exit 1
}

$npxCmd = (Get-Command npx.cmd -ErrorAction SilentlyContinue).Source
if (-not $npxCmd) {
  $npxCmd = (Get-Command npx -ErrorAction Stop).Source
}

foreach ($version in $Versions) {
  Write-Host "Repairing migration $version (reverted)..."
  & $npxCmd --yes --package supabase -- supabase migration repair --status reverted $version --db-url $DbUrl | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase migration repair failed for $version (exit code $LASTEXITCODE)."
  }
}

Write-Host "Done. Migration history repaired."
