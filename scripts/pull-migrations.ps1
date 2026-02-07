param(
  [string]$ProjectRef = "jfddwgrnpqcajllmiiak",
  [string]$DbUrl
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

Write-Host "Linking Supabase project $ProjectRef..."
$linkArgs = @('supabase','link','--project-ref',$ProjectRef,'--password',$env:SUPABASE_DB_PASSWORD,'--yes')
& $npxCmd --yes --package supabase -- @linkArgs | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Supabase link failed (exit code $LASTEXITCODE)."
}

Write-Host "Pulling remote schema into local migrations..."
$pullArgs = @('supabase','db','pull','--schema','public')
if ($DbUrl) { $pullArgs += @('--db-url',$DbUrl) }
& $npxCmd --yes --package supabase -- @pullArgs | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Supabase db pull failed (exit code $LASTEXITCODE)."
}

Write-Host "Done. Migrations are in supabase/migrations."
