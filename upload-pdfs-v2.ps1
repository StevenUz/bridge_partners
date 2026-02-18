# Supabase Storage Upload Script -v2
# Use direct HTTP PUT method instead of POST

$supabaseUrl = "https://jfddwgrnpqcajllmiiak.supabase.co"
$publishableKey = "sb_publishable_cJq68cVntyuN-k8YlSe5Zg_pDo-oGux"
$bucketName = "bridge-documents"
$imgDir = "img"

$pdfFiles = @(
    "2007LawsCompleteBg.pdf",
    "BridgeBasicsHandout.pdf",
    "Laws of bridge.pdf"
)

$headers = @{
    "apikey" = $publishableKey
    "Authorization" = "Bearer $publishableKey"
    "Content-Type" = "application/octet-stream"
}

Write-Host "Attempting to upload PDF files to Supabase Storage..."
Write-Host "Bucket: $bucketName"
Write-Host ""

$successCount = 0
$failCount = 0

# Upload each PDF file using PUT method
foreach ($file in $pdfFiles) {
    $filePath = Join-Path -Path $imgDir -ChildPath $file
    
    if (-not (Test-Path $filePath)) {
        Write-Host "File not found: $file"
        $failCount++
        continue
    }

    Write-Host "Uploading: $file"
    
    $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
    $fileSize = $fileBytes.Length
    
    # Use PUT method for upload
    $uploadUrl = "$supabaseUrl/storage/v1/object/$bucketName/$file"
    
    try {
        $response = Invoke-WebRequest `
            -Uri $uploadUrl `
            -Method PUT `
            -Headers $headers `
            -Body $fileBytes `
            -UseBasicParsing -ErrorAction Stop
        
        Write-Host "  Status: $($response.StatusCode) - Success!"
        $successCount++
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.Value__
        Write-Host "  Status: $statusCode - Failed: $($_.Exception.Message)"
        $failCount++
    }
}

Write-Host ""
Write-Host "Upload Summary:"
Write-Host "  Successful: $successCount"
Write-Host "  Failed: $failCount"
Write-Host "  Total: $($successCount + $failCount)"
