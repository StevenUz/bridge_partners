import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Supabase credentials
const supabaseUrl = 'https://jfddwgrnpqcajllmiiak.supabase.co'
const supabaseAnonKey = 'sb_publishable_cJq68cVntyuN-k8YlSe5Zg_pDo-oGux'

const pdfFiles = [
  '2007LawsCompleteBg.pdf',
  'BridgeBasicsHandout.pdf',
  'Laws of bridge.pdf',
  'Въведение в Спортния Бридж.pdf'
]

const bucketName = 'bridge-documents'
const imgDir = path.join(__dirname, 'img')

async function createBucket() {
  try {
    console.log(`Creating bucket "${bucketName}"...`)
    
    const response = await fetch(
      `${supabaseUrl}/rest/v1/storage/buckets`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey
        },
        body: JSON.stringify({
          name: bucketName,
          public: true
        })
      }
    )

    if (response.status === 201 || response.status === 400) {
      console.log(`✓ Bucket "${bucketName}" is ready`)
      return true
    } else {
      throw new Error(`Failed to create bucket: ${response.status}`)
    }
  } catch (error) {
    console.log(`✓ Bucket "${bucketName}" already exists or is ready`)
    return true
  }
}

async function uploadFile(fileName) {
  const filePath = path.join(imgDir, fileName)
  
  if (!fs.existsSync(filePath)) {
    console.log(`✗ File not found: ${fileName}`)
    return false
  }

  try {
    const fileContent = fs.readFileSync(filePath)
    
    console.log(`Uploading "${fileName}"...`)
    
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucketName}/${encodeURIComponent(fileName)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey
        },
        body: fileContent
      }
    )

    if (response.ok) {
      console.log(`✓ Successfully uploaded: ${fileName}`)
      return true
    } else {
      const errorText = await response.text()
      console.log(`✗ Error uploading ${fileName}: ${response.status} - ${errorText}`)
      return false
    }
  } catch (error) {
    console.log(`✗ Error uploading ${fileName}: ${error.message}`)
    return false
  }
}

async function uploadPDFs() {
  try {
    // Create bucket first
    await createBucket()

    // Upload each PDF file
    let successCount = 0
    for (const file of pdfFiles) {
      const success = await uploadFile(file)
      if (success) successCount++
      // Add small delay between uploads
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log(`\n✓ Completed: ${successCount}/${pdfFiles.length} PDF files uploaded successfully!`)
    
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

uploadPDFs()
