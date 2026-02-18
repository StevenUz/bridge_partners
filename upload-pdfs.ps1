# Supabase Storage Upload Script
$supabaseUrl = "https://jfddwgrnpqcajllmiiak.supabase.co"
$publishableKey = "sb_publishable_cJq68cVntyuN-k8YlSe5Zg_pDo-oGux"
$bucketName = "bridge-documents"
$imgDir = "img"

$pdfFiles = @(
    "2007LawsCompleteBg.pdf",
    "BridgeBasicsHandout.pdf",
    "Laws of bridge.pdf",
    "Въведение в Спортния Бридж.pdf"
)

$headers = @{
    "apikey" = $publishableKey
    "Authorization" = "Bearer $publishableKey"
}

# Try to create bucket
Write-Host "Creating bucket '$bucketName'..."
try {
    $response = Invoke-WebRequest `
        -Uri "$supabaseUrl/rest/v1/storage/buckets" `
        -Method POST `
        -Headers $headers `
        -ContentType "application/json" `
        -Body (ConvertTo-Json @{ name = $bucketName; public = $true }) `
        -ErrorAction SilentlyContinue
    Write-Host "Bucket created or already exists"
} catch {
    Write-Host "Bucket status check: $($_.Exception.Message)"
}

# Upload each PDF file
foreach ($file in $pdfFiles) {
    $filePath = Join-Path -Path $imgDir -ChildPath $file
    
    if (-not (Test-Path $filePath)) {
        Write-Host "File not found: $file"
        continue
    }

    Write-Host "Uploading '$file'..."
    
    $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
    $encodedFileName = [System.Web.HttpUtility]::UrlEncode($file)
    $uploadUrl = "$supabaseUrl/storage/v1/object/$bucketName/$encodedFileName"
    
    try {
        $response = Invoke-WebRequest `
            -Uri $uploadUrl `
            -Method POST `
            -Headers $headers `
            -Body $fileBytes
        Write-Host "Successfully uploaded: $file"
    } catch {
        Write-Host "Error uploading $file : $($_.Exception.Message)"
    }
}

Write-Host "PDF upload process completed!"
